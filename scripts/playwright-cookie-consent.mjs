/** Shared cookie-consent helpers for Playwright browser checks. */

export const COOKIE_CONSENT_KEY = "matni-cookie-consent-v1";

/**
 * Pre-seed a rejected consent choice so non-consent browser checks are not
 * blocked by the modal/overlay race after hydration.
 */
export async function skipCookieConsent(context) {
  await context.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, "rejected");
    } catch {
      /* ignore quota / private-mode failures; dismissCookieConsent remains */
    }
  }, COOKIE_CONSENT_KEY);
}

/** Click Decline all when present and wait until the dialog is gone. */
export async function dismissCookieConsent(page, { timeout = 8000 } = {}) {
  const reject = page.getByRole("button", { name: "Decline all", exact: true });
  try {
    await reject.waitFor({ state: "visible", timeout: Math.min(timeout, 2500) });
  } catch {
    return;
  }
  await reject.click();
  await page.getByRole("dialog", { name: "Your privacy and how we use your data" }).waitFor({ state: "hidden", timeout });
}
