/**
 * Customer-facing Smart Availability gate.
 * Uses the same evaluateSmartAvailability engine as the Owner Availability tool.
 * Does not change pricing. Alternatives are never suggested on this path.
 */

import type { SmartOpsConfig } from "./smart-ops-config";
import {
  evaluateSmartAvailability,
  parseJourneyDurationMinutes,
  type SmartAvailabilityDecision,
  type SmartOccupiedJob,
  type SmartRequestedJourney,
} from "./smart-conflict";
import type { SmartAvailabilityException, SmartAvailabilityRule } from "./smart-availability";
import type { UnavailablePeriod } from "./booking-notice";

export const CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE =
  "Unfortunately, we’re not available at that time. Please choose another time or contact us on WhatsApp.";

export const CUSTOMER_SMART_AVAILABILITY_CODE = "smart_availability_unavailable";

export const CUSTOMER_SMART_AVAILABILITY_PREVIEW_QUERY = "smartAvailabilityPreview";
export const CUSTOMER_SMART_AVAILABILITY_PREVIEW_HEADER = "X-Smart-Availability-Preview";

export function isPagesPreviewOrigin(originOrHost?: string | null): boolean {
  return /pages\.dev/i.test(String(originOrHost || ""));
}

/**
 * Production customers are gated only when the KV flag is on.
 * Pages preview may opt in with a query/header so we can test without
 * enabling the production flag.
 */
export function shouldEnforceCustomerSmartAvailability(input: {
  smartAvailabilityFlag: boolean;
  origin?: string | null;
  previewRequested?: boolean;
}): boolean {
  if (input.smartAvailabilityFlag === true) return true;
  return Boolean(input.previewRequested && isPagesPreviewOrigin(input.origin));
}

export function previewRequestedFromHeaders(headers: {
  get(name: string): string | null;
}): boolean {
  return String(headers.get(CUSTOMER_SMART_AVAILABILITY_PREVIEW_HEADER) || "") === "1";
}

export function previewRequestedFromRequestUrl(requestUrl?: string | null): boolean {
  try {
    return (
      new URL(String(requestUrl || "")).searchParams.get(
        CUSTOMER_SMART_AVAILABILITY_PREVIEW_QUERY,
      ) === "1"
    );
  } catch {
    return false;
  }
}

export function customerSmartAvailabilityPreviewRequested(input: {
  headers?: { get(name: string): string | null };
  url?: string | null;
}): boolean {
  return (
    (input.headers ? previewRequestedFromHeaders(input.headers) : false) ||
    previewRequestedFromRequestUrl(input.url)
  );
}

export function withCustomerSmartAvailabilityPreviewQuery(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(CUSTOMER_SMART_AVAILABILITY_PREVIEW_QUERY, "1");
  return parsed.toString();
}

/** Same engine as the owner tool. Never search alternative times here. */
export function evaluateCustomerSmartAvailability(input: {
  requested: SmartRequestedJourney;
  occupied: SmartOccupiedJob[];
  rules?: SmartAvailabilityRule[];
  exceptions?: SmartAvailabilityException[];
  legacyPeriods?: UnavailablePeriod[];
  config: SmartOpsConfig;
  now?: Date;
}): SmartAvailabilityDecision {
  return evaluateSmartAvailability({
    requested: input.requested,
    occupied: input.occupied,
    rules: input.rules,
    exceptions: input.exceptions,
    legacyPeriods: input.legacyPeriods,
    config: input.config,
    searchAlternatives: false,
    now: input.now,
  });
}

export type CustomerBookingAvailabilityInput = {
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  tripDate?: string | null;
  tripTime?: string | null;
  returnJourney?: boolean | null;
  returnDate?: string | null;
  returnTime?: string | null;
  vehicle?: string | null;
  airportCode?: string | null;
  isFromAirport?: boolean | null;
  journeyDuration?: string | null;
  routeDurationMinutes?: number | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  isRefundTest?: boolean | null;
};

function coords(
  lat?: number | null,
  lng?: number | null,
): { lat: number; lng: number } | undefined {
  if (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng };
  }
  return undefined;
}

export function requestedJourneysFromCustomerBooking(
  booking: CustomerBookingAvailabilityInput,
): SmartRequestedJourney[] {
  const duration =
    (booking.routeDurationMinutes && booking.routeDurationMinutes > 0
      ? Math.round(booking.routeDurationMinutes)
      : 0) || parseJourneyDurationMinutes(booking.journeyDuration || "");
  const outbound: SmartRequestedJourney = {
    pickupLabel: String(booking.pickupLabel || ""),
    dropoffLabel: String(booking.dropoffLabel || ""),
    tripDate: String(booking.tripDate || ""),
    tripTime: String(booking.tripTime || ""),
    vehicle: booking.vehicle || undefined,
    airportCode: booking.airportCode || null,
    isFromAirport: booking.isFromAirport === true,
    durationMinutes: duration || undefined,
    pickup: coords(booking.pickupLat, booking.pickupLng),
    dropoff: coords(booking.dropoffLat, booking.dropoffLng),
  };
  const journeys = [outbound];
  if (
    booking.returnJourney &&
    String(booking.returnDate || "").trim() &&
    String(booking.returnTime || "").trim()
  ) {
    journeys.push({
      ...outbound,
      pickupLabel: outbound.dropoffLabel,
      dropoffLabel: outbound.pickupLabel,
      tripDate: String(booking.returnDate),
      tripTime: String(booking.returnTime),
      pickup: outbound.dropoff,
      dropoff: outbound.pickup,
      isFromAirport: Boolean(booking.airportCode && !booking.isFromAirport),
    });
  }
  return journeys.filter((item) => item.pickupLabel && item.dropoffLabel && item.tripDate && item.tripTime);
}

export type CustomerSmartAvailabilityGate = {
  enforce: boolean;
  available: boolean;
  blocked: boolean;
  customerMessage: string | null;
  reason: string | null;
  decision: SmartAvailabilityDecision | null;
};

/** Customer-visible payload only — never includes owner reason codes or diagnostics. */
export type PublicCustomerSmartAvailability = {
  enforced: boolean;
  available: boolean;
  blocked: boolean;
  customerMessage: string | null;
};

export function toPublicCustomerSmartAvailability(
  gate: CustomerSmartAvailabilityGate,
): PublicCustomerSmartAvailability {
  return {
    enforced: gate.enforce,
    available: gate.available,
    blocked: gate.blocked,
    customerMessage: gate.blocked ? CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE : gate.customerMessage,
  };
}

export function decideCustomerSmartAvailabilityGate(input: {
  enforce: boolean;
  booking: CustomerBookingAvailabilityInput;
  occupied: SmartOccupiedJob[];
  rules?: SmartAvailabilityRule[];
  exceptions?: SmartAvailabilityException[];
  legacyPeriods?: UnavailablePeriod[];
  config: SmartOpsConfig;
  now?: Date;
}): CustomerSmartAvailabilityGate {
  if (!input.enforce) {
    return {
      enforce: false,
      available: true,
      blocked: false,
      customerMessage: null,
      reason: null,
      decision: null,
    };
  }
  if (input.booking.isRefundTest) {
    return {
      enforce: true,
      available: true,
      blocked: false,
      customerMessage: null,
      reason: null,
      decision: null,
    };
  }
  const journeys = requestedJourneysFromCustomerBooking(input.booking);
  if (!journeys.length) {
    return {
      enforce: true,
      available: true,
      blocked: false,
      customerMessage: null,
      reason: null,
      decision: null,
    };
  }
  let last: SmartAvailabilityDecision | null = null;
  for (const requested of journeys) {
    const decision = evaluateCustomerSmartAvailability({
      requested,
      occupied: input.occupied,
      rules: input.rules,
      exceptions: input.exceptions,
      legacyPeriods: input.legacyPeriods,
      config: input.config,
      now: input.now,
    });
    last = decision;
    if (!decision.available) {
      return {
        enforce: true,
        available: false,
        blocked: true,
        customerMessage: CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE,
        reason: decision.reason,
        decision,
      };
    }
  }
  return {
    enforce: true,
    available: true,
    blocked: false,
    customerMessage: null,
    reason: last?.reason || null,
    decision: last,
  };
}
