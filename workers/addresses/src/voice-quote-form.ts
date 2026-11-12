/**
 * Phone receptionist tool "Send Quote Form" — POST /voice/quote-form (12 Nov 2026).
 *
 * For callers struggling to give their journey on the phone (addresses not found, a bad line,
 * they'd rather type): send them something to fill in themselves.
 * - WhatsApp: the in-WhatsApp quote form (template mat_quote_form with a FLOW button). They
 *   pick their addresses from a list and the fixed price comes back on WhatsApp.
 * - No WhatsApp (or the form isn't available yet): a text with the website's quote tool, sent
 *   by Fonio (sendBySms + smsText, like Send Booking Link).
 */
import { createQuoteFormSession, whatsAppQuoteFormEnabled, type WhatsAppEnv } from "./whatsapp-handlers";
import { sendQuoteFormTemplate, whatsAppRecipient, type WhatsAppTemplateEnv } from "./whatsapp-templates";
import { consumeQuickQuoteCreateQuota } from "./quick-quote-store";

const FORMS_PER_NUMBER_PER_HOUR = 3;

export const VOICE_QUOTE_FORM_WHATSAPP_SAY =
  "Done — I've sent you a short form on WhatsApp. Tap Get my price, type where you're going and pick the right addresses from the list, and your fixed price will come straight back to you on WhatsApp.";
export const VOICE_QUOTE_FORM_SMS_SAY =
  "I've texted you a link to our quote page. Enter your journey there and you'll see your fixed price straight away.";

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function isUkMobile(digits: string): boolean {
  return /^(\+?44|0)7\d{9}$/.test(digits);
}

/** "sms" / "text" → sms; "whatsapp" → whatsapp; anything else → auto (WhatsApp first). */
function channelOf(value: unknown): "sms" | "whatsapp" | "auto" {
  const v = String(value ?? "").trim().toLowerCase();
  if (/^(sms|text|txt)$/.test(v) || (v.includes("text") && !v.includes("whatsapp"))) return "sms";
  if (v.includes("whatsapp") || v === "wa") return "whatsapp";
  return "auto";
}

export function voiceQuoteFormSmsText(siteOrigin: string): string {
  return (
    "My Airport Taxi NI: get your fixed price here — enter your journey and pick your addresses: " +
    `${siteOrigin}/#quote`
  );
}

export async function handleVoiceQuoteForm(
  request: Request,
  env: WhatsAppEnv & WhatsAppTemplateEnv,
): Promise<Response> {
  const store = env.TRACKING_STORE;
  const fallback = "No problem — the team will message you to get your journey details.";
  if (!store) return reply({ ok: false, say: fallback });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const root = body && typeof body === "object" ? body : {};
  const input = (root.parameters && typeof root.parameters === "object" ? root.parameters : root) as Record<string, unknown>;
  const mobile = String(input.mobile ?? input.phone ?? "").trim();
  const digits = mobile.replace(/[^\d+]/g, "");
  const channel = channelOf(input.channel ?? input.sendVia);
  const waTo = whatsAppRecipient(digits || mobile);
  const ukMobile = isUkMobile(digits);
  const origin = (env.SITE_ORIGIN?.trim() || "https://www.myairporttaxini.co.uk").replace(/\/+$/, "");

  if (!waTo && !ukMobile) {
    return reply({ ok: false, missing: ["mobile"], say: "What's the best mobile number to send it to?" });
  }
  if ((await consumeQuickQuoteCreateQuota(store, `voice:quote-form:${waTo || digits}`, FORMS_PER_NUMBER_PER_HOUR)) === "limited") {
    return reply({ ok: false, say: "I've already sent that a few times. Please check your WhatsApp or texts for it." });
  }

  // WhatsApp first (unless they asked for a text): the form opens inside WhatsApp.
  if (channel !== "sms" && waTo && whatsAppQuoteFormEnabled(env, waTo)) {
    const pickup = String(input.pickup ?? "").trim().slice(0, 120);
    const dropoff = String(input.destination ?? input.dropoff ?? "").trim().slice(0, 120);
    const token = await createQuoteFormSession(store, waTo, { pickup, dropoff });
    const sent = await sendQuoteFormTemplate(env, { mobile: waTo, flowToken: token });
    console.log(JSON.stringify({ event: "voice_quote_form", channel: "whatsapp", sent: sent.sent, reason: sent.sent ? null : sent.reason }));
    if (sent.sent) {
      // WhatsApp accepted it for sending — not proof it reached the phone.
      return reply({ ok: true, channel: "whatsapp", messageStatus: "accepted", delivered: false, say: VOICE_QUOTE_FORM_WHATSAPP_SAY });
    }
  }

  // A text with the website's quote tool (UK mobiles only, sent by Fonio).
  if (ukMobile) {
    console.log(JSON.stringify({ event: "voice_quote_form", channel: "sms" }));
    return reply({
      ok: false,
      sendBySms: true,
      channel: "sms",
      messageStatus: "generated",
      delivered: false,
      mobile: digits,
      smsText: voiceQuoteFormSmsText(origin),
      sayAfterSmsAccepted: VOICE_QUOTE_FORM_SMS_SAY,
      sayAfterSmsSent: VOICE_QUOTE_FORM_SMS_SAY,
      say: "One moment — I'm texting you a link to our quote page now.",
    });
  }
  return reply({
    ok: false,
    say: "Texts only go to UK mobiles, and I couldn't send it on WhatsApp just now. The team will message you to get your journey details.",
  });
}
