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

export type SmartAvailabilityDecision = {
  available: boolean;
  reason: SmartOpsReasonCode;
  alternatives: SmartAlternativeTime[];
  warnings: SmartConflictWarning[];
  nextAvailableFromLocal: string | null;
  expectedFinishLocal: string | null;
  expectedFinishLabel: string;
  durationMinutes: number;
  bufferMinutes: number;
  ownerOverrideApplied: boolean;
};

const LONG_DISTANCE_MILES = 50;
const REPOSITION_SPEED_MPH = 40;
const REPOSITION_OVERHEAD_MINUTES = 8;

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

export function isLongDistanceJourney(input: {
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  airportCode?: string | null;
  pickup?: SmartCoords | null;
  dropoff?: SmartCoords | null;
  durationMinutes?: number;
}): boolean {
  const hay = `${input.pickupLabel || ""} ${input.dropoffLabel || ""}`.toLowerCase();
  if (/\bdublin\b|\bdub\b|\blondonderry\b|\bderry\b|\bldy\b|\benniskillen\b/.test(hay)) {
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
}): number {
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
  const airportPickup =
    journey.isFromAirport === true ||
    Boolean(matchServedAirportCode(journey.pickupLabel || ""));
  if (airportPickup) return config.buffers.airportPickupBufferMinutes;
  if (isLongDistanceJourney(journey)) return config.buffers.longDistanceBufferMinutes;
  return config.buffers.shortJourneyBufferMinutes;
}

export function repositionMinutes(from: SmartCoords | null | undefined, to: SmartCoords | null | undefined): number {
  if (!from || !to) return 25;
  const miles = roadMilesEstimate(from, to);
  if (miles < 2) return 5;
  return Math.round((miles / REPOSITION_SPEED_MPH) * 60) + REPOSITION_OVERHEAD_MINUTES;
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

function resolvePoint(
  explicit: SmartCoords | null | undefined,
  label?: string | null,
  airportCode?: string | null,
): SmartCoords | null {
  if (explicit && Number.isFinite(explicit.lat) && Number.isFinite(explicit.lng)) return explicit;
  return coordsFromAirportHint(label, airportCode);
}

function jobWindow(job: SmartOccupiedJob, config: SmartOpsConfig) {
  const start = pickupMs(job.tripDate, job.tripTime);
  const duration = estimateDurationMinutes(job);
  const buffer = operationalBufferMinutes({ ...job, durationMinutes: duration }, config);
  const pickup = resolvePoint(job.pickup, job.pickupLabel, job.airportCode);
  const dropoff = resolvePoint(job.dropoff, job.dropoffLabel, job.airportCode);
  return {
    start,
    end: start == null ? null : start + (duration + buffer) * 60 * 1000,
    duration,
    buffer,
    pickup,
    dropoff,
    finishLabel: job.dropoffLabel,
  };
}

function isCancelledJob(job: SmartOccupiedJob): boolean {
  if (job.cancelled) return true;
  const status = String(job.status || "").toLowerCase();
  return status === "cancelled" || status === "refunded";
}

function conflictAgainstJob(
  requestedStart: number,
  requestedEnd: number,
  requestedPickup: SmartCoords | null,
  requestedDropoff: SmartCoords | null,
  occupied: SmartOccupiedJob,
  config: SmartOpsConfig,
): SmartConflictWarning | null {
  const window = jobWindow(occupied, config);
  if (window.start == null || window.end == null) return null;

  if (requestedStart < window.end && requestedEnd > window.start) {
    return {
      bookingId: occupied.id,
      reason: isLongDistanceJourney(occupied)
        ? SMART_OPS_REASON.CONFLICT_LONG_DISTANCE
        : SMART_OPS_REASON.CONFLICT_EXISTING_BOOKING,
      summary: `Overlaps operational window of booking ${occupied.id}`,
    };
  }

  if (requestedEnd <= window.start) {
    const gap = (window.start - requestedEnd) / 60000;
    const travel = repositionMinutes(requestedDropoff, window.pickup);
    const needed = travel <= 5 ? 0 : travel;
    if (gap + 0.01 < needed) {
      return {
        bookingId: occupied.id,
        reason: isLongDistanceJourney({
          ...occupied,
          durationMinutes: occupied.durationMinutes,
        })
          ? SMART_OPS_REASON.CONFLICT_LONG_DISTANCE
          : SMART_OPS_REASON.CONFLICT_POSITIONING_TIME,
        summary: `Not enough time to reach booking ${occupied.id}`,
      };
    }
  }

  if (window.end <= requestedStart) {
    const gap = (requestedStart - window.end) / 60000;
    const travel = repositionMinutes(window.dropoff, requestedPickup);
    const needed = travel <= 5 ? 0 : travel;
    if (gap + 0.01 < needed) {
      return {
        bookingId: occupied.id,
        reason: isLongDistanceJourney(occupied)
          ? SMART_OPS_REASON.CONFLICT_LONG_DISTANCE
          : SMART_OPS_REASON.CONFLICT_POSITIONING_TIME,
        summary: `Not enough time after booking ${occupied.id} to reach this pickup`,
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
  const buffer = operationalBufferMinutes({ ...job, durationMinutes: duration }, config);
  const added = addMinutesToTrip(job.tripDate, job.tripTime, duration + buffer);
  if (!added) return null;
  return {
    local: `${added.tripDate}T${added.tripTime}`,
    finishLabel: job.dropoffLabel,
  };
}

function availabilityReason(interval: SmartBlockedInterval | null): SmartOpsReasonCode {
  if (!interval) return SMART_OPS_REASON.AVAILABLE_NO_CONFLICT;
  if (interval.recurring) return SMART_OPS_REASON.BLOCKED_RECURRING_AVAILABILITY;
  return SMART_OPS_REASON.BLOCKED_OWNER_AVAILABILITY;
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
  const duration = estimateDurationMinutes(input.requested);
  const buffer = operationalBufferMinutes({ ...input.requested, durationMinutes: duration }, input.config);
  const start = pickupMs(input.requested.tripDate, input.requested.tripTime);
  const pickup = resolvePoint(
    input.requested.pickup,
    input.requested.pickupLabel,
    input.requested.airportCode,
  );
  const dropoff = resolvePoint(
    input.requested.dropoff,
    input.requested.dropoffLabel,
    input.requested.airportCode,
  );
  const finish = addMinutesToTrip(input.requested.tripDate, input.requested.tripTime, duration + buffer);
  const expectedFinishLocal = finish ? `${finish.tripDate}T${finish.tripTime}` : null;

  const empty: SmartAvailabilityDecision = {
    available: false,
    reason: SMART_OPS_REASON.CONFLICT_EXISTING_BOOKING,
    alternatives: [],
    warnings: [],
    nextAvailableFromLocal: expectedFinishLocal,
    expectedFinishLocal,
    expectedFinishLabel: input.requested.dropoffLabel,
    durationMinutes: duration,
    bufferMinutes: buffer,
    ownerOverrideApplied: false,
  };

  if (start == null) return empty;
  const end = start + (duration + buffer) * 60 * 1000;

  const fromYmd = addDaysYmd(input.requested.tripDate, -1);
  const toYmd = addDaysYmd(input.requested.tripDate, 1);
  const intervals = expandSmartAvailabilityIntervals({
    rules: input.rules || [],
    exceptions: input.exceptions,
    fromYmd,
    toYmd,
    legacyPeriods: input.legacyPeriods,
  });
  const blocked = findBlockingSmartInterval(
    input.requested.tripDate,
    input.requested.tripTime,
    intervals,
  );

  const activeJobs = input.occupied.filter((job) => !isCancelledJob(job));
  const capacity = input.config.flags.backupDriverCapacity &&
    input.config.driverCapacity === "owner_plus_backup"
    ? 2
    : 1;

  const warnings: SmartConflictWarning[] = [];
  for (const job of activeJobs) {
    const warning = conflictAgainstJob(start, end, pickup, dropoff, job, input.config);
    if (warning) warnings.push(warning);
  }

  const overCapacity = capacity === 1 ? warnings.length > 0 : warnings.length >= 2;
  let available = !blocked && !overCapacity;
  let reason: SmartOpsReasonCode = blocked
    ? availabilityReason(blocked)
    : overCapacity
      ? warnings[0]?.reason || SMART_OPS_REASON.CONFLICT_EXISTING_BOOKING
      : SMART_OPS_REASON.AVAILABLE_NO_CONFLICT;

  if (!available && input.ownerOverride) {
    available = true;
    reason = SMART_OPS_REASON.OWNER_OVERRIDE;
  }

  const alternatives =
    !available && input.searchAlternatives !== false
      ? suggestAlternativeTimes({
          requested: input.requested,
          occupied: input.occupied,
          rules: input.rules,
          exceptions: input.exceptions,
          legacyPeriods: input.legacyPeriods,
          config: input.config,
        })
      : [];

  if (!available && alternatives.length) {
    reason = SMART_OPS_REASON.ALTERNATIVE_TIME_FOUND;
  } else if (!available && input.searchAlternatives !== false && !blocked === false) {
    // keep blocked reason
  } else if (!available && alternatives.length === 0 && input.searchAlternatives !== false && !blocked) {
    reason = warnings[0]?.reason || SMART_OPS_REASON.NO_ALTERNATIVE_TIME;
  }

  return {
    available,
    reason,
    alternatives,
    warnings,
    nextAvailableFromLocal: expectedFinishLocal,
    expectedFinishLocal,
    expectedFinishLabel: input.requested.dropoffLabel,
    durationMinutes: duration,
    bufferMinutes: buffer,
    ownerOverrideApplied: Boolean(input.ownerOverride && reason === SMART_OPS_REASON.OWNER_OVERRIDE),
  };
}

const ALT_OFFSETS = [-15, 15, -30, 30, -45, 45, -60, 60];

export function suggestAlternativeTimes(input: {
  requested: SmartRequestedJourney;
  occupied: SmartOccupiedJob[];
  rules?: SmartAvailabilityRule[];
  exceptions?: SmartAvailabilityException[];
  legacyPeriods?: UnavailablePeriod[];
  config: SmartOpsConfig;
}): SmartAlternativeTime[] {
  const found: SmartAlternativeTime[] = [];
  for (const delta of ALT_OFFSETS) {
    const shifted = addMinutesToTrip(input.requested.tripDate, input.requested.tripTime, delta);
    if (!shifted) continue;
    const decision = evaluateSmartAvailability({
      requested: { ...input.requested, ...shifted },
      occupied: input.occupied,
      rules: input.rules,
      exceptions: input.exceptions,
      legacyPeriods: input.legacyPeriods,
      config: input.config,
      searchAlternatives: false,
    });
    if (decision.available) {
      found.push({
        tripDate: shifted.tripDate,
        tripTime: shifted.tripTime,
        deltaMinutes: delta,
      });
    }
  }
  return found.sort((a, b) => Math.abs(a.deltaMinutes) - Math.abs(b.deltaMinutes)).slice(0, 4);
}

export function formatClock(time: string): string {
  const [h, m] = time.split(":");
  const hour = Number(h);
  if (!Number.isFinite(hour)) return time;
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 || 12;
  return m === "00" ? `${hour12}:00${suffix}` : `${hour12}:${pad2(Number(m))}${suffix}`;
}

export function customerAvailabilityMessage(decision: SmartAvailabilityDecision, requestedTime: string): string {
  if (decision.available) return "";
  if (decision.alternatives.length) {
    const options = decision.alternatives.map((item) => formatClock(item.tripTime)).join("\n");
    return `Unfortunately, ${formatClock(requestedTime)} is unavailable.\n\nWe can offer:\n\n${options}`;
  }
  return "Unfortunately that time is unavailable. Please choose another time and we will check it for you.";
}
