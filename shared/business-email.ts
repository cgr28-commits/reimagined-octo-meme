/** Canonical business mailbox for My Airport Taxi NI — all site mail uses this. */
export const BUSINESS_MAILBOX = "bookings@myairporttaxini.co.uk";
export const BUSINESS_NAME = "My Airport Taxi NI";
export const BUSINESS_WEBSITE = "https://www.myairporttaxini.co.uk";
/** Matches site brand tokens in globals.css (--color-navy / --color-emerald). */
export const BRAND_NAVY = "#071c38";
export const BRAND_EMERALD = "#2fbf4a";
export const BUSINESS_PHONE_DISPLAY = "028 9602 2952";
export const BUSINESS_PHONE_TEL = "+442896022952";
/** Same digits as website SITE.whatsapp — never show this number in customer email copy. */
export const BUSINESS_WHATSAPP_DIGITS = "447549815538";
export const BUSINESS_WHATSAPP_USERNAME = "belfasttaxi";
export const BUSINESS_WHATSAPP_DEFAULT_MESSAGE = "Hi, I'd like some help.";

/** Canonical website click-to-chat URL (number is in the href only, never as visible copy). */
export function businessWhatsAppChatUrl(
  message = BUSINESS_WHATSAPP_DEFAULT_MESSAGE,
): string {
  return `https://wa.me/${BUSINESS_WHATSAPP_DIGITS}?text=${encodeURIComponent(message)}`;
}

/** Number-free branded page that already hosts the website WhatsApp chat control. */
export function businessWhatsAppPublicPageUrl(siteUrl = BUSINESS_WEBSITE): string {
  return `${siteUrl.replace(/\/$/, "")}/contact/`;
}

/** Always bookings@ — ignore env overrides that point elsewhere. */
export function businessMailbox(_candidate?: string | null): string {
  return BUSINESS_MAILBOX;
}

export function isBusinessMailbox(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === BUSINESS_MAILBOX;
}

/**
 * Force SumUp browser returns for /booking-confirmed/ onto the canonical www host.
 * Apex myairporttaxini.co.uk does not serve this route (404).
 */
export function canonicalizeBookingConfirmedRedirectUrl(redirectUrl: string): string {
  const trimmed = redirectUrl.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
    if (normalizedPath !== "/booking-confirmed") {
      return trimmed;
    }
    const canonical = new URL("/booking-confirmed/", `${BUSINESS_WEBSITE}/`);
    parsed.searchParams.forEach((value, key) => {
      canonical.searchParams.set(key, value);
    });
    if (parsed.hash) {
      canonical.hash = parsed.hash;
    }
    return canonical.toString();
  } catch {
    return trimmed;
  }
}
