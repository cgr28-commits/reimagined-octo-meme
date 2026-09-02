/**
 * Passive Ad Fraud / advertising-abuse monitoring beacons.
 * Internal Worker events only — never fires Google Ads conversions.
 */

import {
  attributionFromSearchParams,
  isPaidAdAttribution,
  type AdFraudEventType,
} from "../../shared/ad-fraud";
import { sanitizeAdsAttribution, type AdsAttribution } from "../../shared/ads-attribution";
import { resolveWorkerBaseUrl } from "./worker-api";

const SESSION_KEY = "matni-security-sid";
const PAID_VISIT_KEY = "matni-ad-fraud-paid-visit";

function resolveAdFraudEventsUrl(): string {
  return `${resolveWorkerBaseUrl()}/ad-fraud/events`;
}

export function getOrCreateSecuritySessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY)?.trim();
    if (existing && existing.length >= 8) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "")
        : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `s${Date.now().toString(36)}`;
  }
}

function readUrlAttribution(): AdsAttribution | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return attributionFromSearchParams(new URLSearchParams(window.location.search));
  } catch {
    return undefined;
  }
}

function postEvent(
  eventType: AdFraudEventType,
  extras?: {
    attribution?: AdsAttribution;
    meta?: Record<string, string>;
    landingPath?: string;
  },
): void {
  if (typeof window === "undefined") return;
  const payload = {
    eventType,
    sessionId: getOrCreateSecuritySessionId(),
    landingPath: extras?.landingPath || window.location.pathname,
    referrer: document.referrer || undefined,
    userAgent: navigator.userAgent,
    attribution: extras?.attribution,
    meta: extras?.meta,
  };

  const body = JSON.stringify(payload);
  const url = resolveAdFraudEventsUrl();

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
  } catch {
    // Fall through to fetch.
  }

  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Fire-and-forget — never block UX.
  });
}

/** Record a paid-ad landing once per session when ads params are present. */
export function maybeRecordPaidAdVisit(): void {
  if (typeof window === "undefined") return;
  const attribution = readUrlAttribution();
  if (!isPaidAdAttribution(attribution)) return;
  try {
    if (window.sessionStorage.getItem(PAID_VISIT_KEY) === "1") return;
    window.sessionStorage.setItem(PAID_VISIT_KEY, "1");
  } catch {
    // Continue even if sessionStorage is unavailable.
  }
  postEvent("paid_visit", { attribution });
}

export function recordAdFraudBehaviour(
  eventType: Exclude<AdFraudEventType, "paid_visit">,
  meta?: Record<string, string>,
): void {
  postEvent(eventType, {
    attribution: sanitizeAdsAttribution(readUrlAttribution()),
    meta,
  });
}
