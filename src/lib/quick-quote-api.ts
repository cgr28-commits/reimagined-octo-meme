import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import { withRequestDeadline } from "@/lib/request-deadline";
import {
  customerSmartAvailabilityPreviewHeaders,
  withCustomerSmartAvailabilityPreviewUrl,
} from "@/lib/customer-smart-availability-client";
import type {
  QuickQuoteDiscountType,
  QuickQuoteJourney,
  QuickQuotePriceSource,
  QuickQuotePublicSummary,
  QuickQuoteValidityMode,
  QuickQuoteVehicleChoice,
} from "../../shared/quick-quote";
import type { TripRouteMetrics } from "@/lib/trip-route";
import {
  parsePublicCustomerAlternativeTimes,
  type CustomerPublicAlternativeTime,
} from "../../shared/customer-smart-availability";
import {
  parsePublicOwnerAvailability,
  type PublicOwnerAvailability,
} from "../../shared/booking-notice";
import type { PublicDepositCashOffer } from "../../shared/deposit-cash";

const WORKER_BASE = resolveWorkerBaseUrl();

export type {
  QuickQuoteJourney,
  QuickQuotePublicSummary,
  QuickQuoteVehicleChoice,
  QuickQuoteDiscountType,
  QuickQuotePriceSource,
  QuickQuoteValidityMode,
};

export type CustomerSmartAvailabilityQuoteSignal = {
  enforced: boolean;
  available: boolean;
  blocked: boolean;
  customerMessage: string | null;
  alternativeTimes?: CustomerPublicAlternativeTime[];
};

export type QuickQuoteCalculateResult =
  | {
      ok: true;
      amount: number;
      amountLabel: string;
      vehicleType: string;
      vehicleChoice?: QuickQuoteVehicleChoice;
      premiumApplied: boolean;
      returnJourney: boolean;
      journeyFareGbp?: number;
      nightWeekendSurchargeGbp?: number;
      nightWeekendSurchargeLabel?: string;
      nightWeekendSurchargeExplanation?: string;
      airportFixedCostsGbp?: number;
      outboundOneWayBeforeAccessGbp?: number;
      returnOneWayBeforeAccessGbp?: number;
      /** Opaque Worker receipt. Present only while profitability protection is active. */
      quoteReceipt?: string;
      preserveBfsMinimumPence?: boolean;
      distanceKm?: number;
      durationMinutes?: number;
      smartAvailability?: CustomerSmartAvailabilityQuoteSignal;
      minimumBookingNoticeHours?: number;
      ownerAvailability?: PublicOwnerAvailability;
      depositCash?: PublicDepositCashOffer;
    }
  | { ok: false; reason?: string; message: string; error?: string };

export type QuickQuoteCreateResult = {
  ok: true;
  quote: QuickQuotePublicSummary & {
    calculatedAmount?: number;
    calculatedAmountLabel?: string;
    discountType?: QuickQuoteDiscountType;
    discountValue?: number;
    discountAmount?: number;
  };
  bookingUrl: string;
  whatsappReply: string;
};

export type QuickQuoteDiscountPayload = {
  discountType?: QuickQuoteDiscountType;
  discountValue?: number;
  expressDropOffSelected?: boolean;
  /** website-pricing-engine (default) | owner-manual */
  priceSource?: QuickQuotePriceSource;
  /** Transfer fare before discount when priceSource is owner-manual. */
  manualTransferFare?: number;
  /** Link validity — omit entirely for legacy 24h Worker default. */
  validityMode?: QuickQuoteValidityMode;
  /** Required when validityMode is custom (1–365). */
  validityDays?: number;
};

export type QuickQuoteRoutePayload = {
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  pickupPlaceId?: string;
  dropoffPlaceId?: string;
  /** Browser-resolved driving metrics (same path as public TripMap / Personal Quotes). */
  routeMetrics?: TripRouteMetrics | null;
};

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") return {};
  return payload as Record<string, unknown>;
}

async function calculateServerQuoteOnce(
  journey: QuickQuoteJourney &
    QuickQuoteRoutePayload & {
      vehicleChoice?: QuickQuoteVehicleChoice;
    },
  ownerKey?: string,
  signal?: AbortSignal,
): Promise<QuickQuoteCalculateResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...customerSmartAvailabilityPreviewHeaders(),
  };
  if (ownerKey?.trim()) {
    headers["X-Owner-Key"] = ownerKey.trim();
  }
  const response = await fetch(
    withCustomerSmartAvailabilityPreviewUrl(`${WORKER_BASE}/quote/calculate`),
    {
      method: "POST",
      headers,
      body: JSON.stringify({ ...journey, quoteProtocol: "optional-terminal-access-v4" }),
      cache: "no-store",
      signal,
    },
  );
  const payload = await parseJson(response);
  if (!response.ok) {
    return {
      ok: false,
      reason: String(payload.reason ?? (response.status >= 500 ? "server_unavailable" : "")),
      message: String(payload.message || payload.error || "Could not calculate fare"),
      error: String(payload.error ?? ""),
    };
  }
  if (payload.ok !== true) {
    return {
      ok: false,
      message: String(payload.message || "Could not calculate fare"),
    };
  }
  const smartRaw =
    payload.smartAvailability && typeof payload.smartAvailability === "object"
      ? (payload.smartAvailability as Record<string, unknown>)
      : null;
  const smartAvailability = smartRaw
    ? {
        enforced: smartRaw.enforced === true,
        available: smartRaw.available !== false,
        blocked: smartRaw.blocked === true,
        customerMessage:
          typeof smartRaw.customerMessage === "string" ? smartRaw.customerMessage : null,
        alternativeTimes: parsePublicCustomerAlternativeTimes(smartRaw.alternativeTimes),
      }
    : undefined;

  return {
    ok: true,
    amount: Number(payload.amount),
    preserveBfsMinimumPence: payload.preserveBfsMinimumPence === true,
    amountLabel: String(payload.amountLabel ?? ""),
    vehicleType: String(payload.vehicleType ?? ""),
    vehicleChoice:
      payload.vehicleChoice === "Minibus" ||
      payload.vehicleChoice === "Estate" ||
      payload.vehicleChoice === "Saloon"
        ? payload.vehicleChoice
        : undefined,
    nightWeekendSurchargeLabel: typeof payload.nightWeekendSurchargeLabel === "string" ? payload.nightWeekendSurchargeLabel : undefined,
    nightWeekendSurchargeExplanation: typeof payload.nightWeekendSurchargeExplanation === "string" ? payload.nightWeekendSurchargeExplanation : undefined,
    premiumApplied: payload.premiumApplied === true,
    returnJourney: payload.returnJourney === true,
    ...(typeof payload.journeyFareGbp === "number"
      ? { journeyFareGbp: Number(payload.journeyFareGbp) }
      : {}),
    ...(typeof payload.nightWeekendSurchargeGbp === "number"
      ? { nightWeekendSurchargeGbp: Number(payload.nightWeekendSurchargeGbp) }
      : {}),
    ...(typeof payload.airportFixedCostsGbp === "number"
      ? { airportFixedCostsGbp: Number(payload.airportFixedCostsGbp) }
      : {}),
    ...(typeof payload.outboundOneWayBeforeAccessGbp === "number"
      ? { outboundOneWayBeforeAccessGbp: Number(payload.outboundOneWayBeforeAccessGbp) }
      : {}),
    ...(typeof payload.returnOneWayBeforeAccessGbp === "number"
      ? { returnOneWayBeforeAccessGbp: Number(payload.returnOneWayBeforeAccessGbp) }
      : {}),
    ...(typeof payload.quoteReceipt === "string" &&
    payload.quoteReceipt.startsWith("v4-optional-terminal-access.") &&
    payload.quoteReceipt.length < 4000
      ? { quoteReceipt: payload.quoteReceipt }
      : {}),
    ...(payload.diagnostics &&
    typeof payload.diagnostics === "object" &&
    Number.isFinite(Number((payload.diagnostics as { distanceKm?: unknown }).distanceKm))
      ? {
          distanceKm: Number((payload.diagnostics as { distanceKm: number }).distanceKm),
          durationMinutes: Number(
            (payload.diagnostics as { routeDurationMinutes?: number }).routeDurationMinutes,
          ),
        }
      : {}),
    ...(smartAvailability ? { smartAvailability } : {}),
    ...(typeof payload.minimumBookingNoticeHours === "number"
      ? { minimumBookingNoticeHours: Number(payload.minimumBookingNoticeHours) }
      : {}),
    ownerAvailability: parsePublicOwnerAvailability(payload.ownerAvailability),
    ...(payload.depositCash && typeof payload.depositCash === "object"
      ? {
          depositCash: {
            enabled: (payload.depositCash as { enabled?: unknown }).enabled === true,
            eligible: (payload.depositCash as { eligible?: unknown }).eligible === true,
            percent: Number((payload.depositCash as { percent?: unknown }).percent),
            minimumGbp: Number((payload.depositCash as { minimumGbp?: unknown }).minimumGbp),
            totalFare: Number((payload.depositCash as { totalFare?: unknown }).totalFare),
            depositGbp: Number((payload.depositCash as { depositGbp?: unknown }).depositGbp),
            cashDueGbp: Number((payload.depositCash as { cashDueGbp?: unknown }).cashDueGbp),
          },
        }
      : {}),
  };
}

export async function createOwnerQuickQuote(
  ownerKey: string,
  journey: QuickQuoteJourney &
    QuickQuoteDiscountPayload &
    QuickQuoteRoutePayload & {
      vehicleChoice?: QuickQuoteVehicleChoice;
    },
): Promise<QuickQuoteCreateResult> {
  const response = await fetch(`${WORKER_BASE}/owner/quick-quotes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify(journey),
    cache: "no-store",
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not create booking link"));
  }
  if (!payload.quote || typeof payload.quote !== "object") {
    throw new Error("Could not create booking link");
  }
  return {
    ok: true,
    quote: payload.quote as QuickQuoteCreateResult["quote"],
    bookingUrl: String(payload.bookingUrl ?? ""),
    whatsappReply: String(payload.whatsappReply ?? ""),
  };
}

export async function fetchQuickQuoteById(id: string): Promise<QuickQuotePublicSummary> {
  const response = await fetch(
    `${WORKER_BASE}/quick-quotes/by-id?id=${encodeURIComponent(id.trim())}`,
    { headers: { Accept: "application/json" }, cache: "no-store" },
  );
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(
      String(
        payload.error ||
          "This quote link is invalid or no longer available. Please contact My Airport Taxi NI.",
      ),
    );
  }
  const quote = payload.quote;
  if (!quote || typeof quote !== "object") {
    throw new Error(
      "This quote link is invalid or no longer available. Please contact My Airport Taxi NI.",
    );
  }
  return quote as QuickQuotePublicSummary;
}

/** Customer changed the pickup date/time on a quote link: the Worker re-prices it (surcharges). */
export async function rescheduleQuickQuote(
  id: string,
  schedule: { outboundDate: string; outboundTime: string; returnDate?: string; returnTime?: string },
): Promise<QuickQuotePublicSummary> {
  const response = await fetch(`${WORKER_BASE}/quick-quotes/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ id: id.trim(), ...schedule }),
    cache: "no-store",
  });
  const payload = await parseJson(response);
  if (!response.ok || !payload.quote || typeof payload.quote !== "object") {
    throw new Error(String(payload.error || "We couldn't update the price for that time. Please try again."));
  }
  return payload.quote as QuickQuotePublicSummary;
}

/** A transient route/provider error retries once without changing fare or journey inputs. */
export async function calculateServerQuote(
  journey: QuickQuoteJourney & QuickQuoteRoutePayload & { vehicleChoice?: QuickQuoteVehicleChoice },
  ownerKey?: string,
  signal?: AbortSignal,
): Promise<QuickQuoteCalculateResult> {
  try {
    return await withRequestDeadline(async (requestSignal) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (requestSignal.aborted) throw new DOMException("Quote request cancelled", "AbortError");
        try {
          const result = await calculateServerQuoteOnce(journey, ownerKey, requestSignal);
          if (attempt === 1 || result.ok || !["routing_unavailable", "server_unavailable"].includes(result.reason ?? "")) return result;
        } catch (error) {
          if (attempt === 1 || requestSignal.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
        }
      }
      throw new Error("Could not calculate fare");
    }, 20_000, signal);
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { ok: false, reason: "timeout", message: "We couldn’t load your price. Please try again." };
    }
    throw error;
  }
}
