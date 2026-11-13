/**
 * Empty Run discount (pre-pickup positioning).
 *
 * When a confirmed job starts far from home (e.g. a Dublin Airport pickup at
 * 17:30 on Sunday), the driver would otherwise drive down empty. A new
 * customer whose journey goes the same way and arrives in time for that
 * pickup fills the empty run, so we can offer them a cheaper fare.
 *
 * Pure function. No KV, no network. The Worker loads the settings and the
 * confirmed jobs and calls this. OFF unless the owner switches it on.
 *
 * Rules
 * - One-way only, same diary (owner car ↔ owner car, Business Class ↔ Business Class).
 * - Customer pickup within `maxPickupFromBaseMiles` of home (the empty run starts at home).
 * - Customer drop-off within `maxDropoffFromParentMiles` of the confirmed job's pickup.
 * - Confirmed job's pickup at least `minParentDistanceMiles` from home (long empty runs only).
 * - Customer must arrive between `maxIdleMinutes` and `arrivalBufferMinutes`
 *   before the confirmed pickup.
 * - Discount applies to the journey fare only (incl. any surcharge). Airport
 *   fees stay full. Total never goes below `minFareGbp`; if the normal fare is
 *   already at or below the floor there is no discount.
 * - Road miles are an estimate (straight line × 1.48), same as Smart Availability.
 */

import {
  coordsFromAirportHint,
  roadMilesEstimate,
  type SmartCoords,
  type SmartOccupiedJob,
} from "./smart-conflict";
import { occupiedJobResource, availabilityResourceForVehicle } from "./availability-resource";
import { parseLondonLocalDateTime } from "./uk-time";

export const EMPTY_RUN_CONFIG_KEY = "smart-ops:empty-run:v1";

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
  | { kind: "fits"; job: SmartOccupiedJob }
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
  if (roadMilesEstimate(base, reqPickup) > settings.maxPickupFromBaseMiles) return null;
  const durationMs = request.durationMinutes * 60_000;
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

  let fit: { job: SmartOccupiedJob; idle: number } | null = null;
  let move: { job: SmartOccupiedJob; startMs: number; shift: number } | null = null;
  for (const job of input.occupied) {
    if (isCancelled(job)) continue;
    if (occupiedJobResource(job) !== reqResource) continue;
    const jobPickup = pointFor(job.pickup, job.pickupLabel, job.isFromAirport ? job.airportCode : null);
    const jobStart = parseLondonLocalDateTime(job.tripDate, job.tripTime);
    if (!jobPickup || !jobStart) continue;
    if (job.tripDate !== request.tripDate) continue;
    if (roadMilesEstimate(base, jobPickup) < settings.minParentDistanceMiles) continue;
    if (roadMilesEstimate(reqDropoff, jobPickup) > settings.maxDropoffFromParentMiles) continue;
    const idleMinutes = (jobStart.getTime() - arrivalMs) / 60_000;
    const askedFits = idleMinutes >= settings.arrivalBufferMinutes && idleMinutes <= settings.maxIdleMinutes;
    if (askedFits && available(request.tripDate, request.tripTime)) {
      if (!fit || idleMinutes < fit.idle) fit = { job, idle: idleMinutes };
      continue;
    }
    // Qualifying pickup window for this job, in quarter hours inside it.
    const latestStart = Math.floor((jobStart.getTime() - settings.arrivalBufferMinutes * 60_000 - durationMs) / QUARTER_MS) * QUARTER_MS;
    const earliestStart = Math.ceil((jobStart.getTime() - settings.maxIdleMinutes * 60_000 - durationMs) / QUARTER_MS) * QUARTER_MS;
    if (latestStart < earliestStart) continue;
    // Walk from the end of the window nearest the asked time to the other end;
    // take the first time that is bookable.
    const askedMs = reqStart.getTime();
    const candidates: number[] = [];
    if (askedMs >= latestStart) {
      for (let t = latestStart; t >= earliestStart; t -= QUARTER_MS) candidates.push(t);
    } else if (askedMs <= earliestStart) {
      for (let t = earliestStart; t <= latestStart; t += QUARTER_MS) candidates.push(t);
    } else {
      // Asked time is inside the window but not bookable: try nearest times either side.
      for (let k = 1; k <= 24; k += 1) {
        const before = Math.floor(askedMs / QUARTER_MS) * QUARTER_MS - (k - 1) * QUARTER_MS;
        const after = Math.ceil(askedMs / QUARTER_MS) * QUARTER_MS + k * QUARTER_MS;
        if (before >= earliestStart && before !== askedMs) candidates.push(before);
        if (after <= latestStart) candidates.push(after);
      }
    }
    for (const startMs of candidates) {
      if (startMs < earliestAllowedMs) continue;
      const suggested = londonParts(startMs);
      if (suggested.date !== request.tripDate) continue;
      if (!available(suggested.date, suggested.time)) continue;
      const shift = Math.abs(startMs - askedMs);
      if (!move || shift < move.shift) move = { job, startMs, shift };
      break;
    }
  }
  if (fit) return { kind: "fits", job: fit.job };
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
