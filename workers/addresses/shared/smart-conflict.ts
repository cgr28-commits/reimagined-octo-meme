/**
 * Smart booking conflict + positioning engine.
 * Geography and journey duration matter — this is not a simple calendar overlap.
 */

import { parseLondonLocalDateTime } from "./uk-time";
import { matchServedAirportCode, getServedAirport, SERVED_AIRPORTS } from "./served-airports";
import {
  SMART_OPS_REASON,
  type SmartOpsConfig,
  type SmartOpsReasonCode,
} from "./smart-ops-config";
import {
  expandSmartAvailabilityIntervals,
  findBlockingSmartInterval,
  findOverlappingSmartInterval,
  type SmartAvailabilityException,
  type SmartAvailabilityRule,
  type SmartBlockedInterval,
} from "./smart-availability";
import type { UnavailablePeriod } from "./booking-notice";
import { addDaysYmd, londonYmd } from "./upcoming-jobs";

export type SmartCoords = { lat: number; lng: number };

export type SmartOccupiedJob = {
  id: string;
  pickupLabel: string;
  dropoffLabel: string;
  pickup?: SmartCoords | null;
  dropoff?: SmartCoords | null;
  tripDate: string;
  tripTime: string;
  durationMinutes: number;
  airportCode?: string | null;
  isFromAirport?: boolean | null;
  cancelled?: boolean;
  status?: string;
  operationalStatus?: string;
  paymentStatus?: string;
  routeDurationMinutes?: number;
  routeDistanceKm?: number;
  knownTravelMinutes?: number;
  leg?: "outbound" | "return";
};

export type SmartRequestedJourney = {
  pickupLabel: string;
  dropoffLabel: string;
  pickup?: SmartCoords | null;
  dropoff?: SmartCoords | null;
  tripDate: string;
  tripTime: string;
  durationMinutes?: number;
  airportCode?: string | null;
  isFromAirport?: boolean | null;
  vehicle?: string | null;
  routeDurationMinutes?: number;
  knownTravelMinutes?: number;
};

export type SmartConflictWarning = {
  bookingId: string;
  reason: SmartOpsReasonCode;
  summary: string;
};

export type SmartAlternativeTime = {
  tripDate: string;
  tripTime: string;
  deltaMinutes: number;
};

export type SmartAvailabilityDiagnostics = {
  requestedPickupLocal: string;
  estimatedJourneyDurationMinutes: number;
  estimatedCompletionLocal: string | null;
  operationalBufferMinutes: number;
  operationalStartLocal: string | null;
  operationalEndLocal: string | null;
  /** Pickup → journey end + post-buffer. Used only for owner personal-block overlap. */
  personalBlockWindowStartLocal: string | null;
  personalBlockWindowEndLocal: string | null;
  minTurnaroundMinutes: number;
  expectedFinishingLocation: string;
  previousBookingId: string | null;
  previousBookingTripDate: string | null;
  previousBookingTripTime: string | null;
  previousBookingPickupLocal: string | null;
  previousBookingDurationMinutes: number | null;
  previousBookingCompletionLocal: string | null;
  previousBookingDestination: string | null;
  previousBookingOperationalEndLocal: string | null;
  previousPositioningNeededMinutes: number | null;
  earliestReadyAfterPreviousLocal: string | null;
  proposedOnSiteDeadlineLocal: string | null;
  conflictBookingId: string | null;
  conflictKind: "overlap" | "previous_positioning" | "next_positioning" | "turnaround" | "block" | null;
  conflictSummary: string | null;
  nextBookingId: string | null;
  /** Travel from previous dropoff → this pickup. */
  previousPositioningMinutes: number | null;
  /** Travel from this dropoff → next pickup. */
  nextPositioningMinutes: number | null;
  /** The hop that matters for this request: next if present, otherwise previous. */
  positioningMinutes: number | null;
  positioningFromLabel: string | null;
  positioningToLabel: string | null;
  positioningFromCoords: SmartCoords | null;
  positioningToCoords: SmartCoords | null;
  positioningCoordsKnown: boolean;
  /** Drive only. positioningNeededMinutes = this + minTurnaround when drive > 0. */
  positioningTravelMinutes: number | null;
  positioningNeededMinutes: number | null;
  /** Minutes from estimated drop-off to the next on-site deadline. */
  positioningGapMinutes: number | null;
  /** Estimated drop-off plus positioningNeededMinutes. */
  earliestReadyLocal: string | null;
  nextPickupLocal: string | null;
  nextBookingTripDate: string | null;
  nextBookingTripTime: string | null;
  nextBookingResolvedLocal: string | null;
  proposedPickupResolvedLocal: string | null;
  proposedCompletionResolvedLocal: string | null;
  comparisonFromLocal: string | null;
  comparisonToLocal: string | null;
  sameCalendarDayAsNext: boolean | null;
  blockedTimeOverlap: boolean;
  blockingInterval: {
    startLocal: string;
    endLocal: string;
    recurring: boolean;
    source: SmartBlockedInterval["source"];
  } | null;
};

export type SmartAvailabilityDecision = {
  available: boolean;
  reason: SmartOpsReasonCode;
  alternativeReason: SmartOpsReasonCode | null;
  alternatives: SmartAlternativeTime[];
  warnings: SmartConflictWarning[];
  nextAvailableFromLocal: string | null;
  expectedFinishLocal: string | null;
  expectedFinishLabel: string;
  durationMinutes: number;
  bufferMinutes: number;
  ownerOverrideApplied: boolean;
  diagnostics: SmartAvailabilityDiagnostics;
};

const LONG_DISTANCE_MILES = 50;
const REPOSITION_SPEED_MPH = 40;
const REPOSITION_OVERHEAD_MINUTES = 8;
const UNKNOWN_LOCATION_REPOSITION_MINUTES = 45;

/** Town / city centres used only for owner positioning — not customer fare quotes. */
export const POSITIONING_PLACE_COORDS: Record<string, SmartCoords> = {
  belfast_centre: { lat: 54.5964, lng: -5.9302 },
  larne: { lat: 54.851, lng: -5.811 },
  bangor: { lat: 54.653, lng: -5.669 },
  lisburn: { lat: 54.516, lng: -6.058 },
  newry: { lat: 54.175, lng: -6.337 },
};

/**
 * Resolve a non-airport place for positioning. Must not treat “Belfast City Centre”
 * as Belfast City Airport.
 */
export function coordsFromPlaceLabel(label?: string | null): SmartCoords | null {
  const value = String(label || "").trim();
  if (!value) return null;
  if (coordsFromAirportHint(value)) return coordsFromAirportHint(value);
  const hay = value.toLowerCase();
  if (/larne/.test(hay)) return POSITIONING_PLACE_COORDS.larne;
  if (/bangor/.test(hay)) return POSITIONING_PLACE_COORDS.bangor;
  if (/lisburn/.test(hay)) return POSITIONING_PLACE_COORDS.lisburn;
  if (/newry/.test(hay)) return POSITIONING_PLACE_COORDS.newry;
  if (
    /city\s*centre|city\s*center|city\s*hall|donegall\s*place|donegall\s*square/.test(hay) &&
    !/airport|george\s+best|\bbhd\b/.test(hay)
  ) {
    return POSITIONING_PLACE_COORDS.belfast_centre;
  }
  if (
    /\bbelfast\b/.test(hay) &&
    !/airport|international|aldergrove|george\s+best|city\s+airport|\bbfs\b|\bbhd\b/.test(hay)
  ) {
    return POSITIONING_PLACE_COORDS.belfast_centre;
  }
  return null;
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineMiles(a: SmartCoords, b: SmartCoords): number {
  const r = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function roadMilesEstimate(a: SmartCoords, b: SmartCoords): number {
  return haversineMiles(a, b) * 1.48;
}

export function coordsFromAirportHint(label?: string | null, code?: string | null): SmartCoords | null {
  const fromLabel = matchServedAirportCode(label || "");
  if (fromLabel) {
    const airport = getServedAirport(fromLabel);
    return airport ? { lat: airport.lat, lng: airport.lng } : null;
  }
  // A journey airport code must not move a house address (e.g. Larne → BHD)
  // onto the airport coordinates. Only use the code when there is no label.
  if (String(label || "").trim()) return null;
  const fromCode = (code || "").trim().toUpperCase();
  if (!fromCode) return null;
  const airport = getServedAirport(fromCode);
  return airport ? { lat: airport.lat, lng: airport.lng } : null;
}

export function pointLooksLikeServedAirport(point: SmartCoords, maxMiles = 1.2): boolean {
  return SERVED_AIRPORTS.some((airport) => haversineMiles(point, { lat: airport.lat, lng: airport.lng }) <= maxMiles);
}

/**
 * Resolve one end of a journey for positioning.
 * House-address labels win over a journey airport code and over stored
 * coordinates that sit on an airport the label does not name.
 */
export function resolveSmartOpsPoint(
  explicit: SmartCoords | null | undefined,
  label?: string | null,
  airportCode?: string | null,
): SmartCoords | null {
  const labelAirport = coordsFromAirportHint(label, null);
  if (labelAirport) return labelAirport;
  const place = coordsFromPlaceLabel(label);
  if (explicit && Number.isFinite(explicit.lat) && Number.isFinite(explicit.lng)) {
    if (place && pointLooksLikeServedAirport(explicit) && !matchServedAirportCode(label || "")) {
      return place;
    }
    return { lat: explicit.lat, lng: explicit.lng };
  }
  if (place) return place;
  if (!String(label || "").trim()) return coordsFromAirportHint(null, airportCode);
  return null;
}

export function parseJourneyDurationMinutes(value?: string | null): number {
  if (!value) return 0;
  const hours = String(value).match(/(\d+)\s*h/);
  const mins = String(value).match(/(\d+)\s*m/);
  const hourN = hours ? Number(hours[1]) : 0;
  const minN = mins ? Number(mins[1]) : 0;
  if (hourN || minN) return hourN * 60 + minN;
  const plain = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(plain) && plain > 0 && plain < 400 ? Math.round(plain) : 0;
}

export function isLongDistanceJourney(input: {
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  airportCode?: string | null;
  pickup?: SmartCoords | null;
  dropoff?: SmartCoords | null;
  durationMinutes?: number;
}): boolean {
  const hay = `${input.pickupLabel || ""} ${input.dropoffLabel || ""}`.toLowerCase();
  if (
    /\bdublin\b|\bdub\b|\blondonderry\b|\bderry\b|\bldy\b|\benniskillen\b|\bnewcastle\b/.test(
      hay,
    )
  ) {
    return true;
  }
  const code = (input.airportCode || "").toUpperCase();
  if (code === "DUB" || code === "LDY") return true;
  if (input.pickup && input.dropoff && roadMilesEstimate(input.pickup, input.dropoff) >= LONG_DISTANCE_MILES) {
    return true;
  }
  return (input.durationMinutes || 0) >= 90;
}

export function estimateDurationMinutes(input: {
  pickup?: SmartCoords | null;
  dropoff?: SmartCoords | null;
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  airportCode?: string | null;
  durationMinutes?: number;
  routeDurationMinutes?: number;
  knownTravelMinutes?: number;
}): number {
  if (input.knownTravelMinutes && input.knownTravelMinutes > 0) {
    return Math.round(input.knownTravelMinutes);
  }
  if (input.routeDurationMinutes && input.routeDurationMinutes > 0) {
    return Math.round(input.routeDurationMinutes);
  }
  if (input.durationMinutes && input.durationMinutes > 0) {
    return Math.round(input.durationMinutes);
  }
  const pickup = input.pickup || resolveSmartOpsPoint(null, input.pickupLabel, input.airportCode);
  const dropoff = input.dropoff || resolveSmartOpsPoint(null, input.dropoffLabel, input.airportCode);
  if (pickup && dropoff) {
    const miles = roadMilesEstimate(pickup, dropoff);
    return Math.max(20, Math.round((miles / REPOSITION_SPEED_MPH) * 60) + 5);
  }
  if (isLongDistanceJourney(input)) return 120;
  return 40;
}

export function isAirportPickupJourney(journey: {
  pickupLabel?: string | null;
  airportCode?: string | null;
  isFromAirport?: boolean | null;
}): boolean {
  return (
    journey.isFromAirport === true ||
    Boolean(matchServedAirportCode(journey.pickupLabel || ""))
  );
}

/** Post-journey operational padding (not applied after personal blocks). */
export function postJourneyBufferMinutes(
  journey: {
    pickupLabel?: string | null;
    dropoffLabel?: string | null;
    airportCode?: string | null;
    pickup?: SmartCoords | null;
    dropoff?: SmartCoords | null;
    durationMinutes?: number;
  },
  config: SmartOpsConfig,
): number {
  if (isLongDistanceJourney(journey)) return config.buffers.longDistanceBufferMinutes;
  return config.buffers.shortJourneyBufferMinutes;
}

export function operationalBufferMinutes(
  journey: {
    pickupLabel?: string | null;
    dropoffLabel?: string | null;
    airportCode?: string | null;
    isFromAirport?: boolean | null;
    pickup?: SmartCoords | null;
    dropoff?: SmartCoords | null;
    durationMinutes?: number;
  },
  config: SmartOpsConfig,
): number {
  if (isAirportPickupJourney(journey)) return config.buffers.airportPickupBufferMinutes;
  return postJourneyBufferMinutes(journey, config);
}

function normalizeLabel(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function labelsLikelySamePlace(a?: string | null, b?: string | null): boolean {
  const left = normalizeLabel(a);
  const right = normalizeLabel(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (!longer.includes(shorter)) return false;
  // “Belfast” must not match “George Best Belfast City Airport” or Larne addresses.
  const words = shorter.split(" ").filter(Boolean);
  return shorter.length >= 12 || words.length >= 3;
}

/**
 * Positioning time between two points.
 * Priority: known route duration → stored/estimated road duration → conservative fallback.
 * Missing coordinates are never treated as proof that two journeys are compatible.
 */
export function repositionMinutes(
  from: SmartCoords | null | undefined,
  to: SmartCoords | null | undefined,
  options?: {
    knownTravelMinutes?: number | null;
    fromLabel?: string | null;
    toLabel?: string | null;
  },
): number {
  if (options?.knownTravelMinutes && options.knownTravelMinutes > 0) {
    return Math.round(options.knownTravelMinutes);
  }
  if (from && to) {
    const miles = roadMilesEstimate(from, to);
    if (miles < 0.15) return 0;
    // Conservative road time, not fastest satnav. NI A-roads are slower than
    // a 40 mph great-circle conversion with no junction/urban slack.
    return Math.round((miles / REPOSITION_SPEED_MPH) * 60) + REPOSITION_OVERHEAD_MINUTES;
  }
  if (labelsLikelySamePlace(options?.fromLabel, options?.toLabel)) return 0;
  return UNKNOWN_LOCATION_REPOSITION_MINUTES;
}

/**
 * Time that must sit between one job becoming free and the next pickup.
 * Road travel and the minimum turnaround are stacked — a 30-minute drive plus
 * a 10-minute turnaround needs 40 minutes, not 30.
 */
export function positioningTimeNeededMinutes(
  travelMinutes: number,
  minTurnaroundMinutes: number,
): number {
  const travel = Math.max(0, Math.round(travelMinutes));
  const turnaround = Math.max(0, Math.round(minTurnaroundMinutes));
  if (travel <= 0) return turnaround;
  return travel + turnaround;
}

/** UK local calendar date from owner/KV values that may be ISO instants or DD/MM/YYYY. */
export function normalizeSmartTripDate(value?: string | null): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    if (/Z$/i.test(raw) || /[+-]\d{2}:\d{2}$/.test(raw)) {
      const instant = new Date(raw);
      if (!Number.isNaN(instant.getTime())) return londonYmd(instant);
    }
    return raw.slice(0, 10);
  }
  const dmy = raw.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
  }
  return null;
}

export function normalizeSmartTripTime(value?: string | null): string | null {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
}

function pickupMs(date: string, time: string): number | null {
  const ymd = normalizeSmartTripDate(date);
  const hm = normalizeSmartTripTime(time);
  if (!ymd || !hm) return null;
  const instant = parseLondonLocalDateTime(ymd, hm);
  return instant ? instant.getTime() : null;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function addMinutesToTrip(
  tripDate: string,
  tripTime: string,
  minutes: number,
): { tripDate: string; tripTime: string } | null {
  const start = parseLondonLocalDateTime(tripDate, tripTime);
  if (!start) return null;
  const next = new Date(start.getTime() + minutes * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(next);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    tripDate: `${get("year")}-${get("month")}-${get("day")}`,
    tripTime: `${get("hour")}:${get("minute")}`,
  };
}

export function formatTripLocal(tripDate: string, tripTime: string): string {
  return `${tripDate}T${tripTime}`;
}

function localFromMs(ms: number | null): string | null {
  if (ms == null) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function resolvePoint(
  explicit: SmartCoords | null | undefined,
  label?: string | null,
  airportCode?: string | null,
): SmartCoords | null {
  return resolveSmartOpsPoint(explicit, label, airportCode);
}

type JobWindow = {
  pickupMs: number | null;
  start: number | null;
  end: number | null;
  /** Passenger drop-off — positioning clock starts here, not after the post-buffer. */
  journeyEnd: number | null;
  duration: number;
  preBuffer: number;
  postBuffer: number;
  pickup: SmartCoords | null;
  dropoff: SmartCoords | null;
  finishLabel: string;
  pickupLabel: string;
};

function jobWindow(job: SmartOccupiedJob, config: SmartOpsConfig): JobWindow {
  const startPickup = pickupMs(job.tripDate, job.tripTime);
  const duration = estimateDurationMinutes(job);
  const postBuffer = postJourneyBufferMinutes({ ...job, durationMinutes: duration }, config);
  const preBuffer = isAirportPickupJourney(job) ? config.buffers.airportPickupBufferMinutes : 0;
  const pickup = resolvePoint(job.pickup, job.pickupLabel, job.airportCode);
  const dropoff = resolvePoint(job.dropoff, job.dropoffLabel, job.airportCode);
  return {
    pickupMs: startPickup,
    start: startPickup == null ? null : startPickup - preBuffer * 60 * 1000,
    end: startPickup == null ? null : startPickup + (duration + postBuffer) * 60 * 1000,
    journeyEnd: startPickup == null ? null : startPickup + duration * 60 * 1000,
    duration,
    preBuffer,
    postBuffer,
    pickup,
    dropoff,
    finishLabel: job.dropoffLabel,
    pickupLabel: job.pickupLabel,
  };
}

function requestedWindow(requested: SmartRequestedJourney, config: SmartOpsConfig) {
  const duration = estimateDurationMinutes(requested);
  const postBuffer = postJourneyBufferMinutes({ ...requested, durationMinutes: duration }, config);
  const preBuffer = isAirportPickupJourney(requested)
    ? config.buffers.airportPickupBufferMinutes
    : 0;
  const pickupAt = pickupMs(requested.tripDate, requested.tripTime);
  const pickup = resolvePoint(requested.pickup, requested.pickupLabel, requested.airportCode);
  const dropoff = resolvePoint(requested.dropoff, requested.dropoffLabel, requested.airportCode);
  const journeyEnd = pickupAt == null ? null : pickupAt + duration * 60 * 1000;
  const blockOverlapEnd =
    pickupAt == null ? null : pickupAt + (duration + postBuffer) * 60 * 1000;
  return {
    duration,
    postBuffer,
    preBuffer,
    pickupAt,
    pickup,
    dropoff,
    /**
     * Booking-vs-booking window may start earlier than pickup so an airport
     * collection still has its safety/positioning time.
     */
    operationalStart: pickupAt == null ? null : pickupAt - preBuffer * 60 * 1000,
    operationalEnd: blockOverlapEnd,
    /**
     * Owner personal blocks use the stated pickup, not the airport pre-buffer.
     * A block ending at 15:00 must not reject a 15:00 airport pickup.
     */
    blockOverlapStart: pickupAt,
    blockOverlapEnd,
    journeyEnd,
  };
}

function isCancelledJob(job: SmartOccupiedJob): boolean {
  if (job.cancelled) return true;
  if (job.operationalStatus === "cancelled") return true;
  const status = String(job.status || "").toLowerCase();
  return status === "cancelled";
}

function conflictReasonForJob(
  occupied: SmartOccupiedJob,
  laterBooking: boolean,
  kind: "overlap" | "positioning" | "turnaround",
): SmartOpsReasonCode {
  if (kind === "turnaround") return SMART_OPS_REASON.CONFLICT_MINIMUM_TURNAROUND;
  if (isLongDistanceJourney(occupied)) return SMART_OPS_REASON.CONFLICT_LONG_DISTANCE;
  if (laterBooking && kind === "positioning") return SMART_OPS_REASON.CONFLICT_NEXT_BOOKING;
  if (kind === "positioning") return SMART_OPS_REASON.CONFLICT_POSITIONING_TIME;
  return laterBooking
    ? SMART_OPS_REASON.CONFLICT_NEXT_BOOKING
    : SMART_OPS_REASON.CONFLICT_EXISTING_BOOKING;
}

function positioningWarning(
  occupied: SmartOccupiedJob,
  laterBooking: boolean,
  travel: number,
  minTurnaround: number,
): SmartConflictWarning {
  return {
    bookingId: occupied.id,
    reason: conflictReasonForJob(
      occupied,
      laterBooking,
      travel > 0 ? "positioning" : "turnaround",
    ),
    summary:
      travel > 0
        ? laterBooking
          ? `Not enough time to reach booking ${occupied.id}`
          : `Not enough time after booking ${occupied.id} to reach this pickup`
        : laterBooking
          ? `Minimum ${minTurnaround}-minute turnaround needed before booking ${occupied.id}`
          : `Minimum ${minTurnaround}-minute turnaround needed after booking ${occupied.id}`,
  };
}

/**
 * True when drop-off + (travel + turnaround) is later than the next on-site time.
 * This is the availability rule — operational buffers must not hide it.
 */
export function positioningOverrunsDeadline(
  fromCompletionMs: number,
  neededMinutes: number,
  onSiteDeadlineMs: number,
): boolean {
  if (!Number.isFinite(fromCompletionMs) || !Number.isFinite(onSiteDeadlineMs)) return false;
  const needed = Math.max(0, Math.round(neededMinutes));
  return fromCompletionMs + needed * 60_000 > onSiteDeadlineMs + 10;
}

function conflictAgainstJob(
  requestedStart: number,
  requestedEnd: number,
  requestedPickupAt: number,
  requestedJourneyEnd: number,
  requestedPickup: SmartCoords | null,
  requestedDropoff: SmartCoords | null,
  requestedPickupLabel: string,
  requestedDropoffLabel: string,
  occupied: SmartOccupiedJob,
  config: SmartOpsConfig,
): SmartConflictWarning | null {
  const window = jobWindow(occupied, config);
  if (window.start == null || window.end == null || window.pickupMs == null) return null;
  const laterBooking = window.pickupMs >= requestedPickupAt;
  const minTurnaround = config.buffers.minTurnaroundMinutes;

  if (requestedStart < window.end && requestedEnd > window.start) {
    return {
      bookingId: occupied.id,
      reason: conflictReasonForJob(occupied, laterBooking, "overlap"),
      summary: `Overlaps operational window of booking ${occupied.id}`,
    };
  }

  if (laterBooking && window.start != null) {
    const travel = repositionMinutes(requestedDropoff, window.pickup, {
      fromLabel: requestedDropoffLabel,
      toLabel: window.pickupLabel,
    });
    const needed = positioningTimeNeededMinutes(travel, minTurnaround);
    if (positioningOverrunsDeadline(requestedJourneyEnd, needed, window.start)) {
      return positioningWarning(occupied, true, travel, minTurnaround);
    }
  }

  if (!laterBooking && window.journeyEnd != null) {
    const travel = repositionMinutes(window.dropoff, requestedPickup, {
      fromLabel: window.finishLabel,
      toLabel: requestedPickupLabel,
    });
    const needed = positioningTimeNeededMinutes(travel, minTurnaround);
    if (positioningOverrunsDeadline(window.journeyEnd, needed, requestedStart)) {
      return positioningWarning(occupied, false, travel, minTurnaround);
    }
  }

  return null;
}

export function nextAvailableFrom(job: SmartOccupiedJob, config: SmartOpsConfig): {
  local: string;
  finishLabel: string;
} | null {
  const start = pickupMs(job.tripDate, job.tripTime);
  if (start == null) return null;
  const duration = estimateDurationMinutes(job);
  const buffer = postJourneyBufferMinutes({ ...job, durationMinutes: duration }, config);
  const added = addMinutesToTrip(job.tripDate, job.tripTime, duration + buffer);
  if (!added) return null;
  return {
    local: `${added.tripDate}T${added.tripTime}`,
    finishLabel: job.dropoffLabel,
  };
}

function availabilityReason(
  interval: SmartBlockedInterval | null,
  pickupInside: boolean,
): SmartOpsReasonCode {
  if (!interval) return SMART_OPS_REASON.AVAILABLE_NO_CONFLICT;
  if (!pickupInside) return SMART_OPS_REASON.BLOCKED_JOURNEY_OVERLAPS_AVAILABILITY;
  if (interval.recurring) return SMART_OPS_REASON.BLOCKED_RECURRING_AVAILABILITY;
  return SMART_OPS_REASON.BLOCKED_OWNER_AVAILABILITY;
}

function emptyDiagnostics(
  requested: SmartRequestedJourney,
  duration: number,
  buffer: number,
  config: SmartOpsConfig,
): SmartAvailabilityDiagnostics {
  return {
    requestedPickupLocal: formatTripLocal(requested.tripDate, requested.tripTime),
    estimatedJourneyDurationMinutes: duration,
    estimatedCompletionLocal: null,
    operationalBufferMinutes: buffer,
    operationalStartLocal: null,
    operationalEndLocal: null,
    personalBlockWindowStartLocal: null,
    personalBlockWindowEndLocal: null,
    minTurnaroundMinutes: config.buffers.minTurnaroundMinutes,
    expectedFinishingLocation: requested.dropoffLabel,
    previousBookingId: null,
    previousBookingTripDate: null,
    previousBookingTripTime: null,
    previousBookingPickupLocal: null,
    previousBookingDurationMinutes: null,
    previousBookingCompletionLocal: null,
    previousBookingDestination: null,
    previousBookingOperationalEndLocal: null,
    previousPositioningNeededMinutes: null,
    earliestReadyAfterPreviousLocal: null,
    proposedOnSiteDeadlineLocal: null,
    conflictBookingId: null,
    conflictKind: null,
    conflictSummary: null,
    nextBookingId: null,
    previousPositioningMinutes: null,
    nextPositioningMinutes: null,
    positioningMinutes: null,
    positioningFromLabel: null,
    positioningToLabel: null,
    positioningFromCoords: null,
    positioningToCoords: null,
    positioningCoordsKnown: false,
    positioningTravelMinutes: null,
    positioningNeededMinutes: null,
    positioningGapMinutes: null,
    earliestReadyLocal: null,
    nextPickupLocal: null,
    nextBookingTripDate: null,
    nextBookingTripTime: null,
    nextBookingResolvedLocal: null,
    proposedPickupResolvedLocal: null,
    proposedCompletionResolvedLocal: null,
    comparisonFromLocal: null,
    comparisonToLocal: null,
    sameCalendarDayAsNext: null,
    blockedTimeOverlap: false,
    blockingInterval: null,
  };
}

export function evaluateSmartAvailability(input: {
  requested: SmartRequestedJourney;
  occupied: SmartOccupiedJob[];
  rules?: SmartAvailabilityRule[];
  exceptions?: SmartAvailabilityException[];
  legacyPeriods?: UnavailablePeriod[];
  config: SmartOpsConfig;
  ownerOverride?: boolean;
  searchAlternatives?: boolean;
  now?: Date;
}): SmartAvailabilityDecision {
  const window = requestedWindow(input.requested, input.config);
  const duration = window.duration;
  const buffer = window.postBuffer;
  const start = window.pickupAt;
  const finish = addMinutesToTrip(input.requested.tripDate, input.requested.tripTime, duration);
  const expectedFinishLocal = finish ? `${finish.tripDate}T${finish.tripTime}` : null;
  const diagnostics = emptyDiagnostics(input.requested, duration, buffer, input.config);
  diagnostics.estimatedCompletionLocal = expectedFinishLocal;
  diagnostics.operationalStartLocal = localFromMs(window.operationalStart);
  diagnostics.operationalEndLocal = localFromMs(window.operationalEnd);
  diagnostics.personalBlockWindowStartLocal = localFromMs(window.blockOverlapStart);
  diagnostics.personalBlockWindowEndLocal = localFromMs(window.blockOverlapEnd);

  const empty: SmartAvailabilityDecision = {
    available: false,
    reason: SMART_OPS_REASON.CONFLICT_EXISTING_BOOKING,
    alternativeReason: null,
    alternatives: [],
    warnings: [],
    nextAvailableFromLocal: expectedFinishLocal,
    expectedFinishLocal,
    expectedFinishLabel: input.requested.dropoffLabel,
    durationMinutes: duration,
    bufferMinutes: buffer,
    ownerOverrideApplied: false,
    diagnostics,
  };

  if (
    start == null ||
    window.operationalStart == null ||
    window.operationalEnd == null ||
    window.blockOverlapStart == null ||
    window.blockOverlapEnd == null
  ) {
    return empty;
  }

  const fromYmd = addDaysYmd(input.requested.tripDate, -1);
  const toYmd = addDaysYmd(input.requested.tripDate, 1);
  const intervals = expandSmartAvailabilityIntervals({
    rules: input.rules || [],
    exceptions: input.exceptions,
    fromYmd,
    toYmd,
    legacyPeriods: input.legacyPeriods,
  });
  const pickupBlocked = findBlockingSmartInterval(
    input.requested.tripDate,
    input.requested.tripTime,
    intervals,
  );
  const overlapping = findOverlappingSmartInterval(
    window.blockOverlapStart,
    window.blockOverlapEnd,
    intervals,
    input.config.buffers.postPersonalBlockTurnaroundMinutes,
  );
  const blocked = pickupBlocked || overlapping;
  diagnostics.blockedTimeOverlap = Boolean(overlapping);
  diagnostics.blockingInterval = blocked
    ? {
        startLocal: blocked.startLocal,
        endLocal: blocked.endLocal,
        recurring: blocked.recurring,
        source: blocked.source,
      }
    : null;

  const activeJobs = input.occupied.filter((job) => !isCancelledJob(job));
  const timedJobs = activeJobs
    .map((job) => ({ job, ms: pickupMs(job.tripDate, job.tripTime) }))
    .filter((item): item is { job: SmartOccupiedJob; ms: number } => item.ms != null)
    .sort((a, b) => a.ms - b.ms);
  const previous = [...timedJobs].reverse().find((item) => item.ms < start)?.job || null;
  const laterJobs = timedJobs.filter((item) => item.ms >= start).map((item) => item.job);
  const requestedDay = normalizeSmartTripDate(input.requested.tripDate);
  const next =
    laterJobs.find((job) => normalizeSmartTripDate(job.tripDate) === requestedDay) ||
    laterJobs[0] ||
    null;
  diagnostics.previousBookingId = previous?.id || null;
  diagnostics.nextBookingId = next?.id || null;
  diagnostics.proposedOnSiteDeadlineLocal = localFromMs(window.operationalStart);
  if (previous) {
    const prevWindow = jobWindow(previous, input.config);
    diagnostics.previousBookingTripDate = normalizeSmartTripDate(previous.tripDate);
    diagnostics.previousBookingTripTime = normalizeSmartTripTime(previous.tripTime);
    diagnostics.previousBookingPickupLocal = localFromMs(prevWindow.pickupMs);
    diagnostics.previousBookingDurationMinutes = prevWindow.duration;
    diagnostics.previousBookingCompletionLocal = localFromMs(prevWindow.journeyEnd);
    diagnostics.previousBookingDestination = previous.dropoffLabel;
    diagnostics.previousBookingOperationalEndLocal = localFromMs(prevWindow.end);
    diagnostics.previousPositioningMinutes = repositionMinutes(prevWindow.dropoff, window.pickup, {
      fromLabel: previous.dropoffLabel,
      toLabel: input.requested.pickupLabel,
    });
    diagnostics.previousPositioningNeededMinutes = positioningTimeNeededMinutes(
      diagnostics.previousPositioningMinutes,
      input.config.buffers.minTurnaroundMinutes,
    );
    if (prevWindow.journeyEnd != null) {
      diagnostics.earliestReadyAfterPreviousLocal = localFromMs(
        prevWindow.journeyEnd + diagnostics.previousPositioningNeededMinutes * 60_000,
      );
    }
  }
  if (next) {
    const nextWindow = jobWindow(next, input.config);
    diagnostics.nextPositioningMinutes = repositionMinutes(window.dropoff, nextWindow.pickup, {
      fromLabel: input.requested.dropoffLabel,
      toLabel: next.pickupLabel,
    });
    diagnostics.positioningMinutes = diagnostics.nextPositioningMinutes;
    diagnostics.positioningFromLabel = input.requested.dropoffLabel;
    diagnostics.positioningToLabel = next.pickupLabel;
    diagnostics.positioningFromCoords = window.dropoff;
    diagnostics.positioningToCoords = nextWindow.pickup;
    diagnostics.positioningCoordsKnown = Boolean(window.dropoff && nextWindow.pickup);
  } else if (previous) {
    const prevWindow = jobWindow(previous, input.config);
    diagnostics.positioningMinutes = diagnostics.previousPositioningMinutes;
    diagnostics.positioningFromLabel = previous.dropoffLabel;
    diagnostics.positioningToLabel = input.requested.pickupLabel;
    diagnostics.positioningFromCoords = prevWindow.dropoff;
    diagnostics.positioningToCoords = window.pickup;
    diagnostics.positioningCoordsKnown = Boolean(prevWindow.dropoff && window.pickup);
  }
  if (diagnostics.positioningMinutes != null) {
    diagnostics.positioningTravelMinutes = diagnostics.positioningMinutes;
    diagnostics.positioningNeededMinutes = positioningTimeNeededMinutes(
      diagnostics.positioningMinutes,
      input.config.buffers.minTurnaroundMinutes,
    );
  }
  diagnostics.proposedPickupResolvedLocal = localFromMs(start);
  diagnostics.proposedCompletionResolvedLocal = localFromMs(window.journeyEnd);
  if (next) {
    const nextWindow = jobWindow(next, input.config);
    diagnostics.nextBookingTripDate = normalizeSmartTripDate(next.tripDate);
    diagnostics.nextBookingTripTime = normalizeSmartTripTime(next.tripTime);
    diagnostics.nextBookingResolvedLocal = localFromMs(nextWindow.pickupMs);
    diagnostics.nextPickupLocal = diagnostics.nextBookingResolvedLocal;
    diagnostics.sameCalendarDayAsNext = Boolean(
      requestedDay && diagnostics.nextBookingTripDate === requestedDay,
    );
    diagnostics.comparisonFromLocal = localFromMs(window.journeyEnd);
    diagnostics.comparisonToLocal = localFromMs(nextWindow.start);
    if (window.journeyEnd != null && nextWindow.start != null) {
      diagnostics.positioningGapMinutes = Math.round((nextWindow.start - window.journeyEnd) / 60_000);
    }
    if (window.journeyEnd != null && diagnostics.positioningNeededMinutes != null) {
      diagnostics.earliestReadyLocal = localFromMs(
        window.journeyEnd + diagnostics.positioningNeededMinutes * 60_000,
      );
    }
  } else if (previous && diagnostics.previousPositioningMinutes != null) {
    const prevWindow = jobWindow(previous, input.config);
    const needed = positioningTimeNeededMinutes(
      diagnostics.previousPositioningMinutes,
      input.config.buffers.minTurnaroundMinutes,
    );
    if (prevWindow.journeyEnd != null) {
      diagnostics.positioningGapMinutes =
        window.operationalStart == null
          ? null
          : Math.round((window.operationalStart - prevWindow.journeyEnd) / 60_000);
      diagnostics.earliestReadyLocal = localFromMs(prevWindow.journeyEnd + needed * 60_000);
      diagnostics.nextPickupLocal = localFromMs(start);
    }
  }

  const warnings: SmartConflictWarning[] = [];
  for (const job of activeJobs) {
    const warning = conflictAgainstJob(
      window.operationalStart,
      window.operationalEnd,
      start,
      window.journeyEnd ?? window.operationalEnd,
      window.pickup,
      window.dropoff,
      input.requested.pickupLabel,
      input.requested.dropoffLabel,
      job,
      input.config,
    );
    if (warning) warnings.push(warning);
  }

  // Same numbers as the diagnostics — never let operational-window padding
  // skip the travel + turnaround requirement that the owner just saw.
  if (next && window.journeyEnd != null && diagnostics.positioningNeededMinutes != null) {
    const nextWindow = jobWindow(next, input.config);
    if (
      nextWindow.start != null &&
      positioningOverrunsDeadline(
        window.journeyEnd,
        diagnostics.positioningNeededMinutes,
        nextWindow.start,
      ) &&
      !warnings.some((item) => item.bookingId === next.id)
    ) {
      warnings.push(
        positioningWarning(
          next,
          true,
          diagnostics.nextPositioningMinutes || 0,
          input.config.buffers.minTurnaroundMinutes,
        ),
      );
    }
  }
  if (previous && diagnostics.previousPositioningMinutes != null) {
    const prevWindow = jobWindow(previous, input.config);
    const needed = positioningTimeNeededMinutes(
      diagnostics.previousPositioningMinutes,
      input.config.buffers.minTurnaroundMinutes,
    );
    if (
      prevWindow.journeyEnd != null &&
      positioningOverrunsDeadline(prevWindow.journeyEnd, needed, window.operationalStart) &&
      !warnings.some((item) => item.bookingId === previous.id)
    ) {
      warnings.push(
        positioningWarning(
          previous,
          false,
          diagnostics.previousPositioningMinutes,
          input.config.buffers.minTurnaroundMinutes,
        ),
      );
    }
  }

  // Backup-driver mode must not bypass conflicts until real assignment exists.
  const overCapacity = warnings.length > 0;
  let available = !blocked && !overCapacity;
  let reason: SmartOpsReasonCode = blocked
    ? availabilityReason(blocked, Boolean(pickupBlocked))
    : overCapacity
      ? warnings[0]?.reason || SMART_OPS_REASON.CONFLICT_EXISTING_BOOKING
      : SMART_OPS_REASON.AVAILABLE_NO_CONFLICT;

  if (!available && input.ownerOverride) {
    available = true;
    reason = SMART_OPS_REASON.OWNER_OVERRIDE;
  }

  const primaryWarning = warnings[0] || null;
  diagnostics.conflictBookingId = primaryWarning?.bookingId || null;
  diagnostics.conflictSummary = primaryWarning?.summary || null;
  if (blocked) {
    diagnostics.conflictKind = "block";
  } else if (primaryWarning) {
    if (primaryWarning.reason === SMART_OPS_REASON.CONFLICT_MINIMUM_TURNAROUND) {
      diagnostics.conflictKind = "turnaround";
    } else if (primaryWarning.reason === SMART_OPS_REASON.CONFLICT_NEXT_BOOKING) {
      diagnostics.conflictKind = "next_positioning";
    } else if (
      primaryWarning.reason === SMART_OPS_REASON.CONFLICT_POSITIONING_TIME ||
      (previous && primaryWarning.bookingId === previous.id && /reach this pickup|turnaround needed after/i.test(primaryWarning.summary))
    ) {
      diagnostics.conflictKind = "previous_positioning";
    } else if (/overlap/i.test(primaryWarning.summary) || primaryWarning.reason === SMART_OPS_REASON.CONFLICT_EXISTING_BOOKING) {
      diagnostics.conflictKind = "overlap";
    } else if (previous && primaryWarning.bookingId === previous.id) {
      diagnostics.conflictKind = "previous_positioning";
    } else {
      diagnostics.conflictKind = "next_positioning";
    }
  }
  const showPreviousHop =
    Boolean(previous) &&
    (diagnostics.conflictBookingId === previous?.id ||
      diagnostics.sameCalendarDayAsNext === false ||
      !next);
  if (showPreviousHop && previous && diagnostics.previousPositioningMinutes != null) {
    const prevWindow = jobWindow(previous, input.config);
    diagnostics.positioningMinutes = diagnostics.previousPositioningMinutes;
    diagnostics.positioningTravelMinutes = diagnostics.previousPositioningMinutes;
    diagnostics.positioningNeededMinutes = diagnostics.previousPositioningNeededMinutes;
    diagnostics.positioningFromLabel = previous.dropoffLabel;
    diagnostics.positioningToLabel = input.requested.pickupLabel;
    diagnostics.positioningFromCoords = prevWindow.dropoff;
    diagnostics.positioningToCoords = window.pickup;
    diagnostics.positioningCoordsKnown = Boolean(prevWindow.dropoff && window.pickup);
    diagnostics.earliestReadyLocal = diagnostics.earliestReadyAfterPreviousLocal;
    diagnostics.comparisonFromLocal = diagnostics.previousBookingCompletionLocal;
    diagnostics.comparisonToLocal = diagnostics.proposedOnSiteDeadlineLocal;
    if (prevWindow.journeyEnd != null && window.operationalStart != null) {
      diagnostics.positioningGapMinutes = Math.round(
        (window.operationalStart - prevWindow.journeyEnd) / 60_000,
      );
    }
  }

  const suggestion = !available && input.searchAlternatives !== false
    ? suggestAlternativeTimes({
        requested: input.requested,
        occupied: input.occupied,
        rules: input.rules,
        exceptions: input.exceptions,
        legacyPeriods: input.legacyPeriods,
        config: input.config,
        now: input.now,
      })
    : { alternatives: [] as SmartAlternativeTime[], skippedCrossDate: false };

  let alternativeReason: SmartOpsReasonCode | null = null;
  if (!available && input.searchAlternatives !== false) {
    if (suggestion.alternatives.length) {
      reason = SMART_OPS_REASON.ALTERNATIVE_TIME_FOUND;
      alternativeReason = SMART_OPS_REASON.ALTERNATIVE_TIME_FOUND;
    } else if (suggestion.skippedCrossDate) {
      alternativeReason = SMART_OPS_REASON.ALTERNATIVE_CROSSES_DATE_DISABLED;
    } else {
      alternativeReason = SMART_OPS_REASON.NO_ALTERNATIVE_WITHIN_MAX_SHIFT;
    }
  }

  return {
    available,
    reason,
    alternativeReason,
    alternatives: suggestion.alternatives,
    warnings,
    nextAvailableFromLocal: expectedFinishLocal,
    expectedFinishLocal,
    expectedFinishLabel: input.requested.dropoffLabel,
    durationMinutes: duration,
    bufferMinutes: buffer,
    ownerOverrideApplied: Boolean(input.ownerOverride && reason === SMART_OPS_REASON.OWNER_OVERRIDE),
    diagnostics,
  };
}

/** Latest same-day pickup that still satisfies positioning before `beforeTime`. */
export function findLatestSafePickup(input: {
  requested: SmartRequestedJourney;
  occupied: SmartOccupiedJob[];
  rules?: SmartAvailabilityRule[];
  exceptions?: SmartAvailabilityException[];
  legacyPeriods?: UnavailablePeriod[];
  config: SmartOpsConfig;
  beforeTime: string;
  now?: Date;
  stepMinutes?: number;
}): { tripTime: string; decision: SmartAvailabilityDecision } | null {
  if (pickupMs(input.requested.tripDate, input.beforeTime) == null) return null;
  const step = input.stepMinutes && input.stepMinutes > 0 ? input.stepMinutes : 1;
  for (let minutes = step; minutes <= 12 * 60; minutes += step) {
    const shifted = addMinutesToTrip(input.requested.tripDate, input.beforeTime, -minutes);
    if (!shifted || shifted.tripDate !== input.requested.tripDate) continue;
    const decision = evaluateSmartAvailability({
      requested: { ...input.requested, ...shifted },
      occupied: input.occupied,
      rules: input.rules,
      exceptions: input.exceptions,
      legacyPeriods: input.legacyPeriods,
      config: input.config,
      searchAlternatives: false,
      now: input.now,
    });
    if (decision.available) {
      return { tripTime: shifted.tripTime, decision };
    }
  }
  return null;
}

const ALT_STEPS = [15, 30, 45, 60, 90] as const;

export function suggestAlternativeTimes(input: {
  requested: SmartRequestedJourney;
  occupied: SmartOccupiedJob[];
  rules?: SmartAvailabilityRule[];
  exceptions?: SmartAvailabilityException[];
  legacyPeriods?: UnavailablePeriod[];
  config: SmartOpsConfig;
  now?: Date;
}): { alternatives: SmartAlternativeTime[]; skippedCrossDate: boolean } {
  const maxShift = input.config.alternatives.maxShiftMinutes;
  const allowAcrossMidnight = input.config.alternatives.allowAcrossMidnight;
  const nowMs = (input.now ?? new Date()).getTime();
  const found: SmartAlternativeTime[] = [];
  let skippedCrossDate = false;

  for (const step of ALT_STEPS) {
    if (step > maxShift) continue;
    for (const delta of [-step, step]) {
      const shifted = addMinutesToTrip(input.requested.tripDate, input.requested.tripTime, delta);
      if (!shifted) continue;
      const candidateMs = pickupMs(shifted.tripDate, shifted.tripTime);
      if (candidateMs == null || candidateMs <= nowMs) continue;
      if (shifted.tripDate !== input.requested.tripDate) {
        if (!allowAcrossMidnight) {
          skippedCrossDate = true;
          continue;
        }
      }
      const decision = evaluateSmartAvailability({
        requested: { ...input.requested, ...shifted },
        occupied: input.occupied,
        rules: input.rules,
        exceptions: input.exceptions,
        legacyPeriods: input.legacyPeriods,
        config: input.config,
        searchAlternatives: false,
        now: input.now,
      });
      if (decision.available) {
        found.push({
          tripDate: shifted.tripDate,
          tripTime: shifted.tripTime,
          deltaMinutes: delta,
        });
      }
    }
  }

  return {
    alternatives: found
      .sort((a, b) => Math.abs(a.deltaMinutes) - Math.abs(b.deltaMinutes))
      .slice(0, 4),
    skippedCrossDate,
  };
}

export function formatClock(time: string): string {
  const [h, m] = time.split(":");
  const hour = Number(h);
  if (!Number.isFinite(hour)) return time;
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 || 12;
  return m === "00" ? `${hour12}:00${suffix}` : `${hour12}:${pad2(Number(m))}${suffix}`;
}

function formatClockFriendly(time: string): string {
  const [h, m] = time.split(":");
  const hour = Number(h);
  if (!Number.isFinite(hour)) return time;
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 || 12;
  if (m === "00") return `${hour12}:00${suffix}`;
  return `${hour12}:${pad2(Number(m))}${suffix}`;
}

export function customerAvailabilityMessage(
  decision: SmartAvailabilityDecision,
  requestedTime: string,
): string {
  if (decision.available) return "";
  if (decision.alternatives.length) {
    const options = decision.alternatives.map((item) => formatClockFriendly(item.tripTime)).join("\n");
    return `Unfortunately, ${formatClockFriendly(requestedTime)} isn't available.\n\nNearby times available:\n${options}`;
  }
  return "Unfortunately, we don't have availability around your requested pickup time. Please choose another time or date.";
}

export type PaidBookingLikeForJobs = {
  paymentReference?: string;
  id?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  tripDate?: string;
  tripTime?: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  journeyDuration?: string;
  routeDurationMinutes?: number | null;
  routeDistanceKm?: number | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  airportCode?: string | null;
  isFromAirport?: boolean | null;
  operationalStatus?: string;
  paymentStatus?: string;
  status?: string;
  cancelled?: boolean;
  isRefundTest?: boolean;
  isAmendmentTestFixture?: boolean;
};

function finiteCoord(lat?: number | null, lng?: number | null): SmartCoords | null {
  if (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng };
  }
  return null;
}

/**
 * Build occupied operational jobs from a paid booking.
 * Return bookings emit BOTH legs. Cancelled operational bookings are omitted.
 * Refund / payment state alone does not remove an operational booking.
 */
export function occupiedJobsFromPaidBooking(
  booking: PaidBookingLikeForJobs,
): SmartOccupiedJob[] {
  if (booking.isRefundTest || booking.isAmendmentTestFixture) return [];
  if (booking.operationalStatus === "cancelled" || booking.status === "cancelled" || booking.cancelled) {
    return [];
  }
  const id = String(booking.paymentReference || booking.id || "").trim();
  const tripDate = normalizeSmartTripDate(booking.tripDate);
  const tripTime = normalizeSmartTripTime(booking.tripTime);
  if (!id || !tripDate || !tripTime) return [];

  const duration =
    (booking.routeDurationMinutes && booking.routeDurationMinutes > 0
      ? Math.round(booking.routeDurationMinutes)
      : 0) || parseJourneyDurationMinutes(booking.journeyDuration);

  const pickup = resolveSmartOpsPoint(
    finiteCoord(booking.pickupLat, booking.pickupLng),
    booking.pickupLabel,
    booking.airportCode,
  );
  const dropoff = resolveSmartOpsPoint(
    finiteCoord(booking.dropoffLat, booking.dropoffLng),
    booking.dropoffLabel,
    booking.airportCode,
  );

  const outbound: SmartOccupiedJob = {
    id,
    pickupLabel: booking.pickupLabel || "",
    dropoffLabel: booking.dropoffLabel || "",
    pickup,
    dropoff,
    tripDate,
    tripTime,
    durationMinutes: duration,
    airportCode: booking.airportCode,
    isFromAirport: booking.isFromAirport,
    cancelled: false,
    status: booking.status,
    operationalStatus: booking.operationalStatus,
    paymentStatus: booking.paymentStatus,
    routeDurationMinutes: booking.routeDurationMinutes || undefined,
    routeDistanceKm: booking.routeDistanceKm || undefined,
    leg: "outbound",
  };

  const jobs: SmartOccupiedJob[] = [outbound];
  const returnDate = normalizeSmartTripDate(booking.returnDate);
  const returnTime = normalizeSmartTripTime(booking.returnTime);
  if (booking.returnJourney && returnDate && returnTime) {
    jobs.push({
      ...outbound,
      id: `${id}:return`,
      pickupLabel: booking.dropoffLabel || "",
      dropoffLabel: booking.pickupLabel || "",
      pickup: dropoff,
      dropoff: pickup,
      tripDate: returnDate,
      tripTime: returnTime,
      airportCode: matchServedAirportCode(booking.dropoffLabel || "") || booking.airportCode,
      isFromAirport: Boolean(matchServedAirportCode(booking.dropoffLabel || "")),
      leg: "return",
    });
  }
  return jobs;
}
