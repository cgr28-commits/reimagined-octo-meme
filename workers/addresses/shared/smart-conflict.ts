/**
 * Smart booking conflict + positioning engine.
 * Geography and journey duration matter — this is not a simple calendar overlap.
 */

import { parseLondonLocalDateTime } from "./uk-time";
import { matchServedAirportCode, getServedAirport } from "./served-airports";
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
import { addDaysYmd } from "./upcoming-jobs";

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
  nextBookingId: string | null;
  positioningMinutes: number | null;
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
  const matched = matchServedAirportCode(label || "") || (code || "").trim().toUpperCase();
  if (!matched) return null;
  const airport = getServedAirport(matched);
  return airport ? { lat: airport.lat, lng: airport.lng } : null;
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
  const pickup = input.pickup || coordsFromAirportHint(input.pickupLabel, input.airportCode);
  const dropoff = input.dropoff || coordsFromAirportHint(input.dropoffLabel, input.airportCode);
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
  return left === right || left.includes(right) || right.includes(left);
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
    return Math.round((miles / REPOSITION_SPEED_MPH) * 60) + REPOSITION_OVERHEAD_MINUTES;
  }
  if (labelsLikelySamePlace(options?.fromLabel, options?.toLabel)) return 0;
  return UNKNOWN_LOCATION_REPOSITION_MINUTES;
}

function pickupMs(date: string, time: string): number | null {
  const instant = parseLondonLocalDateTime(date, time);
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
  if (explicit && Number.isFinite(explicit.lat) && Number.isFinite(explicit.lng)) return explicit;
  return coordsFromAirportHint(label, airportCode);
}

type JobWindow = {
  pickupMs: number | null;
  start: number | null;
  end: number | null;
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

function conflictAgainstJob(
  requestedStart: number,
  requestedEnd: number,
  requestedPickupAt: number,
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

  if (requestedEnd <= window.start) {
    const gap = (window.start - requestedEnd) / 60000;
    const travel = repositionMinutes(requestedDropoff, window.pickup, {
      knownTravelMinutes: occupied.knownTravelMinutes,
      fromLabel: requestedDropoffLabel,
      toLabel: window.pickupLabel,
    });
    const needed = Math.max(minTurnaround, travel);
    if (gap + 0.01 < needed) {
      return {
        bookingId: occupied.id,
        reason: conflictReasonForJob(
          occupied,
          true,
          travel > minTurnaround ? "positioning" : "turnaround",
        ),
        summary:
          travel > minTurnaround
            ? `Not enough time to reach booking ${occupied.id}`
            : `Minimum ${minTurnaround}-minute turnaround needed before booking ${occupied.id}`,
      };
    }
  }

  if (window.end <= requestedStart) {
    const gap = (requestedStart - window.end) / 60000;
    const travel = repositionMinutes(window.dropoff, requestedPickup, {
      fromLabel: window.finishLabel,
      toLabel: requestedPickupLabel,
    });
    const needed = Math.max(minTurnaround, travel);
    if (gap + 0.01 < needed) {
      return {
        bookingId: occupied.id,
        reason: conflictReasonForJob(
          occupied,
          false,
          travel > minTurnaround ? "positioning" : "turnaround",
        ),
        summary:
          travel > minTurnaround
            ? `Not enough time after booking ${occupied.id} to reach this pickup`
            : `Minimum ${minTurnaround}-minute turnaround needed after booking ${occupied.id}`,
      };
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
    nextBookingId: null,
    positioningMinutes: null,
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
  const sorted = [...activeJobs].sort((a, b) => {
    const aMs = pickupMs(a.tripDate, a.tripTime) || 0;
    const bMs = pickupMs(b.tripDate, b.tripTime) || 0;
    return aMs - bMs;
  });
  const previous = [...sorted].reverse().find((job) => {
    const ms = pickupMs(job.tripDate, job.tripTime);
    return ms != null && ms < start;
  });
  const next = sorted.find((job) => {
    const ms = pickupMs(job.tripDate, job.tripTime);
    return ms != null && ms >= start;
  });
  diagnostics.previousBookingId = previous?.id || null;
  diagnostics.nextBookingId = next?.id || null;
  if (previous) {
    diagnostics.positioningMinutes = repositionMinutes(
      jobWindow(previous, input.config).dropoff,
      window.pickup,
      {
        fromLabel: previous.dropoffLabel,
        toLabel: input.requested.pickupLabel,
      },
    );
  } else if (next) {
    diagnostics.positioningMinutes = repositionMinutes(window.dropoff, jobWindow(next, input.config).pickup, {
      fromLabel: input.requested.dropoffLabel,
      toLabel: next.pickupLabel,
    });
  }

  const warnings: SmartConflictWarning[] = [];
  for (const job of activeJobs) {
    const warning = conflictAgainstJob(
      window.operationalStart,
      window.operationalEnd,
      start,
      window.pickup,
      window.dropoff,
      input.requested.pickupLabel,
      input.requested.dropoffLabel,
      job,
      input.config,
    );
    if (warning) warnings.push(warning);
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
  if (!id || !booking.tripDate || !booking.tripTime) return [];

  const duration =
    (booking.routeDurationMinutes && booking.routeDurationMinutes > 0
      ? Math.round(booking.routeDurationMinutes)
      : 0) || parseJourneyDurationMinutes(booking.journeyDuration);

  const pickup = finiteCoord(booking.pickupLat, booking.pickupLng) ||
    coordsFromAirportHint(booking.pickupLabel, booking.airportCode);
  const dropoff = finiteCoord(booking.dropoffLat, booking.dropoffLng) ||
    coordsFromAirportHint(booking.dropoffLabel, booking.airportCode);

  const outbound: SmartOccupiedJob = {
    id,
    pickupLabel: booking.pickupLabel || "",
    dropoffLabel: booking.dropoffLabel || "",
    pickup,
    dropoff,
    tripDate: booking.tripDate,
    tripTime: booking.tripTime,
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
  if (booking.returnJourney && booking.returnDate && booking.returnTime) {
    jobs.push({
      ...outbound,
      id: `${id}:return`,
      pickupLabel: booking.dropoffLabel || "",
      dropoffLabel: booking.pickupLabel || "",
      pickup: dropoff,
      dropoff: pickup,
      tripDate: booking.returnDate,
      tripTime: booking.returnTime,
      airportCode: matchServedAirportCode(booking.dropoffLabel || "") || booking.airportCode,
      isFromAirport: Boolean(matchServedAirportCode(booking.dropoffLabel || "")),
      leg: "return",
    });
  }
  return jobs;
}
