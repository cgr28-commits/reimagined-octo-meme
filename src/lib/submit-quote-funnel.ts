import { buildQuoteLeadFingerprint, type QuoteLeadDetails } from "../../shared/quote-lead";
import { buildQuoteAnalyticsKey } from "../../shared/pricing-intelligence";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";

const WORKER_BASE = resolveWorkerBaseUrl();
const FUNNEL_URL = `${WORKER_BASE}/quote-funnel`;
const SESSION_ANALYTICS_KEY = "matni-quote-analytics-key";

export type QuoteFunnelEvent = "book_click" | "checkout_started" | "paid";

function rememberAnalyticsKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_ANALYTICS_KEY, key);
  } catch {
    // ignore
  }
}

export function readRememberedAnalyticsKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(SESSION_ANALYTICS_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function rememberQuoteAnalyticsFromDetails(details: QuoteLeadDetails): string {
  const key = buildQuoteAnalyticsKey({
    pickupLabel: details.pickupLabel,
    dropoffLabel: details.dropoffLabel,
    returnJourney: details.returnJourney,
    estimatedPrice: details.estimatedPrice,
    vehicle: details.vehicle,
    passengers: details.passengers,
    suitcases: details.suitcases,
  });
  rememberAnalyticsKey(key);
  return key;
}

export async function submitQuoteFunnelEvent(
  event: QuoteFunnelEvent,
  details?: Partial<QuoteLeadDetails> & { fingerprint?: string; analyticsKey?: string },
): Promise<void> {
  if (typeof window === "undefined") return;

  const fingerprint =
    details?.fingerprint?.trim() ||
    (details?.pickupLabel && details?.dropoffLabel && details?.estimatedPrice && details?.vehicle
      ? buildQuoteLeadFingerprint({
          tripLabel: details.tripLabel || "",
          pickupLabel: details.pickupLabel,
          dropoffLabel: details.dropoffLabel,
          returnJourney: Boolean(details.returnJourney),
          tripDate: details.tripDate,
          tripTime: details.tripTime,
          returnDate: details.returnDate,
          returnTime: details.returnTime,
          passengers: Number(details.passengers) || 1,
          suitcases: Number(details.suitcases) || 0,
          vehicle: details.vehicle,
          estimatedPrice: details.estimatedPrice,
          isAirportTrip: Boolean(details.isAirportTrip),
        })
      : "");

  const analyticsKey =
    details?.analyticsKey?.trim() ||
    readRememberedAnalyticsKey() ||
    (details?.pickupLabel && details?.dropoffLabel && details?.estimatedPrice
      ? buildQuoteAnalyticsKey({
          pickupLabel: details.pickupLabel,
          dropoffLabel: details.dropoffLabel,
          returnJourney: Boolean(details.returnJourney),
          estimatedPrice: details.estimatedPrice,
          vehicle: details.vehicle || "",
          passengers: Number(details.passengers) || 1,
          suitcases: Number(details.suitcases) || 0,
        })
      : "");

  if (!fingerprint && !analyticsKey) return;

  if (analyticsKey) rememberAnalyticsKey(analyticsKey);

  try {
    await fetch(FUNNEL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        event,
        fingerprint: fingerprint || undefined,
        analyticsKey: analyticsKey || undefined,
        pickupLabel: details?.pickupLabel,
        dropoffLabel: details?.dropoffLabel,
        returnJourney: details?.returnJourney,
        estimatedPrice: details?.estimatedPrice,
        vehicle: details?.vehicle,
        passengers: details?.passengers,
        suitcases: details?.suitcases,
      }),
      keepalive: true,
    });
  } catch (error) {
    console.error("Quote funnel event failed", error);
  }
}

export { buildQuoteAnalyticsKey };
