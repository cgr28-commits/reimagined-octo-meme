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

/**
 * Horizontal email header. PNG export of the website header logo
 * (public/logo-header.webp) so Gmail, Outlook, and Apple Mail can load it.
 * Public HTTPS URL — the file is not attached to the message.
 */
export const BUSINESS_EMAIL_LOGO_URL = `${BUSINESS_WEBSITE}/logo-email.png`;
export const BUSINESS_EMAIL_LOGO_ALT = "My Airport Taxi NI";
/** Display size. Source artwork is 124×96; the PNG is 372×288 so it stays sharp. */
export const BUSINESS_EMAIL_LOGO_WIDTH = 220;
export const BUSINESS_EMAIL_LOGO_HEIGHT = 170;

/**
 * Asks clients that honour it to keep our navy header instead of inverting the logo.
 */
export function businessEmailClientMeta(): string {
  return `<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<style type="text/css">
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  .matni-header, .matni-logo { background-color: #071c38 !important; }
  @media (prefers-color-scheme: dark) {
    .matni-header, .matni-logo { background-color: #071c38 !important; }
  }
</style>`;
}

/**
 * Shared customer-email header mark. One logo, linked to the website.
 * Alt text is the company name, which clients show when images are blocked.
 */
export function businessEmailLogoHtml(): string {
  const width = BUSINESS_EMAIL_LOGO_WIDTH;
  const height = BUSINESS_EMAIL_LOGO_HEIGHT;
  return `<a href="${BUSINESS_WEBSITE}/" style="text-decoration:none;display:inline-block;">
<img class="matni-logo" src="${BUSINESS_EMAIL_LOGO_URL}" alt="${BUSINESS_EMAIL_LOGO_ALT}" width="${width}" height="${height}" border="0" bgcolor="#071c38" style="display:block;margin:0 auto;width:${width}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;background-color:#071c38;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:1.2;color:#ffffff;" />
</a>`;
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
