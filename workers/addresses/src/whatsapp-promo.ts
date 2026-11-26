/**
 * Promo codes by WhatsApp (owner, 26 Nov 2026).
 *
 * A customer who asks for the promo / discount code is asked for their email, then gets their
 * code in the chat and by email. It uses the same system and rules as the website pop-up
 * (promo switch, one code per email, journey cut-off, excluded dates, rate limits).
 * Deterministic: the AI assistant never offers or invents a discount, it is not involved.
 *
 * One code per WhatsApp number: after a code goes to a number, a different email gets none.
 */
import { requestPromoCodeForChannel, type ChannelPromoResult, type PromoHandlerEnv } from "./promo-handlers";
import { formatPromoPercent } from "../shared/promo-code";

const PENDING_TTL_SECONDS = 30 * 60;
const ISSUED_TTL_SECONDS = 30 * 24 * 60 * 60;
const pendingKey = (phone: string) => `whatsapp:promo-pending:${phone}`;
const issuedKey = (phone: string) => `whatsapp:promo-issued:${phone}`;

const EMAIL_RE = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const REQUEST_RE =
  /\b(promo(tion(al)?)?\s*code|discount\s*code|offer\s*code|coupon|voucher|(5|five)\s*%\s*(off\s*)?code|christmas\s*(gift|offer|code)|(get|send|want|need|claim)\b.{0,25}\bpromo)/i;

export function extractWhatsAppEmail(text: string): string | null {
  const m = EMAIL_RE.exec(text);
  return m ? m[0].toLowerCase() : null;
}

export function isWhatsAppPromoRequest(text: string): boolean {
  return REQUEST_RE.test(text);
}

export type WhatsAppPromoEnv = PromoHandlerEnv & { TRACKING_STORE?: KVNamespace; WHATSAPP_PROMO_ENABLED?: string };

export function whatsAppPromoEnabled(env: { WHATSAPP_PROMO_ENABLED?: string }): boolean {
  return env.WHATSAPP_PROMO_ENABLED?.trim().toLowerCase() !== "false";
}

export const WHATSAPP_PROMO_ASK_EMAIL =
  "Happy to send you the offer code. What email address would you like it sent to? Your code is linked to that email, so please use the same one when you book.";
export const WHATSAPP_PROMO_BAD_EMAIL =
  "That doesn't look like an email address. Please send it like name@example.com, and I'll get your code over.";

function codeMessage(r: Extract<ChannelPromoResult, { ok: true }>): string {
  const until = r.journeyBefore
    ? ` for journeys before ${new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${r.journeyBefore}T12:00:00Z`))}`
    : "";
  return [
    `Here's your ${formatPromoPercent(r.discountRate)} off code: *${r.code}*`,
    `${formatPromoPercent(r.discountRate)} off the vehicle fare${until}, minimum vehicle fare £${r.minimumVehicleFareGbp}, airport charges excluded. Valid for ${r.validityDays} days, one use. A few busy dates, like Christmas and New Year, are excluded.`,
    `At checkout, tap "Have a promo code?" and enter it with the same email address.${r.emailed ? " We've emailed it to you as well." : ""}`,
  ].join("\n\n");
}

/**
 * Returns the reply to send, or null when the message isn't about a promo code (carry on as normal).
 */
export async function handleWhatsAppPromoMessage(
  env: WhatsAppPromoEnv,
  phone: string,
  text: string,
): Promise<string | null> {
  if (!whatsAppPromoEnabled(env)) return null;
  const store = env.TRACKING_STORE;
  if (!store) return null;
  const email = extractWhatsAppEmail(text);
  const wants = isWhatsAppPromoRequest(text);
  const pending = Boolean(await store.get(pendingKey(phone)));
  if (pending && !email && !wants && (/@/.test(text) || /^\S+$/.test(text.trim()))) {
    return WHATSAPP_PROMO_BAD_EMAIL; // looks like an attempt at the email: ask again, keep waiting
  }
  if (!wants && !(pending && email)) {
    // Not about a code. A pending question is dropped once they talk about something else.
    if (pending && text.trim().length > 0) await store.delete(pendingKey(phone));
    return null;
  }
  if (!email) {
    await store.put(pendingKey(phone), "1", { expirationTtl: PENDING_TTL_SECONDS });
    return pending ? WHATSAPP_PROMO_BAD_EMAIL : WHATSAPP_PROMO_ASK_EMAIL;
  }
  await store.delete(pendingKey(phone));
  const prior = await store.get<{ email: string }>(issuedKey(phone), "json");
  if (prior && prior.email !== email) {
    return "A code has already been sent to this number. Please check your emails, or message us here if you can't find it.";
  }
  const result = await requestPromoCodeForChannel(env, { email, source: "whatsapp", rateKey: phone });
  if (!result.ok) {
    switch (result.reason) {
      case "disabled":
        return "There's no offer code running at the moment. I'm happy to get you an exact fixed price for your journey, though.";
      case "rate_limited":
        return "You've asked a few times, so please try again a little later.";
      case "not_eligible":
        if (prior) return "I've already sent your code, in this chat and to your email. Scroll up to find it, or check your inbox.";
        return "I can't send a code to that address. If you think that's wrong, message us here and the team will help.";
      default:
        return "Sorry, I couldn't send your code just now. Please try again in a few minutes.";
    }
  }
  await store.put(issuedKey(phone), JSON.stringify({ email }), { expirationTtl: ISSUED_TTL_SECONDS });
  return codeMessage(result);
}
