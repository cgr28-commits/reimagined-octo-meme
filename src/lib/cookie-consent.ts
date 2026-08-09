export type CookieConsentChoice = "accepted" | "rejected";

export const COOKIE_CONSENT_KEY = "matni-cookie-consent-v1";
export const COOKIE_CONSENT_EVENT = "matni-cookie-consent-change";

export function readCookieConsent(): CookieConsentChoice | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (value === "accepted" || value === "rejected") {
      return value;
    }
  } catch {
    // Ignore storage failures.
  }

  return null;
}

export function writeCookieConsent(choice: CookieConsentChoice): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, choice);
  } catch {
    // Ignore storage failures.
  }

  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: choice }));
}

/** Non-essential measurement / advertising cookies (e.g. Google Ads). */
export function hasMarketingCookieConsent(): boolean {
  return readCookieConsent() === "accepted";
}
