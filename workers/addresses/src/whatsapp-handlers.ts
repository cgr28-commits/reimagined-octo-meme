/**
 * WhatsApp Business Platform webhook — quote assistant.
 *
 * GET  /whatsapp/webhook — Meta verification handshake (hub.challenge).
 * POST /whatsapp/webhook — signed message notifications. Customers chat to get a
 *      fixed price; the reply carries a Quick Quote link where they book and pay.
 *
 * Coexistence-friendly: when the owner replies from the WhatsApp Business app
 * (smb_message_echoes), the assistant pauses for that customer so it never talks
 * over a human. Customers can also reply AGENT to pause it themselves.
 */

import {
  parseWhatsAppWebhook,
  sendWhatsAppText,
  verifyWhatsAppSignature,
  whatsAppCloudConfigured,
  whatsAppVerifyChallenge,
  type WhatsAppCloudEnv,
  type WhatsAppInboundMessage,
} from "../shared/whatsapp-cloud";
import {
  buildWhatsAppQuoteFailedReply,
  buildWhatsAppQuoteReply,
  decideWhatsAppReply,
  whatsAppDraftToQuoteBody,
  type WhatsAppConversation,
} from "../shared/whatsapp-quote-bot";
import { createPricedQuickQuote } from "./quick-quote-handlers";
import { consumeQuickQuoteCreateQuota } from "./quick-quote-store";

export type WhatsAppEnv = WhatsAppCloudEnv & {
  TRACKING_STORE?: KVNamespace;
  SITE_ORIGIN?: string;
  GOOGLE_PLACES_API_KEY?: string;
  /** Set to "false" to stop automatic replies (webhook still verifies and dedupes). */
  WHATSAPP_BOT_ENABLED?: string;
  /** Hours the assistant stays quiet after a handoff or an owner reply (default 12). */
  WHATSAPP_HANDOFF_HOURS?: string;
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
  const validSignature = await verifyWhatsAppSignature(
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

  if (decision.action === "handoff") {
    await store.put(pausedKey(phone), "customer", { expirationTtl: handoffTtlSeconds(env) });
    logEvent("whatsapp_bot_handoff", phone);
  }

  if (decision.action === "quote") {
    const quota = await consumeQuickQuoteCreateQuota(
      store,
      `whatsapp:${phone}`,
      QUOTES_PER_CUSTOMER_PER_HOUR,
    );
    if (quota === "limited") {
      text = "You've requested a lot of quotes in the last hour. Please try again later, or reply *AGENT* to speak to our team.";
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
        logEvent("whatsapp_quote_sent", phone, {
          idSuffix: priced.record.id.slice(-6),
          quotedAmount: priced.record.quotedAmount,
          returnJourney: priced.record.journey.returnJourney,
          airportCode: priced.record.journey.airportCode ?? null,
        });
      } else {
        conversation.stage = "collecting";
        text = buildWhatsAppQuoteFailedReply(priced.status === 422 ? undefined : priced.error);
        logEvent("whatsapp_quote_failed", phone, { status: priced.status, reason: priced.reason });
      }
    }
  }

  await store.put(conversationKey(phone), JSON.stringify(conversation), {
    expirationTtl: CONVERSATION_TTL_SECONDS,
  });
  if (text) await reply(env, phone, text);
}

async function reply(env: WhatsAppEnv, phone: string, text: string): Promise<void> {
  const result = await sendWhatsAppText(env, phone, text);
  if (!result.sent) logEvent("whatsapp_send_failed", phone, { error: result.error });
}
