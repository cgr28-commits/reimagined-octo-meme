/**
 * Customer-facing Smart Availability gate.
 * Uses the same evaluateSmartAvailability engine as the Owner Availability tool.
 * Does not change pricing. Alternative times, when offered, come from that engine.
 */

import type { SmartOpsConfig } from "./smart-ops-config";
import {
  evaluateSmartAvailability,
  parseJourneyDurationMinutes,
  type SmartAlternativeTime,
  type SmartAvailabilityDecision,
  type SmartOccupiedJob,
  type SmartRequestedJourney,
} from "./smart-conflict";
import type { SmartAvailabilityException, SmartAvailabilityRule } from "./smart-availability";
import type { UnavailablePeriod } from "./booking-notice";

export const CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE =
  "Unfortunately, we’re not available at that time.";

export const CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE_LEGACY =
  "Unfortunately, we’re not available at that time. Please choose another time or contact us on WhatsApp.";

export const CUSTOMER_SMART_AVAILABILITY_CODE = "smart_availability_unavailable";

export const CUSTOMER_OTHER_TIMES_HEADING = "Other times we can offer:";

export const CUSTOMER_CHOOSE_ANOTHER_TIME_LABEL = "Choose another time";

export const CUSTOMER_CHOOSE_ANOTHER_DATE_LABEL = "Choose another date";

export const CUSTOMER_SMART_AVAILABILITY_NO_TIMES_LEFT_MESSAGE =
  "Unfortunately, we’re fully booked/unavailable for the rest of this day.";

export const CUSTOMER_WHATSAPP_SECONDARY_MESSAGE =
  "Still need help? Send us a WhatsApp message and we’ll reply when available.";

export const CUSTOMER_SMART_AVAILABILITY_PREVIEW_QUERY = "smartAvailabilityPreview";
export const CUSTOMER_SMART_AVAILABILITY_PREVIEW_HEADER = "X-Smart-Availability-Preview";

/**
 * Same default the Owner Availability tool sends (`OwnerSmartAvailabilityPanel`
 * duration field). Customer live OSRM times can be shorter (25 vs 30) and would
 * otherwise disagree with the proven Owner result without changing the engine.
 */
export const OWNER_AVAILABILITY_DEFAULT_DURATION_MINUTES = 30;

export function isPagesPreviewOrigin(originOrHost?: string | null): boolean {
  return /pages\.dev/i.test(String(originOrHost || ""));
}

export function isProductionCustomerOrigin(originOrHost?: string | null): boolean {
  return /(?:^|[/.])myairporttaxini\.co\.uk(?:[:/?#]|$)/i.test(String(originOrHost || ""));
}

/**
 * Production customers are gated only when the KV flag is on.
 * Isolated preview Worker / Pages preview may opt in without enabling
 * the production flag. Missing Origin must not fail-open on preview.
 */
export function shouldEnforceCustomerSmartAvailability(input: {
  smartAvailabilityFlag: boolean;
  origin?: string | null;
  previewRequested?: boolean;
  previewWorkerEnforce?: boolean;
}): boolean {
  if (input.smartAvailabilityFlag === true) return true;
  if (input.previewWorkerEnforce === true) return true;
  if (!input.previewRequested) return false;
  if (isProductionCustomerOrigin(input.origin)) return false;
  // Missing Origin on the production Worker must stay fail-open. The isolated
  // preview Worker enforces via previewWorkerEnforce instead.
  if (!String(input.origin || "").trim()) return false;
  return isPagesPreviewOrigin(input.origin);
}

/**
 * Alternative suggestions stay behind the KV flag in production.
 * The isolated preview Worker may offer them without enabling the production flag.
 */
export function shouldOfferCustomerAlternativeTimes(input: {
  alternativeTimeSuggestionsFlag: boolean;
  origin?: string | null;
  previewRequested?: boolean;
  previewWorkerEnforce?: boolean;
}): boolean {
  if (input.alternativeTimeSuggestionsFlag === true) return true;
  if (input.previewWorkerEnforce === true) return true;
  if (!input.previewRequested) return false;
  if (isProductionCustomerOrigin(input.origin)) return false;
  if (!String(input.origin || "").trim()) return false;
  return isPagesPreviewOrigin(input.origin);
}

export function formatCustomerClock(tripTime: string): string {
  const match = String(tripTime || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

export function customerUnavailableAtTimeMessage(tripTime: string): string {
  const clock = formatCustomerClock(tripTime);
  return clock
    ? `Unfortunately, we’re not available at ${clock}.`
    : CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE;
}

export function isCustomerSmartAvailabilityUnavailableMessage(message?: string | null): boolean {
  const text = String(message || "").trim();
  if (!text) return false;
  if (
    text === CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE ||
    text === CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE_LEGACY ||
    text === CUSTOMER_SMART_AVAILABILITY_NO_TIMES_LEFT_MESSAGE
  ) {
    return true;
  }
  return /^Unfortunately, we’re not available at \d{1,2}:\d{2}\.$/.test(text);
}

function firstPositiveMinutes(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.round(value);
    }
  }
  return null;
}

/**
 * Customer wiring only. Does not change evaluateSmartAvailability.
 * Floor short live durations to the Owner Availability default so 05:32 / 05:33
 * match the proven Owner tool. Longer live durations stay longer.
 */
export function resolveCustomerAvailabilityDurationMinutes(
  booking: CustomerBookingAvailabilityInput,
): number {
  const parsedJourney = parseJourneyDurationMinutes(booking.journeyDuration || "");
  const live = firstPositiveMinutes(
    booking.routeDurationMinutes,
    parsedJourney > 0 ? parsedJourney : null,
  );
  if (live != null) {
    return Math.max(live, OWNER_AVAILABILITY_DEFAULT_DURATION_MINUTES);
  }
  return OWNER_AVAILABILITY_DEFAULT_DURATION_MINUTES;
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

/** Same engine as the owner tool. Alternatives only when explicitly requested. */
export function evaluateCustomerSmartAvailability(input: {
  requested: SmartRequestedJourney;
  occupied: SmartOccupiedJob[];
  rules?: SmartAvailabilityRule[];
  exceptions?: SmartAvailabilityException[];
  legacyPeriods?: UnavailablePeriod[];
  config: SmartOpsConfig;
  searchAlternatives?: boolean;
  now?: Date;
}): SmartAvailabilityDecision {
  return evaluateSmartAvailability({
    requested: input.requested,
    occupied: input.occupied,
    rules: input.rules,
    exceptions: input.exceptions,
    legacyPeriods: input.legacyPeriods,
    config: input.config,
    searchAlternatives: input.searchAlternatives === true,
    now: input.now,
  });
}

export type CustomerPublicAlternativeTime = {
  tripDate: string;
  tripTime: string;
};

export function parsePublicCustomerAlternativeTimes(
  value: unknown,
): CustomerPublicAlternativeTime[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: CustomerPublicAlternativeTime[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const tripDate = String((item as { tripDate?: unknown }).tripDate || "").trim();
    const tripTime = formatCustomerClock(String((item as { tripTime?: unknown }).tripTime || ""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate) || !tripTime) continue;
    const key = `${tripDate}T${tripTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ tripDate, tripTime });
  }
  return out.slice(0, 4);
}

export function confirmedCustomerAlternativeTimes(input: {
  requested: SmartRequestedJourney;
  occupied: SmartOccupiedJob[];
  rules?: SmartAvailabilityRule[];
  exceptions?: SmartAvailabilityException[];
  legacyPeriods?: UnavailablePeriod[];
  config: SmartOpsConfig;
  candidates: SmartAlternativeTime[];
  now?: Date;
}): CustomerPublicAlternativeTime[] {
  const requestedKey = `${input.requested.tripDate}T${formatCustomerClock(input.requested.tripTime)}`;
  const confirmed: CustomerPublicAlternativeTime[] = [];
  const seen = new Set<string>();
  for (const candidate of input.candidates) {
    const tripDate = String(candidate.tripDate || "").trim();
    const tripTime = formatCustomerClock(candidate.tripTime);
    const key = `${tripDate}T${tripTime}`;
    if (
      !tripDate ||
      !tripTime ||
      tripDate !== input.requested.tripDate ||
      key === requestedKey ||
      seen.has(key)
    ) {
      continue;
    }
    const decision = evaluateCustomerSmartAvailability({
      requested: { ...input.requested, tripDate, tripTime },
      occupied: input.occupied,
      rules: input.rules,
      exceptions: input.exceptions,
      legacyPeriods: input.legacyPeriods,
      config: input.config,
      searchAlternatives: false,
      now: input.now,
    });
    if (!decision.available) continue;
    seen.add(key);
    confirmed.push({ tripDate, tripTime });
  }
  return confirmed.slice(0, 4);
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
  const duration = resolveCustomerAvailabilityDurationMinutes(booking);
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
  alternativeTimes: CustomerPublicAlternativeTime[];
};

/** Customer-visible payload only — never includes owner reason codes or diagnostics. */
export type PublicCustomerSmartAvailability = {
  enforced: boolean;
  available: boolean;
  blocked: boolean;
  customerMessage: string | null;
  alternativeTimes: CustomerPublicAlternativeTime[];
};

function emptyGate(partial: Omit<CustomerSmartAvailabilityGate, "alternativeTimes">): CustomerSmartAvailabilityGate {
  return { ...partial, alternativeTimes: [] };
}

export function toPublicCustomerSmartAvailability(
  gate: CustomerSmartAvailabilityGate,
): PublicCustomerSmartAvailability {
  const alternativeTimes = gate.blocked ? parsePublicCustomerAlternativeTimes(gate.alternativeTimes) : [];
  return {
    enforced: gate.enforce,
    available: gate.available,
    blocked: gate.blocked,
    customerMessage: gate.blocked
      ? gate.customerMessage || CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE
      : null,
    alternativeTimes,
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
  offerAlternatives?: boolean;
  now?: Date;
}): CustomerSmartAvailabilityGate {
  if (!input.enforce) {
    return emptyGate({
      enforce: false,
      available: true,
      blocked: false,
      customerMessage: null,
      reason: null,
      decision: null,
    });
  }
  if (input.booking.isRefundTest) {
    return emptyGate({
      enforce: true,
      available: true,
      blocked: false,
      customerMessage: null,
      reason: null,
      decision: null,
    });
  }
  const journeys = requestedJourneysFromCustomerBooking(input.booking);
  if (!journeys.length) {
    return emptyGate({
      enforce: true,
      available: true,
      blocked: false,
      customerMessage: null,
      reason: null,
      decision: null,
    });
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
      searchAlternatives: false,
      now: input.now,
    });
    last = decision;
    if (!decision.available) {
      let alternativeTimes: CustomerPublicAlternativeTime[] = [];
      let suggestion = decision;
      if (input.offerAlternatives === true) {
        suggestion = evaluateCustomerSmartAvailability({
          requested,
          occupied: input.occupied,
          rules: input.rules,
          exceptions: input.exceptions,
          legacyPeriods: input.legacyPeriods,
          config: input.config,
          searchAlternatives: true,
          now: input.now,
        });
        alternativeTimes = confirmedCustomerAlternativeTimes({
          requested,
          occupied: input.occupied,
          rules: input.rules,
          exceptions: input.exceptions,
          legacyPeriods: input.legacyPeriods,
          config: input.config,
          candidates: suggestion.alternatives,
          now: input.now,
        });
      }
      const searchedAlternatives = input.offerAlternatives === true;
      return {
        enforce: true,
        available: false,
        blocked: true,
        customerMessage: alternativeTimes.length
          ? customerUnavailableAtTimeMessage(requested.tripTime)
          : searchedAlternatives
            ? CUSTOMER_SMART_AVAILABILITY_NO_TIMES_LEFT_MESSAGE
            : CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE,
        reason: suggestion.reason,
        decision: suggestion,
        alternativeTimes,
      };
    }
  }
  return emptyGate({
    enforce: true,
    available: true,
    blocked: false,
    customerMessage: null,
    reason: last?.reason || null,
    decision: last,
  });
}
