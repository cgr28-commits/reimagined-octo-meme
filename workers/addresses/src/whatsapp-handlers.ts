/**
 * WhatsApp Business Platform webhook — quote assistant.
 *
 * GET  /whatsapp/webhook — Meta verification handshake (hub.challenge).
 * POST /whatsapp/webhook — signed message notifications. Customers chat to get a
 *      fixed price; the reply carries a Quick Quote link where they book and pay.
 *
 * GET  /whatsapp/connect — 360dialog only: points the number's webhook at this
 *      Worker (with the shared secret header). No key needed: it can only ever
 *      point the webhook back at this Worker, so it is safe to open; a short
 *      cooldown stops it being hammered.
 *
 * Coexistence-friendly: when the owner replies from the WhatsApp Business app
 * (smb_message_echoes), the assistant pauses for that customer so it never talks
 * over a human. Typing AGENT still hands off (not advertised: the owner wants the
 * assistant to handle quotes itself).
 *
 * Separate-number mode (WHATSAPP_TEAM_NUMBER set, e.g. a 360dialog virtual number):
 * handoffs send the customer a link to chat with the team's own WhatsApp instead,
 * and the owner gets an email.
 */

import {
  D360_WEBHOOK_SECRET_HEADER,
  parseWhatsAppWebhook,
  register360dialogWebhook,
  sendWhatsAppButtons,
  sendWhatsAppImage,
  sendWhatsAppLocation,
  sendWhatsAppText,
  update360dialogBusinessProfile,
  upload360dialogProfilePicture,
  verify360dialogWebhookSecret,
  verifyWhatsAppSignature,
  whatsAppCloudConfigured,
  whatsAppUses360dialog,
  whatsAppVerifyChallenge,
  type WhatsAppCloudEnv,
  type WhatsAppInboundMessage,
  type WhatsAppReplyButton,
} from "../shared/whatsapp-cloud";
import {
  buildWhatsAppAlternativeTimeButtons,
  buildWhatsAppUnavailableReply,
  buildWhatsAppQuoteFailedReply,
  buildWhatsAppQuestion,
  buildWhatsAppQuoteReply,
  decideWhatsAppReply,
  describeWhatsAppDraft,
  describeWhatsAppField,
  detectWhatsAppIntent,
  newWhatsAppConversation,
  nextMissingField,
  parseWhatsAppMenuChoice,
  WHATSAPP_QUOTED_BUTTONS,
  whatsAppDraftToQuoteBody,
  type WhatsAppAiTask,
  type WhatsAppConversation,
  type WhatsAppJourneyLeg,
  type WhatsAppQuoteDraft,
} from "../shared/whatsapp-quote-bot";
import { isBelowMinimumShortNoticeLead } from "../shared/booking-notice";
import type { PaidBookingDetails } from "../shared/booking-notifications";
import { formatExpressDropOffGbp, resolveExpressDropOff } from "../shared/express-drop-off";
import { getBookingSettings } from "./booking-settings-store";
import { evaluateOwnerNoAvailabilityFromStore, shouldForceShortNotice } from "./short-notice-handlers";
import { enforceCustomerSmartAvailabilityGate } from "./smart-ops-handlers";
import { createPricedQuickQuote } from "./quick-quote-handlers";
import { answerWhatsAppQuestion } from "./whatsapp-ai";
import {
  appendWhatsAppChat,
  formatWhatsAppChatTranscript,
  getWhatsAppChat,
  isWhatsAppChatDueForEmail,
  listWhatsAppChats,
  markWhatsAppChatEmailed,
} from "./whatsapp-chat-log";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import { getPaidBookingRecordByCustomerReference, listUpcomingPaidBookings } from "./paid-booking-store";
import {
  WHATSAPP_BOOKING_NOT_FOUND_REPLY,
  WHATSAPP_PICKUP_NOT_FOUND_REPLY,
  buildWhatsAppBookingDetails,
  buildWhatsAppPickupInfo,
  extractCustomerBookingReference,
  isWhatsAppBookingCheckQuestion,
  isWhatsAppPickupLocationQuestion,
  resolveWhatsAppTeamNumber,
  sameCustomerPhone,
  upcomingAirportCollections,
  upcomingCustomerBookings,
} from "../shared/whatsapp-pickup-info";
import { buildManageBookingUrl } from "../shared/manage-booking-token";
import { consumeQuickQuoteCreateQuota, getQuickQuote } from "./quick-quote-store";
import {
  buildWhatsAppFollowUpText,
  cancelWhatsAppFollowUp,
  deferWhatsAppFollowUp,
  getWhatsAppFollowUp,
  isInsideWhatsAppServiceWindow,
  isWhatsAppFollowUpOptOut,
  listDueWhatsAppFollowUps,
  scheduleWhatsAppFollowUp,
  whatsAppFollowUpDelayMs,
} from "./whatsapp-follow-up";
import { formatUkDate, todayLondonDate } from "../shared/uk-time";
import { addCalendarDays } from "../shared/quick-quote-parse";
import {
  buildWhatsAppDriverContactReply,
  isWhatsAppDriverContactQuestion,
  pickDriverContactJob,
  resolveWhatsAppDriverContact,
  WHATSAPP_DRIVER_NO_NUMBER_REPLY,
  WHATSAPP_DRIVER_NOT_FOUND_REPLY,
} from "../shared/whatsapp-driver-contact";
import { OWNER_VEHICLE_PROFILE_KEY } from "../shared/driver-vehicle";
import { getDriverVehicleProfile } from "./driver-vehicle-store";
import { listTrackingJobsForDateRange } from "./tracking-store";
import { trySendOwnerOperationalEmail, type WorkerEmailEnv } from "./worker-email";

export type WhatsAppEnv = WhatsAppCloudEnv & WorkerEmailEnv & {
  TRACKING_STORE?: KVNamespace;
  SITE_ORIGIN?: string;
  GOOGLE_PLACES_API_KEY?: string;
  /** Set to "false" to stop automatic replies (webhook still verifies and dedupes). */
  WHATSAPP_BOT_ENABLED?: string;
  /** Hours the assistant stays quiet after a handoff or an owner reply (default 0.5 = 30 minutes). */
  WHATSAPP_HANDOFF_HOURS?: string;
  /** "true" emails the owner a copy of every finished chat. Default off: handoff emails only. */
  WHATSAPP_CHAT_EMAILS?: string;
  /**
   * The team's own WhatsApp number (e.g. 447549815538) when the assistant runs on a
   * separate number. Handoffs then link the customer to this number.
   */
  WHATSAPP_TEAM_NUMBER?: string;
  /** Minutes after the customer's last message to send one quote reminder; "0" turns it off. Default 5. */
  WHATSAPP_FOLLOW_UP_MINUTES?: string;
  BOOKING_TO_EMAIL?: string;
  /** Worker secret: lets the assistant answer customer questions with Claude. */
  ANTHROPIC_API_KEY?: string;
};

/** Matches the WhatsApp customer service window — free-form replies are allowed inside it. */
const CONVERSATION_TTL_SECONDS = 60 * 60 * 24;
const DEDUPE_TTL_SECONDS = 60 * 60 * 48;
/** Ignore redelivered messages older than this (e.g. after an outage). */
const MAX_MESSAGE_AGE_SECONDS = 60 * 60 * 6;
const QUOTES_PER_CUSTOMER_PER_HOUR = 10;

const conversationKey = (phone: string) => `whatsapp:convo:${phone}`;
const pausedKey = (phone: string) => `whatsapp:paused:${phone}`;
const messageKey = (id: string) => `whatsapp:msg:${id}`;
const DIAG_KEY = "whatsapp:diag";
const DIAG_TTL_SECONDS = 60 * 60 * 24 * 14;

/** Last-seen timestamps and errors for GET /whatsapp/status (no message text or numbers). */
type WhatsAppDiag = {
  lastWebhookAt?: string;
  lastBadSignatureAt?: string;
  lastMessageAt?: string;
  lastSkip?: { at: string; reason: string };
  lastReplyOkAt?: string;
  lastReplyError?: { at: string; error: string };
  /** WhatsApp accepted a reply but later reported it undelivered (status webhook). */
  lastDeliveryFailure?: { at: string; error: string; phoneSuffix: string };
  lastProcessingError?: { at: string; error: string };
};

async function recordDiag(store: KVNamespace | undefined, patch: Partial<WhatsAppDiag>): Promise<void> {
  if (!store) return;
  try {
    const current = (await store.get<WhatsAppDiag>(DIAG_KEY, "json")) ?? {};
    await store.put(DIAG_KEY, JSON.stringify({ ...current, ...patch }), { expirationTtl: DIAG_TTL_SECONDS });
  } catch {
    // Diagnostics must never affect replies.
  }
}

const nowIso = () => new Date().toISOString();

export function isWhatsAppStatusPath(pathname: string): boolean {
  return pathname === "/whatsapp/status";
}

/** Owner troubleshooting: is the webhook arriving, and are replies being accepted? */
export async function handleWhatsAppStatus(env: WhatsAppEnv): Promise<Response> {
  const diag = env.TRACKING_STORE ? await env.TRACKING_STORE.get<WhatsAppDiag>(DIAG_KEY, "json") : null;
  return new Response(
    JSON.stringify(
      {
        configured: whatsAppCloudConfigured(env),
        provider: whatsAppUses360dialog(env) ? "360dialog" : "meta",
        botEnabled: env.WHATSAPP_BOT_ENABLED?.trim().toLowerCase() !== "false",
        teamNumberSet: Boolean(env.WHATSAPP_TEAM_NUMBER?.trim()),
        ...(diag ?? {}),
      },
      null,
      2,
    ),
    { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

function handoffTtlSeconds(env: WhatsAppEnv): number {
  const hours = Number(env.WHATSAPP_HANDOFF_HOURS);
  // Default 30 minutes (owner, Oct 2026): each owner reply restarts it, so a live chat stays human.
  return Math.round((Number.isFinite(hours) && hours > 0 ? Math.min(hours, 24 * 7) : 0.5) * 3600);
}

function logEvent(event: string, phone: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, phoneSuffix: phone.slice(-4), ...extra }));
}

export function isWhatsAppWebhookPath(pathname: string): boolean {
  return pathname === "/whatsapp/webhook" || pathname === "/api/whatsapp/webhook";
}

export function isWhatsAppConnectPath(pathname: string): boolean {
  return pathname === "/whatsapp/connect";
}

function plain(text: string, status: number): Response {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** WhatsApp business profile applied by /whatsapp/connect (360dialog). */
const BUSINESS_PROFILE = {
  about: "Fixed-price airport taxis across Northern Ireland. Instant quotes here.",
  description:
    "Airport taxi transfers across Northern Ireland to Belfast International, George Best Belfast City " +
    "and Dublin Airport. Fixed prices agreed upfront, with no surge pricing or hidden extras. Message us " +
    "for an instant quote and book in minutes.",
  email: "bookings@myairporttaxini.co.uk",
  websites: ["https://www.myairporttaxini.co.uk"],
  vertical: "TRAVEL",
};
const PROFILE_LOGO_PATH = "/facebook-profile-logo-navy.png";

async function applyBusinessProfile(apiKey: string, siteOrigin: string): Promise<string[]> {
  const lines: string[] = [];
  let pictureHandle: string | undefined;
  try {
    const logo = await fetch(`${siteOrigin}${PROFILE_LOGO_PATH}`);
    if (logo.ok) {
      const uploaded = await upload360dialogProfilePicture(
        apiKey,
        await logo.arrayBuffer(),
        logo.headers.get("Content-Type")?.split(";")[0] || "image/png",
      );
      if (uploaded.ok) pictureHandle = uploaded.handle;
      else lines.push(`Logo not uploaded: ${uploaded.error}. You can add it in 360dialog → Profile.`);
    } else {
      lines.push(`Logo not found (HTTP ${logo.status}). You can add it in 360dialog → Profile.`);
    }
  } catch {
    lines.push("Logo could not be downloaded. You can add it in 360dialog → Profile.");
  }
  const updated = await update360dialogBusinessProfile(apiKey, {
    ...BUSINESS_PROFILE,
    ...(pictureHandle ? { profile_picture_handle: pictureHandle } : {}),
  });
  if (updated.ok) {
    lines.unshift(`Business profile updated ✅${pictureHandle ? " (with logo)" : ""}`);
  } else {
    lines.unshift(`Business profile not updated: ${updated.error ?? "unknown error"}`);
  }
  return lines;
}

const CONNECT_COOLDOWN_KEY = "whatsapp:connect:last";
const CONNECT_COOLDOWN_SECONDS = 60;

/** Owner opens /whatsapp/connect once after adding D360_API_KEY. */
export async function handleWhatsAppConnect(request: Request, env: WhatsAppEnv): Promise<Response> {
  const apiKey = env.D360_API_KEY?.trim();
  if (!apiKey) {
    return plain("D360_API_KEY is not set yet. Add it in Cloudflare (Variables and Secrets), then try again.", 503);
  }
  if (env.TRACKING_STORE) {
    if (await env.TRACKING_STORE.get(CONNECT_COOLDOWN_KEY)) {
      return plain("Please wait a minute and try again.", 429);
    }
    await env.TRACKING_STORE.put(CONNECT_COOLDOWN_KEY, "1", { expirationTtl: CONNECT_COOLDOWN_SECONDS });
  }
  const webhookUrl = `${new URL(request.url).origin}/whatsapp/webhook`;
  const result = await register360dialogWebhook(apiKey, webhookUrl);
  if (!result.ok) {
    return plain(
      `360dialog did not accept the webhook (status ${result.status}).\n${result.error ?? ""}\n\n` +
        "Check the API key was copied in full, then try again.",
      502,
    );
  }
  const siteOrigin = (env.SITE_ORIGIN?.trim() || "https://www.myairporttaxini.co.uk").replace(/\/+$/, "");
  const profileLines = await applyBusinessProfile(apiKey, siteOrigin);
  return plain(
    `Connected ✅\n\nWhatsApp messages to your 360dialog number now go to:\n${webhookUrl}\n\n` +
      `${profileLines.join("\n")}\n\n` +
      "Send the number a test message (e.g. \"Hi\") from another phone.",
    200,
  );
}

export async function handleWhatsAppWebhook(
  request: Request,
  env: WhatsAppEnv,
  ctx?: ExecutionContext,
): Promise<Response> {
  if (request.method === "GET") {
    const verifyToken = env.WHATSAPP_VERIFY_TOKEN?.trim();
    if (!verifyToken) return new Response("WhatsApp webhook not configured", { status: 503 });
    const challenge = whatsAppVerifyChallenge(new URL(request.url), verifyToken);
    if (!challenge) return new Response("Forbidden", { status: 403 });
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!whatsAppCloudConfigured(env) || !env.TRACKING_STORE) {
    return new Response("WhatsApp webhook not configured", { status: 503 });
  }

  const rawBody = await request.text();
  const validSignature = whatsAppUses360dialog(env)
    ? await verify360dialogWebhookSecret(
        request.headers.get(D360_WEBHOOK_SECRET_HEADER),
        env.D360_API_KEY!,
      )
    : await verifyWhatsAppSignature(
        rawBody,
        request.headers.get("X-Hub-Signature-256"),
        env.WHATSAPP_APP_SECRET!.trim(),
      );
  if (!validSignature) {
    console.warn(JSON.stringify({ event: "whatsapp_webhook_bad_signature" }));
    if (request.headers.get(D360_WEBHOOK_SECRET_HEADER) || request.headers.get("X-Hub-Signature-256")) {
      await recordDiag(env.TRACKING_STORE, { lastBadSignatureAt: nowIso() });
    }
    return new Response("Invalid signature", { status: 401 });
  }
  await recordDiag(env.TRACKING_STORE, { lastWebhookAt: nowIso() });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const work = processWhatsAppWebhook(payload, env).catch(async (err) => {
    const error = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ event: "whatsapp_webhook_error", error }));
    await recordDiag(env.TRACKING_STORE, { lastProcessingError: { at: nowIso(), error: error.slice(0, 300) } });
  });
  // Acknowledge quickly so Meta does not retry; pricing can take a few seconds.
  if (ctx) ctx.waitUntil(work);
  else await work;
  return new Response("EVENT_RECEIVED", { status: 200 });
}

export async function processWhatsAppWebhook(payload: unknown, env: WhatsAppEnv): Promise<void> {
  const store = env.TRACKING_STORE;
  if (!store) return;
  const { messages, echoes, failures } = parseWhatsAppWebhook(payload);

  for (const failure of failures) {
    logEvent("whatsapp_delivery_failed", failure.to, { code: failure.code, error: failure.error });
    await recordDiag(store, {
      lastDeliveryFailure: { at: nowIso(), error: failure.error, phoneSuffix: failure.to.slice(-4) },
    });
  }

  // Owner replied from the WhatsApp Business app — step back for this customer.
  for (const echo of echoes) {
    await store.put(pausedKey(echo.to), "owner", { expirationTtl: handoffTtlSeconds(env) });
    logEvent("whatsapp_bot_paused_owner_reply", echo.to);
  }

  for (const message of messages) {
    await handleInboundMessage(message, env, store);
  }
}

async function handleInboundMessage(
  message: WhatsAppInboundMessage,
  env: WhatsAppEnv,
  store: KVNamespace,
): Promise<void> {
  if (await store.get(messageKey(message.id))) return;
  await store.put(messageKey(message.id), "1", { expirationTtl: DEDUPE_TTL_SECONDS });

  await recordDiag(store, { lastMessageAt: nowIso() });
  await appendWhatsAppChat(
    store,
    message.from,
    { from: "customer", text: message.text || "[photo, voice note or other non-text message]" },
    message.profileName,
  );
  const skip = (reason: string) => recordDiag(store, { lastSkip: { at: nowIso(), reason } });
  if (env.WHATSAPP_BOT_ENABLED?.trim().toLowerCase() === "false") return skip("bot disabled");
  if (message.timestamp && Date.now() / 1000 - message.timestamp > MAX_MESSAGE_AGE_SECONDS) {
    return skip("message too old");
  }

  const phone = message.from;
  const teamNumber = env.WHATSAPP_TEAM_NUMBER?.trim() ? resolveWhatsAppTeamNumber(env.WHATSAPP_TEAM_NUMBER) : undefined;
  const isTeamPhone = Boolean(teamNumber) && teamNumber === phone;
  // Quote reminder: never while they are still chatting, never after "stop" / NEW.
  const followUpDelay = whatsAppFollowUpDelayMs(env.WHATSAPP_FOLLOW_UP_MINUTES);
  if (message.text && (isWhatsAppFollowUpOptOut(message.text) || detectWhatsAppIntent(message.text) === "reset")) {
    await cancelWhatsAppFollowUp(store, phone);
  } else if (followUpDelay) {
    await deferWhatsAppFollowUp(store, phone, followUpDelay);
  }
  if (await store.get(pausedKey(phone))) {
    // NEW always wakes the assistant; the team's own phone is never left paused (testing).
    if (isTeamPhone || detectWhatsAppIntent(message.text) === "reset") {
      await store.delete(pausedKey(phone));
    } else {
      return skip("paused for this customer (handoff or owner reply)");
    }
  }
  if (!message.text) {
    await reply(
      env,
      phone,
      "Sorry, I can only read text messages. Please type your journey details, e.g. pickup postcode, destination, date and time.",
    );
    return;
  }

  // "Where's my driver?": the driver's name and mobile for today's journey.
  if (isWhatsAppDriverContactQuestion(message.text)) {
    await replyWithDriverContact(env, store, phone, message.profileName, isTeamPhone);
    return;
  }

  // "My booking" menu button: the bookings made with this WhatsApp number.
  if (parseWhatsAppMenuChoice(message.text) === "booking") {
    await replyWithBookingDetails(env, store, phone, null);
    return;
  }

  // "Where do I get picked up?": answer from the paid booking.
  const bookingRef = extractCustomerBookingReference(message.text);
  if (isWhatsAppPickupLocationQuestion(message.text)) {
    await replyWithPickupInfo(env, store, phone, bookingRef);
    return;
  }
  // "Can you check my booking?" or a booking reference: the booking's details.
  if (bookingRef || isWhatsAppBookingCheckQuestion(message.text)) {
    await replyWithBookingDetails(env, store, phone, bookingRef);
    return;
  }

  const existing = await store.get<WhatsAppConversation>(conversationKey(phone), "json");
  const decision = decideWhatsAppReply(existing, message.text, { profileName: message.profileName });
  const conversation = decision.conversation;
  let text = decision.reply;
  let buttons: WhatsAppReplyButton[] | undefined = decision.buttons;

  if (decision.action === "handoff") {
    if (isTeamPhone) {
      // The owner testing from the team phone: never pause, just explain.
      text = "This is the team's own number, so the assistant stays on. (Customers who ask for a person are handed to you on the dashboard.)";
      buttons = undefined;
    } else {
      // The team replies here, from the dashboard (WhatsApp chats), so the assistant steps back.
      await store.put(pausedKey(phone), "customer", { expirationTtl: handoffTtlSeconds(env) });
    }
    logEvent("whatsapp_bot_handoff", phone);
    await cancelWhatsAppFollowUp(store, phone);
    if (!isTeamPhone) await notifyOwnerOfHandoff(env, phone, message.profileName, conversation, true);
  }

  if (decision.action === "answer") {
    const answered = await answerCustomerQuestion(env, store, phone, message.text, conversation, decision.ai ?? {});
    if (answered) {
      text = answered.text;
      // The AI asked for journey details to start a quote: bare replies now fill them.
      if (answered.startQuote && conversation.stage === "collecting" && !conversation.awaiting) {
        conversation.awaiting = nextMissingField(conversation.draft) ?? undefined;
      }
      if (answered.handoff && !isTeamPhone) {
        await notifyOwnerOfHandoff(env, phone, message.profileName, conversation, false);
      }
    }
  }

  if (decision.action === "quote") {
    const availability = await checkWhatsAppAvailability(conversation.draft, store);
    if (!availability.ok) {
      conversation.stage = "collecting";
      conversation.awaiting = availability.leg === "return" ? "returnTime" : "outboundTime";
      await store.put(conversationKey(phone), JSON.stringify(conversation), {
        expirationTtl: CONVERSATION_TTL_SECONDS,
      });
      logEvent("whatsapp_quote_unavailable", phone, { reason: availability.reason, leg: availability.leg });
      await reply(env, phone, availability.text, availability.buttons);
      return;
    }
    const quota = await consumeQuickQuoteCreateQuota(
      store,
      `whatsapp:${phone}`,
      QUOTES_PER_CUSTOMER_PER_HOUR,
    );
    if (quota === "limited") {
      text = "You've requested a lot of quotes in the last hour. Please try again a little later.";
      buttons = undefined;
    } else {
      const priced = await createPricedQuickQuote(
        whatsAppDraftToQuoteBody(conversation.draft),
        { ...env, TRACKING_STORE: store },
        { createdByOwner: false },
      );
      if (priced.ok) {
        conversation.stage = "quoted";
        conversation.lastQuoteUrl = priced.bookingUrl;
        conversation.lastQuoteAmountLabel = priced.record.quotedAmountLabel;
        const pricedJourney = priced.record.journey;
        const express = resolveExpressDropOff({
          airportCode: pricedJourney.airportCode,
          fromAirport: pricedJourney.fromAirport,
          returnJourney: pricedJourney.returnJourney,
          selected: false,
        });
        const optionalExpressFeeGbp = express.legs
          .filter((leg) => !leg.selected)
          .reduce((sum, leg) => sum + leg.feeIfSelectedGbp, 0);
        text = buildWhatsAppQuoteReply({
          amountLabel: priced.record.quotedAmountLabel,
          bookingUrl: priced.bookingUrl,
          optionalExpressFeeLabel:
            optionalExpressFeeGbp > 0 ? formatExpressDropOffGbp(optionalExpressFeeGbp) : null,
          requestOnly: availability.requestOnly,
        });
        buttons = WHATSAPP_QUOTED_BUTTONS;
        logEvent("whatsapp_quote_sent", phone, {
          idSuffix: priced.record.id.slice(-6),
          quotedAmount: priced.record.quotedAmount,
          returnJourney: priced.record.journey.returnJourney,
          airportCode: priced.record.journey.airportCode ?? null,
          requestOnly: availability.requestOnly,
        });
        if (followUpDelay && !availability.requestOnly) {
          const draft = conversation.draft;
          const place = (label?: string) => (label ?? "").split(",")[0]!.trim();
          await scheduleWhatsAppFollowUp(
            store,
            {
              phone,
              name: message.profileName,
              quoteId: priced.record.id,
              amountLabel: priced.record.quotedAmountLabel,
              bookingUrl: priced.bookingUrl,
              journeyLabel:
                `${place(draft.pickupAddress)} → ${place(draft.dropoffAddress)}` +
                (draft.outboundDate ? ` on ${formatUkDate(draft.outboundDate)}` : ""),
            },
            followUpDelay,
          );
        }
      } else {
        conversation.stage = "collecting";
        text = buildWhatsAppQuoteFailedReply(priced.status === 422 ? undefined : priced.error);
        buttons = undefined;
        logEvent("whatsapp_quote_failed", phone, { status: priced.status, reason: priced.reason });
      }
    }
  }

  await store.put(conversationKey(phone), JSON.stringify(conversation), {
    expirationTtl: CONVERSATION_TTL_SECONDS,
  });
  if (text) await reply(env, phone, text, buttons);
}

type AvailabilityResult =
  /** requestOnly: bookable as a request the owner approves (short notice / request-only period). */
  | { ok: true; requestOnly: boolean }
  | {
      ok: false;
      leg: WhatsAppJourneyLeg;
      reason: "booked" | "closed" | "notice";
      text: string;
      buttons?: WhatsAppReplyButton[];
    };

/**
 * Same rules as the website before payment: minimum notice, owner "no availability"
 * periods, then Smart Availability against existing bookings (when switched on in the
 * owner dashboard). Each leg is checked on its own so alternative times are for that leg.
 * Fails open on errors so a storage hiccup never blocks quoting.
 */
export async function checkWhatsAppAvailability(
  draft: WhatsAppQuoteDraft,
  store: KVNamespace,
  now = new Date(),
): Promise<AvailabilityResult> {
  try {
    const settings = await getBookingSettings(store);
    const legs: Array<{ leg: WhatsAppJourneyLeg; date?: string; time?: string }> = [
      { leg: "outbound", date: draft.outboundDate, time: draft.outboundTime },
      ...(draft.returnJourney
        ? [{ leg: "return" as const, date: draft.returnDate, time: draft.returnTime }]
        : []),
    ];
    for (const { leg, date, time } of legs) {
      if (!date || !time) continue;
      // Under the short-notice lead time the website refuses even a request.
      if (isBelowMinimumShortNoticeLead(date, time, now, settings.minimumShortNoticeLeadHours)) {
        return {
          ok: false,
          leg,
          reason: "notice",
          text: buildWhatsAppUnavailableReply({
            leg,
            draft,
            reason: "notice",
            noticeHours: settings.minimumShortNoticeLeadHours,
            hasAlternatives: false,
          }),
        };
      }
      const closed = await evaluateOwnerNoAvailabilityFromStore(
        store,
        { tripDate: date, tripTime: time, returnJourney: false, vehicle: "Saloon" },
        now,
      );
      if (closed.blocked) {
        return {
          ok: false,
          leg,
          reason: "closed",
          text: buildWhatsAppUnavailableReply({
            leg,
            draft,
            reason: "closed",
            message: closed.customerMessage,
            hasAlternatives: false,
          }),
        };
      }
      const outbound = leg === "outbound";
      const gate = await enforceCustomerSmartAvailabilityGate({
        store,
        origin: null,
        now,
        booking: {
          pickupLabel: outbound ? draft.pickupAddress : draft.dropoffAddress,
          dropoffLabel: outbound ? draft.dropoffAddress : draft.pickupAddress,
          tripDate: date,
          tripTime: time,
          returnJourney: false,
          vehicle: "Saloon",
          airportCode: draft.airportCode ?? null,
          isFromAirport: draft.fromAirport == null ? null : outbound ? draft.fromAirport : !draft.fromAirport,
        },
      });
      if (gate.blocked) {
        const buttons = buildWhatsAppAlternativeTimeButtons(leg, gate.alternativeTimes);
        return {
          ok: false,
          leg,
          reason: "booked",
          text: buildWhatsAppUnavailableReply({ leg, draft, reason: "booked", hasAlternatives: buttons.length > 0 }),
          buttons,
        };
      }
    }
    // Same rule as checkout: short notice or a request-only period on the outbound pickup.
    const forced =
      draft.outboundDate && draft.outboundTime
        ? await shouldForceShortNotice(
            store,
            {
              tripDate: draft.outboundDate,
              tripTime: draft.outboundTime,
              returnJourney: Boolean(draft.returnJourney),
              returnDate: draft.returnDate ?? "",
              returnTime: draft.returnTime ?? "",
              passengers: draft.passengers,
              suitcases: draft.suitcases,
              vehicle: "Saloon",
            } as unknown as PaidBookingDetails,
            now,
          )
        : null;
    return { ok: true, requestOnly: Boolean(forced?.shortNotice) };
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "whatsapp_availability_check_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { ok: true, requestOnly: false };
  }
}

async function notifyOwnerOfHandoff(
  env: WhatsAppEnv,
  phone: string,
  profileName: string | undefined,
  conversation: WhatsAppConversation,
  assistantPaused: boolean,
): Promise<void> {
  const d = conversation.draft;
  const lines = [
    `A WhatsApp customer asked to speak to the team.`,
    ``,
    `Name: ${profileName || "—"}`,
    `WhatsApp: +${phone}`,
    `Reply from the business number: Owner dashboard → More → WhatsApp chats.`,
    ``,
    d.pickupAddress ? `From: ${d.pickupAddress}` : "",
    d.dropoffAddress ? `To: ${d.dropoffAddress}` : "",
    d.outboundDate ? `Date: ${d.outboundDate}${d.outboundTime ? ` at ${d.outboundTime}` : ""}` : "",
    d.returnJourney ? `Return: ${d.returnDate ?? "?"}${d.returnTime ? ` at ${d.returnTime}` : ""}` : "",
    d.passengers != null ? `Passengers: ${d.passengers}` : "",
    d.suitcases != null ? `Suitcases: ${d.suitcases}` : "",
    d.flightNumber ? `Flight: ${d.flightNumber}` : "",
    conversation.lastQuoteAmountLabel ? `Last quote: ${conversation.lastQuoteAmountLabel}` : "",
  ].filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== ""));
  // The whole conversation so far, so the owner can pick it up without asking again.
  const store = env.TRACKING_STORE;
  const chat = store ? await getWhatsAppChat(store, phone).catch(() => null) : null;
  const transcript = chat ? formatWhatsAppChatTranscript(chat) : "";
  if (transcript) {
    lines.push("", "Conversation so far:", "", transcript);
  }
  lines.push(
    "",
    assistantPaused
      ? "The assistant is paused for this customer until you hand it back on the dashboard (or 30 minutes after the last reply)."
      : "The assistant couldn't answer this and told the customer the team will reply. It is still answering them.",
  );
  try {
    const sent = await trySendOwnerOperationalEmail(env, {
      to: env.BOOKING_TO_EMAIL?.trim() || "bookings@myairporttaxini.co.uk",
      subject: `WhatsApp: ${profileName || `+${phone}`} wants to speak to you`,
      body: lines.join("\n"),
    });
    if (!sent.sent) logEvent("whatsapp_handoff_email_failed", phone);
    // Already sent in full: the "chat finished" email then only adds what follows.
    if (sent.sent && store && chat && transcript) await markWhatsAppChatEmailed(store, chat, nowIso());
  } catch {
    logEvent("whatsapp_handoff_email_failed", phone);
  }
}

/**
 * Claude-led reply (website FAQs/terms only): responds to whatever the customer said
 * and, mid-quote, asks for the next journey detail in its own words. Null keeps the
 * fixed fallback reply.
 */
async function answerCustomerQuestion(
  env: WhatsAppEnv,
  store: KVNamespace,
  phone: string,
  message: string,
  conversation: WhatsAppConversation,
  task: WhatsAppAiTask,
): Promise<{ text: string; handoff: boolean; startQuote: boolean } | null> {
  try {
    const chat = await getWhatsAppChat(store, phone);
    // The message itself was just logged; send the turns before it for context.
    const recentChat = (chat?.messages ?? [])
      .slice(-11, -1)
      .map((m) => `${m.from === "customer" ? "Customer" : "Assistant"}: ${m.text.slice(0, 500)}`)
      .join("\n");
    const draft = conversation.draft;
    const collected = describeWhatsAppDraft(draft);
    const answer = await answerWhatsAppQuestion(env, message, {
      recentChat,
      journey: collected
        ? {
            collected,
            stage: conversation.stage,
            quotedPrice: conversation.lastQuoteAmountLabel,
          }
        : undefined,
      askFor:
        task.askFor && conversation.stage === "collecting"
          ? {
              detail: describeWhatsAppField(task.askFor),
              example: buildWhatsAppQuestion(task.askFor),
              justUpdated: Boolean(task.justUpdated),
            }
          : undefined,
    });
    if (!answer) return null;
    logEvent("whatsapp_ai_answer", phone, { handoff: answer.handoff, askFor: task.askFor ?? null });

    let text = answer.text;
    if (answer.handoff) {
      text += `\n\nI've passed this to our team and they'll reply to you here shortly.`;
    } else if (task.askFor && task.justUpdated && conversation.stage === "collecting" && !text.includes("?")) {
      // Safety net: the quote must keep moving when the customer is giving details.
      text += `\n\n${buildWhatsAppQuestion(task.askFor)}`;
    }
    return { text, handoff: answer.handoff, startQuote: answer.startQuote };
  } catch (err) {
    logEvent("whatsapp_ai_answer_failed", phone, { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Driver contact for the customer's own journey (matched on the WhatsApp number they
 * booked with). No journey, or no number on file: say so and email the owner.
 */
async function replyWithDriverContact(
  env: WhatsAppEnv,
  store: KVNamespace,
  phone: string,
  profileName: string | undefined,
  isTeamPhone: boolean,
): Promise<void> {
  let text: string | null = null;
  let foundJob = false;
  try {
    const today = todayLondonDate();
    const jobs = await listTrackingJobsForDateRange(store, addCalendarDays(today, -1), addCalendarDays(today, 1));
    const job = pickDriverContactJob(jobs, phone);
    if (job) {
      foundJob = true;
      const owner = await getDriverVehicleProfile(store, OWNER_VEHICLE_PROFILE_KEY);
      const driver = resolveWhatsAppDriverContact(job, owner);
      logEvent("whatsapp_driver_contact", phone, { found: true, hasMobile: Boolean(driver.mobile) });
      if (driver.mobile) text = buildWhatsAppDriverContactReply(job, driver);
    } else {
      logEvent("whatsapp_driver_contact", phone, { found: false });
    }
  } catch (err) {
    logEvent("whatsapp_driver_contact_failed", phone, { error: err instanceof Error ? err.message : String(err) });
  }
  if (text) {
    await reply(env, phone, text);
    return;
  }
  await reply(env, phone, foundJob ? WHATSAPP_DRIVER_NO_NUMBER_REPLY : WHATSAPP_DRIVER_NOT_FOUND_REPLY);
  if (!isTeamPhone) {
    const existing = await store.get<WhatsAppConversation>(conversationKey(phone), "json");
    await notifyOwnerOfHandoff(env, phone, profileName, existing ?? newWhatsAppConversation(), false);
  }
}

/**
 * Booking details for the customer's own bookings only: matched on the WhatsApp
 * number they booked with (a reference from another phone is not disclosed).
 */
async function replyWithBookingDetails(
  env: WhatsAppEnv,
  store: KVNamespace,
  phone: string,
  bookingRef: string | null,
): Promise<void> {
  let bookings: PaidBookingRecord[] = [];
  try {
    if (bookingRef) {
      const paid = await getPaidBookingRecordByCustomerReference(store, bookingRef);
      if (paid && sameCustomerPhone(paid.mobileNumber, phone)) bookings = [paid];
    } else {
      const upcoming = await listUpcomingPaidBookings(store, { pastDays: 1, futureDays: 180, limit: 250 });
      bookings = upcoming.filter((b) => sameCustomerPhone(b.mobileNumber, phone));
    }
  } catch (err) {
    logEvent("whatsapp_booking_lookup_failed", phone, { error: err instanceof Error ? err.message : String(err) });
  }

  const found = upcomingCustomerBookings(bookings).slice(0, 3);
  logEvent("whatsapp_booking_details", phone, { byRef: Boolean(bookingRef), found: found.length });
  if (!found.length) {
    await reply(env, phone, WHATSAPP_BOOKING_NOT_FOUND_REPLY);
    return;
  }
  const origin = (env.SITE_ORIGIN?.trim() || "https://www.myairporttaxini.co.uk").replace(/\/$/, "");
  for (const paid of found) {
    const manageUrl = paid.manageBookingToken ? buildManageBookingUrl(origin, paid.manageBookingToken) : null;
    await reply(env, phone, buildWhatsAppBookingDetails(paid, { manageUrl }));
  }
}

async function replyWithPickupInfo(
  env: WhatsAppEnv,
  store: KVNamespace,
  phone: string,
  bookingRef: string | null,
): Promise<void> {
  let bookings: PaidBookingRecord[] = [];
  try {
    if (bookingRef) {
      const paid = await getPaidBookingRecordByCustomerReference(store, bookingRef);
      if (paid) bookings = [paid];
    } else {
      const upcoming = await listUpcomingPaidBookings(store, { pastDays: 1, futureDays: 120, limit: 250 });
      bookings = upcoming.filter((b) => sameCustomerPhone(b.mobileNumber, phone));
    }
  } catch (err) {
    logEvent("whatsapp_pickup_lookup_failed", phone, { error: err instanceof Error ? err.message : String(err) });
  }

  const next = upcomingAirportCollections(bookings)[0];
  const info = next ? buildWhatsAppPickupInfo(next) : null;
  logEvent("whatsapp_pickup_info", phone, { byRef: Boolean(bookingRef), found: Boolean(info) });
  if (!info) {
    await reply(
      env,
      phone,
      bookingRef
        ? `I couldn't find an upcoming airport pickup for ${bookingRef}. Please check the reference in your confirmation email, or reply *NEW* for a quote.`
        : WHATSAPP_PICKUP_NOT_FOUND_REPLY,
    );
    return;
  }
  await reply(env, phone, info.text);
  if (info.mapImageUrl) {
    const sent = await sendWhatsAppImage(env, phone, info.mapImageUrl);
    await appendWhatsAppChat(store, phone, { from: "assistant", text: `[Map image: ${info.mapImageUrl}]`, failed: !sent.sent });
    if (!sent.sent) logEvent("whatsapp_pickup_map_failed", phone, { error: sent.error });
  }
  if (info.pin) {
    const sent = await sendWhatsAppLocation(env, phone, info.pin);
    await appendWhatsAppChat(store, phone, { from: "assistant", text: `[Location pin: ${info.pin.name}]`, failed: !sent.sent });
    if (!sent.sent) logEvent("whatsapp_pickup_pin_failed", phone, { error: sent.error });
  }
}

async function reply(
  env: WhatsAppEnv,
  phone: string,
  text: string,
  buttons?: WhatsAppReplyButton[],
): Promise<void> {
  const store = env.TRACKING_STORE;
  if (buttons?.length) {
    const withButtons = await sendWhatsAppButtons(env, phone, text, buttons);
    if (withButtons.sent) {
      await recordDiag(store, { lastReplyOkAt: nowIso() });
      await appendWhatsAppChat(store, phone, {
        from: "assistant",
        text: `${text}\n[Buttons: ${buttons.map((b) => b.title).join(" | ")}]`,
      });
      return;
    }
    logEvent("whatsapp_buttons_failed", phone, { error: withButtons.error });
  }
  const result = await sendWhatsAppText(env, phone, text);
  await appendWhatsAppChat(store, phone, { from: "assistant", text, failed: !result.sent });
  if (result.sent) {
    await recordDiag(store, { lastReplyOkAt: nowIso() });
  } else {
    logEvent("whatsapp_send_failed", phone, { error: result.error });
    await recordDiag(store, { lastReplyError: { at: nowIso(), error: String(result.error ?? "unknown").slice(0, 300) } });
  }
}

/** WhatsApp only allows free-form replies within 24h of the customer's last message. */
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type OwnerWhatsAppReplyResult =
  | { ok: true; assistantPaused: boolean }
  | { error: string; status: number };

/**
 * Owner dashboard: reply to a customer from the assistant's own number, in the same chat.
 * The assistant then stays quiet for that customer (handoff hours) so it never talks over you.
 */
export async function ownerReplyToWhatsAppChat(
  env: WhatsAppEnv,
  rawPhone: string,
  rawText: string,
  now: Date = new Date(),
): Promise<OwnerWhatsAppReplyResult> {
  const store = env.TRACKING_STORE;
  if (!store || !whatsAppCloudConfigured(env)) return { error: "WhatsApp is not configured", status: 503 };
  const phone = rawPhone.replace(/\D/g, "");
  const text = rawText.trim();
  if (!phone) return { error: "Missing phone", status: 400 };
  if (!text) return { error: "Type a message first", status: 400 };
  if (text.length > 4000) return { error: "Message is too long", status: 400 };
  const chat = await getWhatsAppChat(store, phone);
  if (!chat) return { error: "Chat not found", status: 404 };
  const lastCustomer = [...chat.messages].reverse().find((m) => m.from === "customer");
  const lastAt = lastCustomer ? Date.parse(lastCustomer.at) : NaN;
  if (!Number.isFinite(lastAt) || now.getTime() - lastAt >= SERVICE_WINDOW_MS) {
    return {
      error:
        "It's more than 24 hours since this customer last messaged, so WhatsApp won't deliver a normal reply from the business number. Message them from your own WhatsApp instead.",
      status: 409,
    };
  }
  const sent = await sendWhatsAppText(env, phone, text);
  await appendWhatsAppChat(store, phone, { from: "team", text, failed: !sent.sent });
  if (!sent.sent) {
    logEvent("whatsapp_owner_reply_failed", phone, { error: sent.error });
    return { error: `WhatsApp didn't accept the message: ${String(sent.error ?? "unknown error")}`, status: 502 };
  }
  await store.put(pausedKey(phone), "owner", { expirationTtl: handoffTtlSeconds(env) });
  await cancelWhatsAppFollowUp(store, phone);
  logEvent("whatsapp_owner_reply_sent", phone);
  return { ok: true, assistantPaused: true };
}

/** Owner dashboard: let the assistant answer this customer again. */
export async function resumeWhatsAppAssistant(env: WhatsAppEnv, rawPhone: string): Promise<void> {
  const phone = rawPhone.replace(/\D/g, "");
  if (env.TRACKING_STORE && phone) await env.TRACKING_STORE.delete(pausedKey(phone));
}

export async function isWhatsAppAssistantPaused(store: KVNamespace, rawPhone: string): Promise<boolean> {
  const phone = rawPhone.replace(/\D/g, "");
  return Boolean(phone) && Boolean(await store.get(pausedKey(phone)));
}

/**
 * Cron: one reminder to customers who got a WhatsApp quote but haven't booked,
 * 5 minutes after their last message and inside the 24h service window.
 */
export async function processWhatsAppFollowUps(
  env: WhatsAppEnv,
  now: Date = new Date(),
): Promise<{ sent: number; skipped: number }> {
  const result = { sent: 0, skipped: 0 };
  const store = env.TRACKING_STORE;
  if (!store || !whatsAppCloudConfigured(env) || !whatsAppFollowUpDelayMs(env.WHATSAPP_FOLLOW_UP_MINUTES)) return result;
  if (env.WHATSAPP_BOT_ENABLED?.trim().toLowerCase() === "false") return result;
  for (const phone of await listDueWhatsAppFollowUps(store, now)) {
    const record = await getWhatsAppFollowUp(store, phone);
    // Claim first: a reminder is sent at most once, even if the send below fails.
    await cancelWhatsAppFollowUp(store, phone);
    if (!record || !isInsideWhatsAppServiceWindow(record, now) || (await store.get(pausedKey(phone)))) {
      result.skipped += 1;
      continue;
    }
    const quote = await getQuickQuote(store, record.quoteId).catch(() => null);
    if (!quote || quote.status === "paid" || quote.status === "cancelled" || quote.status === "expired" || Date.parse(quote.expiresAt ?? "") <= now.getTime()) {
      result.skipped += 1;
      continue;
    }
    await reply(env, phone, buildWhatsAppFollowUpText(record));
    logEvent("whatsapp_follow_up_sent", phone, { idSuffix: record.quoteId.slice(-6) });
    result.sent += 1;
  }
  return result;
}

/**
 * Cron: email the owner each WhatsApp chat once it has gone quiet (5 minutes),
 * with the messages since the last email, so the assistant's answers can be checked.
 */
export async function processWhatsAppChatEmails(
  env: WhatsAppEnv,
  now: Date = new Date(),
): Promise<{ sent: number; errors: number }> {
  const result = { sent: 0, errors: 0 };
  // Off by default (owner, Oct 2026): only email when a customer needs to speak to the owner
  // (notifyOwnerOfHandoff). Set WHATSAPP_CHAT_EMAILS="true" to get every chat again.
  if (env.WHATSAPP_CHAT_EMAILS?.trim().toLowerCase() !== "true") return result;
  const store = env.TRACKING_STORE;
  if (!store || !whatsAppCloudConfigured(env)) return result;
  const due = (await listWhatsAppChats(store, 500)).filter((c) => isWhatsAppChatDueForEmail(c, now)).slice(0, 20);
  for (const summary of due) {
    try {
      const chat = await getWhatsAppChat(store, summary.phone);
      if (!chat) continue;
      const transcript = formatWhatsAppChatTranscript(chat, chat.emailedAt);
      if (!transcript) {
        await markWhatsAppChatEmailed(store, chat, now.toISOString());
        continue;
      }
      const who = chat.name ? `${chat.name} (+${chat.phone})` : `+${chat.phone}`;
      const sent = await trySendOwnerOperationalEmail(env, {
        to: env.BOOKING_TO_EMAIL?.trim() || "bookings@myairporttaxini.co.uk",
        subject: `WhatsApp chat: ${who}`,
        body:
          `WhatsApp assistant chat with ${who}.\n` +
          `Reply from the business number: Owner dashboard → More → WhatsApp chats.\n\n` +
          `${transcript}`,
      });
      if (sent.sent) {
        await markWhatsAppChatEmailed(store, chat, now.toISOString());
        result.sent += 1;
      } else {
        result.errors += 1;
      }
    } catch {
      result.errors += 1;
    }
  }
  return result;
}
