/** Canonical business mailbox for My Airport Taxi NI — all site mail uses this. */
export const BUSINESS_MAILBOX = "bookings@myairporttaxini.co.uk";
export const BUSINESS_NAME = "My Airport Taxi NI";
export const BUSINESS_WEBSITE = "https://www.myairporttaxini.co.uk";
/** Matches site brand tokens in globals.css (--color-navy / --color-emerald). */
export const BRAND_NAVY = "#071c38";
export const BRAND_EMERALD = "#2fbf4a";
export const BUSINESS_PHONE_DISPLAY = "028 9602 2952";
export const BUSINESS_PHONE_TEL = "+442896022952";

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
