import {
  CONSENT_MAX_AGE_MS,
  MEASUREMENT_POLICY_VERSION,
  sanitizeMeasurementConsent,
  type MeasurementConsent,
} from "../../shared/measurement-consent";
import { resolveWorkerBaseUrl } from "./worker-api";
export type CookieConsentChoice = "accepted" | "rejected";
export const COOKIE_CONSENT_KEY = "matni-cookie-consent-v2";
export const COOKIE_CONSENT_EVENT = "matni-cookie-consent-change";
let deniedInMemory = false;
let preferenceWriteFailed = false;
let withdrawalFlight: Promise<boolean> | undefined;
export const CONSENT_FAIL_CLOSED_PARAM = "measurement";
const DENIED_COOKIE = "matni-measurement-denied";
function hasDeniedCookie(): boolean {
  try { return document.cookie.split(";").some((part) => part.trim() === `${DENIED_COOKIE}=1`); }
  catch { return false; }
}
export function blockMeasurementInMemory(): void { deniedInMemory = true; }
export function consentPreferenceWriteFailed(): boolean { return preferenceWriteFailed; }
function hasDeniedReloadMarker(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location?.search ?? "").get(CONSENT_FAIL_CLOSED_PARAM) === "off";
}
const WITHDRAWALS_KEY = "matni-consent-withdrawals-v1";
export function readMeasurementConsent(): MeasurementConsent | undefined {
  if (typeof window === "undefined" || deniedInMemory || hasDeniedReloadMarker() || hasDeniedCookie()) return;
  try {
    return sanitizeMeasurementConsent(
      JSON.parse(window.localStorage.getItem(COOKIE_CONSENT_KEY) || "null"),
    );
  } catch {
    return;
  }
}
export function readCookieConsent(): CookieConsentChoice | null {
  const c = readMeasurementConsent();
  return c ? (c.advertising ? "accepted" : "rejected") : null;
}
export function hasMarketingCookieConsent(): boolean {
  return readMeasurementConsent()?.advertising === true;
}
export function hasAnalyticsCookieConsent(): boolean {
  return readMeasurementConsent()?.analytics === true;
}
function pendingWithdrawals(): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(WITHDRAWALS_KEY) || "[]");
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function hasPendingConsentWithdrawals(): boolean { return pendingWithdrawals().length > 0; }
/** Essential preference synchronisation only; contains no booking/customer/marketing identifiers. */
async function sendConsentWithdrawals(): Promise<boolean> {
  if (typeof window === "undefined") return true;
  const ids = pendingWithdrawals();
  if (!ids.length) return true;
  try {
    const response = await fetch(
      `${resolveWorkerBaseUrl()}/measurement/withdraw`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        keepalive: true,
      },
    );
    if (!response.ok) return false;
    const remaining = pendingWithdrawals().filter((id) => !ids.includes(id));
    localStorage.setItem(WITHDRAWALS_KEY, JSON.stringify(remaining));
    return true;
  } catch {
    return false;
  }
}
/** Coalesce mount/online/UI retries; a failed request never drops receipt IDs. */
export function flushConsentWithdrawals(): Promise<boolean> {
  if (!withdrawalFlight) withdrawalFlight = sendConsentWithdrawals().finally(() => { withdrawalFlight = undefined; });
  return withdrawalFlight;
}
export function clearOptionalMeasurementStorage(): void {
  if (typeof window === "undefined") return;
  for (const kind of ["localStorage", "sessionStorage"] as const) {
    let storage: Storage;
    try {
      storage = window[kind];
    } catch {
      continue;
    }
    try {
      for (const key of Array.from({ length: storage.length }, (_, i) =>
        storage.key(i),
      ).filter((k): k is string => !!k))
        if (
          key.startsWith("matni-funnel-") ||
          key.startsWith("matni-ads-") ||
          key.startsWith("matni-ad-fraud-") ||
          key === "matni-security-sid"
        )
          storage.removeItem(key);
    } catch {
      /* unavailable storage */
    }
  }
  if (typeof document !== "undefined") {
    for (const part of document.cookie.split(";")) {
      const name = part.split("=")[0].trim();
      if (!/^(_gcl_|_ga|matni-ads-)/.test(name)) continue;
      const domains = [
        "",
        window.location.hostname,
        "." + window.location.hostname,
        ".myairporttaxini.co.uk",
      ];
      for (const domain of domains)
        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ""}`;
    }
  }
}
export function writeCookieConsent(
  choice: CookieConsentChoice,
  analytics = false,
): boolean {
  if (typeof window === "undefined") return false;
  let previous: MeasurementConsent | undefined;
  try {
    previous =
      JSON.parse(localStorage.getItem(COOKIE_CONSENT_KEY) || "null") ??
      undefined;
  } catch {
    /* no evidence */
  }
  const now = Date.now();
  const next: MeasurementConsent = {
    id: crypto.randomUUID(),
    version: MEASUREMENT_POLICY_VERSION,
    recordedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CONSENT_MAX_AGE_MS).toISOString(),
    advertising: choice === "accepted",
    analytics,
    personalization: false,
  };
  try {
    // Replacing a preference retires its previous grant, including already expired grants.
    if (previous?.advertising && /^[a-f0-9-]{36}$/i.test(previous.id))
      localStorage.setItem(
        WITHDRAWALS_KEY,
        JSON.stringify([...new Set([...pendingWithdrawals(), previous.id])]),
      );
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(next));
    deniedInMemory = false;
    preferenceWriteFailed = false;
    document.cookie = `${DENIED_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`;
    if (hasDeniedReloadMarker()) {
      const url = new URL(window.location.href);
      url.searchParams.delete(CONSENT_FAIL_CLOSED_PARAM);
      window.history.replaceState(window.history.state, "", url);
    }
    localStorage.removeItem("matni-cookie-consent-v1");
  } catch {
    preferenceWriteFailed = true;
    deniedInMemory = true;
    // Independent essential preference fallback if localStorage is unavailable.
    // The URL marker additionally protects navigation when cookies are blocked.
    try { document.cookie = `${DENIED_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=${Math.floor(CONSENT_MAX_AGE_MS / 1000)}`; } catch { /* URL fallback */ }
    try { localStorage.removeItem(COOKIE_CONSENT_KEY); } catch { /* fail closed in this document */ }
  }
  clearOptionalMeasurementStorage();
  // Start an essential keepalive receipt before any document shutdown; do not await it.
  void flushConsentWithdrawals();
  window.dispatchEvent(
    new CustomEvent(COOKIE_CONSENT_EVENT, {
      detail: readCookieConsent() || "rejected",
    }),
  );
  return !preferenceWriteFailed;
}
