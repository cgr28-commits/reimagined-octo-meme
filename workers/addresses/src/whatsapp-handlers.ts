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
 * over a human. Customers can also reply AGENT to pause it themselves.
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
  buildWhatsAppQuoteFailedReply,
  buildWhatsAppQuoteReply,
  buildWhatsAppTeamHandoffReply,
  decideWhatsAppReply,
  WHATSAPP_BUTTONS,
  WHATSAPP_QUOTED_BUTTONS,
  whatsAppDraftToQuoteBody,
  type WhatsAppConversation,
} from "../shared/whatsapp-quote-bot";
import { createPricedQuickQuote } from "./quick-quote-handlers";
import { consumeQuickQuoteCreateQuota } from "./quick-quote-store";
import { trySendOwnerOperationalEmail, type WorkerEmailEnv } from "./worker-email";

export type WhatsAppEnv = WhatsAppCloudEnv & WorkerEmailEnv & {
  TRACKING_STORE?: KVNamespace;
  SITE_ORIGIN?: string;
  GOOGLE_PLACES_API_KEY?: string;
  /** Set to "false" to stop automatic replies (webhook still verifies and dedupes). */
  WHATSAPP_BOT_ENABLED?: string;
  /** Hours the assistant stays quiet after a handoff or an owner reply (default 12). */
  WHATSAPP_HANDOFF_HOURS?: string;
  /**
   * The team's own WhatsApp number (e.g. 447549815538) when the assistant runs on a
   * separate number. Handoffs then link the customer to this number.
   */
  WHATSAPP_TEAM_NUMBER?: string;
  BOOKING_TO_EMAIL?: string;
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

function handoffTtlSeconds(env: WhatsAppEnv): number {
  const hours = Number(env.WHATSAPP_HANDOFF_HOURS);
  return Math.round((Number.isFinite(hours) && hours > 0 ? Math.min(hours, 24 * 7) : 12) * 3600);
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
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const work = processWhatsAppWebhook(payload, env).catch((err) => {
    console.error(
      JSON.stringify({
        event: "whatsapp_webhook_error",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  });
  // Acknowledge quickly so Meta does not retry; pricing can take a few seconds.
  if (ctx) ctx.waitUntil(work);
  else await work;
  return new Response("EVENT_RECEIVED", { status: 200 });
}

export async function processWhatsAppWebhook(payload: unknown, env: WhatsAppEnv): Promise<void> {
  const store = env.TRACKING_STORE;
  if (!store) return;
  const { messages, echoes } = parseWhatsAppWebhook(payload);

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

  if (env.WHATSAPP_BOT_ENABLED?.trim().toLowerCase() === "false") return;
  if (message.timestamp && Date.now() / 1000 - message.timestamp > MAX_MESSAGE_AGE_SECONDS) return;
  if (await store.get(pausedKey(message.from))) return;

  const phone = message.from;
  if (!message.text) {
    await reply(
      env,
      phone,
      "Sorry, I can only read text messages. Please type your journey details, or reply *AGENT* to speak to our team.",
    );
    return;
  }

  const existing = await store.get<WhatsAppConversation>(conversationKey(phone), "json");
  const decision = decideWhatsAppReply(existing, message.text, { profileName: message.profileName });
  const conversation = decision.conversation;
  let text = decision.reply;
  let buttons: WhatsAppReplyButton[] | undefined = decision.buttons;

  if (decision.action === "handoff") {
    const teamNumber = env.WHATSAPP_TEAM_NUMBER?.replace(/\D/g, "");
    if (teamNumber && teamNumber !== phone) {
      // The team answers from another number, so keep the assistant available here.
      text = buildWhatsAppTeamHandoffReply(teamNumber, conversation.draft);
      buttons = undefined;
    } else {
      await store.put(pausedKey(phone), "customer", { expirationTtl: handoffTtlSeconds(env) });
    }
    logEvent("whatsapp_bot_handoff", phone);
    await notifyOwnerOfHandoff(env, phone, message.profileName, conversation);
  }

  if (decision.action === "quote") {
    const quota = await consumeQuickQuoteCreateQuota(
      store,
      `whatsapp:${phone}`,
      QUOTES_PER_CUSTOMER_PER_HOUR,
    );
    if (quota === "limited") {
      text = "You've requested a lot of quotes in the last hour. Please try again later, or reply *AGENT* to speak to our team.";
      buttons = [WHATSAPP_BUTTONS.agent];
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
        text = buildWhatsAppQuoteReply({
          amountLabel: priced.record.quotedAmountLabel,
          bookingUrl: priced.bookingUrl,
        });
        buttons = WHATSAPP_QUOTED_BUTTONS;
        logEvent("whatsapp_quote_sent", phone, {
          idSuffix: priced.record.id.slice(-6),
          quotedAmount: priced.record.quotedAmount,
          returnJourney: priced.record.journey.returnJourney,
          airportCode: priced.record.journey.airportCode ?? null,
        });
      } else {
        conversation.stage = "collecting";
        text = buildWhatsAppQuoteFailedReply(priced.status === 422 ? undefined : priced.error);
        buttons = [WHATSAPP_BUTTONS.agent];
        logEvent("whatsapp_quote_failed", phone, { status: priced.status, reason: priced.reason });
      }
    }
  }

  await store.put(conversationKey(phone), JSON.stringify(conversation), {
    expirationTtl: CONVERSATION_TTL_SECONDS,
  });
  if (text) await reply(env, phone, text, buttons);
}

async function notifyOwnerOfHandoff(
  env: WhatsAppEnv,
  phone: string,
  profileName: string | undefined,
  conversation: WhatsAppConversation,
): Promise<void> {
  const d = conversation.draft;
  const lines = [
    `A WhatsApp customer asked to speak to the team.`,
    ``,
    `Name: ${profileName || "—"}`,
    `WhatsApp: +${phone}`,
    `Chat: https://wa.me/${phone}`,
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
  try {
    const sent = await trySendOwnerOperationalEmail(env, {
      to: env.BOOKING_TO_EMAIL?.trim() || "bookings@myairporttaxini.co.uk",
      subject: `WhatsApp: ${profileName || `+${phone}`} wants to speak to you`,
      body: lines.join("\n"),
    });
    if (!sent.sent) logEvent("whatsapp_handoff_email_failed", phone);
  } catch {
    logEvent("whatsapp_handoff_email_failed", phone);
  }
}

async function reply(
  env: WhatsAppEnv,
  phone: string,
  text: string,
  buttons?: WhatsAppReplyButton[],
): Promise<void> {
  if (buttons?.length) {
    const withButtons = await sendWhatsAppButtons(env, phone, text, buttons);
    if (withButtons.sent) return;
    logEvent("whatsapp_buttons_failed", phone, { error: withButtons.error });
  }
  const result = await sendWhatsAppText(env, phone, text);
  if (!result.sent) logEvent("whatsapp_send_failed", phone, { error: result.error });
}
