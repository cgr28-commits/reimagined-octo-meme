/**
 * Empty Run discount for empty legs on the Belfast–Dublin corridor.
 * A customer can fill the approach to a distant confirmed pickup, or the
 * return toward base after a confirmed drop-off, including stops along route.
 *
 * Pure function. No KV, no network. The Worker loads the settings and the
 * confirmed jobs and calls this. Enabled by the owner setting; fail-open if unavailable.
 *
 * Rules
 * - One-way only, same diary (owner car ↔ owner car, Business Class ↔ Business Class).
 * - Customer route must align with the base↔confirmed-job corridor; route stops
 *   are allowed within the configured corridor tolerances.
 * - A confirmed job endpoint is at least `minParentDistanceMiles` from home.
 * - Approach trips arrive before the job; return trips start after it finishes.
 * - Discount applies to the journey fare only (incl. any surcharge). Airport
 *   fees stay full. Total never goes below `minFareGbp`; if the normal fare is
 *   already at or below the floor there is no discount.
 * - Road miles are an estimate (straight line × 1.48), same as Smart Availability.
 */

import {
  coordsFromAirportHint,
  estimateDurationMinutes,
  roadMilesEstimate,
  type SmartCoords,
  type SmartOccupiedJob,
} from "./smart-conflict";
import { occupiedJobResource, availabilityResourceForVehicle } from "./availability-resource";
import { parseLondonLocalDateTime } from "./uk-time";

export const EMPTY_RUN_CONFIG_KEY = "smart-ops:empty-run:v1";

/** Free waiting included on airport pickups (minutes). */
export const AIRPORT_PICKUP_WAIT_MINUTES = 60;

export type EmptyRunSettings = {
  enabled: boolean;
  maxDiscountPercent: number;
  minFareGbp: number;
  maxPickupFromBaseMiles: number;
  maxDropoffFromParentMiles: number;
  minParentDistanceMiles: number;
  arrivalBufferMinutes: number;
  maxIdleMinutes: number;
  updatedAt: string;
};

/**
 * 25% off, £185 floor. ON by default (owner approved go-live, 13 Nov 2026);
 * the owner switch in Empty Legs saves an override that turns it off.
 */
export const DEFAULT_EMPTY_RUN_SETTINGS: EmptyRunSettings = {
  enabled: true,
  maxDiscountPercent: 25,
  minFareGbp: 185,
  maxPickupFromBaseMiles: 15,
  maxDropoffFromParentMiles: 10,
  minParentDistanceMiles: 40,
  arrivalBufferMinutes: 60,
  maxIdleMinutes: 180,
  updatedAt: new Date(0).toISOString(),
};

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeEmptyRunSettings(raw: unknown): EmptyRunSettings {
  const input = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof EmptyRunSettings, unknown>>;
  const d = DEFAULT_EMPTY_RUN_SETTINGS;
  return {
    enabled: input.enabled === true,
    maxDiscountPercent: clamp(input.maxDiscountPercent, d.maxDiscountPercent, 5, 50),
    minFareGbp: clamp(input.minFareGbp, d.minFareGbp, 20, 500),
    maxPickupFromBaseMiles: clamp(input.maxPickupFromBaseMiles, d.maxPickupFromBaseMiles, 2, 40),
    maxDropoffFromParentMiles: clamp(input.maxDropoffFromParentMiles, d.maxDropoffFromParentMiles, 1, 30),
    minParentDistanceMiles: clamp(input.minParentDistanceMiles, d.minParentDistanceMiles, 15, 300),
    arrivalBufferMinutes: clamp(input.arrivalBufferMinutes, d.arrivalBufferMinutes, 10, 120),
    maxIdleMinutes: clamp(input.maxIdleMinutes, d.maxIdleMinutes, 30, 360),
    updatedAt: String(input.updatedAt || new Date().toISOString()),
  };
}

export type EmptyRunRequest = {
  pickupLabel: string;
  dropoffLabel: string;
  pickup?: SmartCoords | null;
  dropoff?: SmartCoords | null;
  airportCode?: string | null;
  fromAirport?: boolean | null;
  tripDate: string;
  tripTime: string;
  /** Passenger route duration in minutes (server-resolved). */
  durationMinutes: number;
  returnJourney: boolean;
  vehicle?: string | null;
};

export type EmptyRunFare = {
  amountGbp: number;
  journeyFareGbp: number;
  airportFixedCostsGbp: number;
  nightWeekendSurchargeGbp: number;
};

export type EmptyRunReason =
  | "EMPTY_RUN_APPLIED"
  | "EMPTY_RUN_DISABLED"
  | "EMPTY_RUN_RETURN_JOURNEY"
  | "EMPTY_RUN_MISSING_DATA"
  | "EMPTY_RUN_NO_MATCH"
  | "EMPTY_RUN_AT_FLOOR"
  | "EMPTY_RUN_OFFER_OTHER_TIME";

/** Cheaper pickup time on the same day. Estimate: re-quote at that time for the real price. */
export type EmptyRunTimeOffer = {
  tripDate: string;
  tripTime: string;
  direction: "earlier" | "later";
  estimatedAmountGbp: number;
  estimatedSavingGbp: number;
};

export type EmptyRunDecision = {
  applied: boolean;
  reason: EmptyRunReason;
  parentJobId?: string;
  normalAmountGbp?: number;
  savingGbp?: number;
  fare?: EmptyRunFare;
  offer?: EmptyRunTimeOffer;
};

function pointFor(coords: SmartCoords | null | undefined, label?: string | null, code?: string | null): SmartCoords | null {
  if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) return coords;
  return coordsFromAirportHint(label, code);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isCancelled(job: SmartOccupiedJob): boolean {
  const s = `${job.status ?? ""} ${job.operationalStatus ?? ""}`.toLowerCase();
  return job.cancelled === true || s.includes("cancel") || s.includes("refund");
}

export type EmptyRunMatch =
  | { kind: "fits"; job: SmartOccupiedJob; direction?: "to_parent" | "from_parent" }
  | {
      kind: "move_time";
      job: SmartOccupiedJob;
      /** Pickup time (HH:MM, same date) that would qualify, nearest to what was asked. */
      suggestedTripDate: string;
      suggestedTripTime: string;
      direction: "earlier" | "later";
    };

function londonParts(ms: number): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

const QUARTER_MS = 15 * 60_000;

function routePosition(point: SmartCoords, start: SmartCoords, end: SmartCoords): { progress: number; deviationMiles: number } {
  const dx = (end.lng - start.lng) * 54.6;
  const dy = (end.lat - start.lat) * 69;
  const px = (point.lng - start.lng) * 54.6;
  const py = (point.lat - start.lat) * 69;
  const length2 = dx * dx + dy * dy;
  const progress = length2 > 0.001 ? (px * dx + py * dy) / length2 : 0;
  const t = Math.max(0, Math.min(1, progress));
  const projected = { lat: start.lat + t * (end.lat - start.lat), lng: start.lng + t * (end.lng - start.lng) };
  // The route engine's road-mile estimate is straight-line distance × 1.48.
  const deviationMiles = roadMilesEstimate(point, projected) / 1.48;
  return { progress, deviationMiles };
}

/**
 * Find the confirmed job whose empty run this request fills.
 * "fits": the requested time works. "move_time": same route would work at
 * another pickup time on the same day (e.g. asked 16:00, 13:30 qualifies).
 */
export function matchEmptyRun(input: {
  request: EmptyRunRequest;
  occupied: SmartOccupiedJob[];
  base: SmartCoords;
  settings: EmptyRunSettings;
  now?: Date;
  /** Smart Availability check. Only bookable times are discounted or suggested. */
  isTimeAvailable?: (tripDate: string, tripTime: string) => boolean;
}): EmptyRunMatch | null {
  const { request, settings, base } = input;
  const reqPickup = pointFor(request.pickup, request.pickupLabel, request.fromAirport ? request.airportCode : null);
  const reqDropoff = pointFor(request.dropoff, request.dropoffLabel, request.fromAirport ? null : request.airportCode);
  const reqStart = parseLondonLocalDateTime(request.tripDate, request.tripTime);
  if (!reqPickup || !reqDropoff || !reqStart || !(request.durationMinutes > 0)) return null;
  // Airport pickups: the time is the flight landing time and up to 60 minutes'
  // free waiting is included, so plan for leaving the airport an hour later.
  const airportWaitMinutes = request.fromAirport ? AIRPORT_PICKUP_WAIT_MINUTES : 0;
  const durationMs = (request.durationMinutes + airportWaitMinutes) * 60_000;
  const arrivalMs = reqStart.getTime() + durationMs;
  const reqResource = availabilityResourceForVehicle(request.vehicle);
  // Suggested times must leave at least 2 hours' notice.
  const earliestAllowedMs = (input.now ?? new Date()).getTime() + 2 * 60 * 60_000;
  const available = (d: string, t: string) => {
    try {
      return input.isTimeAvailable ? input.isTimeAvailable(d, t) : true;
    } catch {
      return false;
    }
  };

  let fit: { job: SmartOccupiedJob; idle: number; direction: "to_parent" | "from_parent" } | null = null;
  let move: { job: SmartOccupiedJob; startMs: number; shift: number } | null = null;
  for (const job of input.occupied) {
    if (isCancelled(job)) continue;
    if (occupiedJobResource(job) !== reqResource) continue;
    const jobPickup = pointFor(job.pickup, job.pickupLabel, job.isFromAirport ? job.airportCode : null);
    const jobDropoff = pointFor(job.dropoff, job.dropoffLabel, job.isFromAirport ? null : job.airportCode);
    const jobStart = parseLondonLocalDateTime(job.tripDate, job.tripTime);
    if (!jobPickup || !jobDropoff || !jobStart) continue;
    if (job.tripDate !== request.tripDate) continue;
    const preDistance = roadMilesEstimate(base, jobPickup);
    const postDistance = roadMilesEstimate(base, jobDropoff);
    if (Math.max(preDistance, postDistance) < settings.minParentDistanceMiles) continue;

    // Fill the outbound positioning leg: base → passenger → confirmed pickup.
    const prePickup = routePosition(reqPickup, base, jobPickup);
    const preDrop = routePosition(reqDropoff, base, jobPickup);
    const preAligned = preDistance >= settings.minParentDistanceMiles && prePickup.progress >= -0.12 && prePickup.progress < preDrop.progress &&
      preDrop.progress >= 0.05 && preDrop.progress <= 1.12 &&
      prePickup.deviationMiles <= settings.maxPickupFromBaseMiles &&
      preDrop.deviationMiles <= settings.maxDropoffFromParentMiles;
    const idleMinutes = (jobStart.getTime() - arrivalMs) / 60_000;
    const askedFits = preAligned && idleMinutes >= settings.arrivalBufferMinutes && idleMinutes <= settings.maxIdleMinutes;
    if (askedFits && available(request.tripDate, request.tripTime)) {
      if (!fit || idleMinutes < fit.idle) fit = { job, idle: idleMinutes, direction: "to_parent" };
      continue;
    }

    // Fill the return leg after a Belfast → Dublin job: passenger pickup near
    // the confirmed drop-off, then travel toward base along the same corridor.
    const postPickup = routePosition(reqPickup, jobDropoff, base);
    const postDrop = routePosition(reqDropoff, jobDropoff, base);
    const postAligned = postDistance >= settings.minParentDistanceMiles && roadMilesEstimate(reqPickup, jobDropoff) <= settings.maxDropoffFromParentMiles &&
      postPickup.progress >= -0.12 && postPickup.progress < postDrop.progress &&
      postDrop.progress >= 0.05 && postDrop.progress <= 1.12 &&
      postDrop.deviationMiles <= settings.maxPickupFromBaseMiles;
    const jobAirportWait = job.isFromAirport ? AIRPORT_PICKUP_WAIT_MINUTES : 0;
    const jobEndMs = jobStart.getTime() + (estimateDurationMinutes(job) + jobAirportWait) * 60_000;
    const afterJobMinutes = (reqStart.getTime() + airportWaitMinutes * 60_000 - jobEndMs) / 60_000;
    if (postAligned && afterJobMinutes >= 0 && afterJobMinutes <= settings.maxIdleMinutes && available(request.tripDate, request.tripTime)) {
      if (!fit || afterJobMinutes < fit.idle) fit = { job, idle: afterJobMinutes, direction: "from_parent" };
      continue;
    }
    // Offer the nearest bookable quarter hour on either aligned empty leg.
    // At airports the customer enters flight arrival, before the included wait.
    const windows: { first: number; last: number }[] = [];
    if (preAligned) {
      windows.push({
        first: jobStart.getTime() - settings.maxIdleMinutes * 60_000 - durationMs,
        last: jobStart.getTime() - settings.arrivalBufferMinutes * 60_000 - durationMs,
      });
    }
    if (postAligned) {
      const first = jobEndMs - airportWaitMinutes * 60_000;
      windows.push({ first, last: first + settings.maxIdleMinutes * 60_000 });
    }
    const askedMs = reqStart.getTime();
    for (const { first, last } of windows) {
      const candidates: number[] = [];
      for (let t = Math.ceil(Math.max(first, earliestAllowedMs) / QUARTER_MS) * QUARTER_MS; t <= last; t += QUARTER_MS) {
        if (t !== askedMs) candidates.push(t);
      }
      candidates.sort((a, b) => Math.abs(a - askedMs) - Math.abs(b - askedMs));
      for (const startMs of candidates) {
        const shift = Math.abs(startMs - askedMs);
        if (move && shift >= move.shift) break;
        const suggested = londonParts(startMs);
        if (suggested.date !== request.tripDate || !available(suggested.date, suggested.time)) continue;
        move = { job, startMs, shift };
        break;
      }
    }
  }
  if (fit) return { kind: "fits", job: fit.job, direction: fit.direction };
  if (move) {
    const suggested = londonParts(move.startMs);
    return {
      kind: "move_time",
      job: move.job,
      suggestedTripDate: suggested.date,
      suggestedTripTime: suggested.time,
      direction: move.startMs < reqStart.getTime() ? "earlier" : "later",
    };
  }
  return null;
}

/** Discount the journey fare (airport fees stay full), never below the floor. */
export function discountEmptyRunFare(fare: EmptyRunFare, settings: EmptyRunSettings): EmptyRunFare | null {
  if (!(fare.amountGbp > settings.minFareGbp) || !(fare.journeyFareGbp > 0)) return null;
  const pct = settings.maxDiscountPercent / 100;
  const fixed = Math.max(0, fare.airportFixedCostsGbp);
  // Whole pounds, like the rest of the website fares.
  let journey = Math.round(fare.journeyFareGbp * (1 - pct));
  if (journey + fixed < settings.minFareGbp) journey = Math.ceil(settings.minFareGbp - fixed);
  if (journey >= fare.journeyFareGbp) return null;
  const ratio = journey / fare.journeyFareGbp;
  return {
    amountGbp: round2(journey + fixed),
    journeyFareGbp: journey,
    airportFixedCostsGbp: round2(fixed),
    nightWeekendSurchargeGbp: round2(Math.max(0, fare.nightWeekendSurchargeGbp) * ratio),
  };
}

export function evaluateEmptyRunDiscount(input: {
  request: EmptyRunRequest;
  fare: EmptyRunFare;
  occupied: SmartOccupiedJob[];
  base: SmartCoords;
  settings: EmptyRunSettings;
  now?: Date;
  isTimeAvailable?: (tripDate: string, tripTime: string) => boolean;
}): EmptyRunDecision {
  const { settings } = input;
  if (!settings.enabled) return { applied: false, reason: "EMPTY_RUN_DISABLED" };
  if (input.request.returnJourney) return { applied: false, reason: "EMPTY_RUN_RETURN_JOURNEY" };
  if (!input.request.tripDate || !input.request.tripTime) {
    return { applied: false, reason: "EMPTY_RUN_MISSING_DATA" };
  }
  const match = matchEmptyRun(input);
  if (!match) return { applied: false, reason: "EMPTY_RUN_NO_MATCH" };
  const discounted = discountEmptyRunFare(input.fare, settings);
  if (!discounted) return { applied: false, reason: "EMPTY_RUN_AT_FLOOR", parentJobId: match.job.id };
  const savingGbp = round2(input.fare.amountGbp - discounted.amountGbp);
  if (match.kind === "move_time") {
    // Price stays normal at the asked time; offer the cheaper time alongside it.
    return {
      applied: false,
      reason: "EMPTY_RUN_OFFER_OTHER_TIME",
      parentJobId: match.job.id,
      offer: {
        tripDate: match.suggestedTripDate,
        tripTime: match.suggestedTripTime,
        direction: match.direction,
        estimatedAmountGbp: discounted.amountGbp,
        estimatedSavingGbp: savingGbp,
      },
    };
  }
  return {
    applied: true,
    reason: "EMPTY_RUN_APPLIED",
    parentJobId: match.job.id,
    normalAmountGbp: input.fare.amountGbp,
    savingGbp,
    fare: discounted,
  };
}
