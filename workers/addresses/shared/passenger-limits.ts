/**
 * Hard passenger capacity for public quotes and bookings.
 * My Airport Taxi NI public website is 1–4 passengers only
 * (professional private airport transfer — Saloon / Estate).
 *
 * Owner/Driver Quick Quote may still price partner Minibus work up to
 * OWNER_QUICK_QUOTE_MAX_PASSENGERS — that path is not public.
 */

export const MIN_PASSENGERS = 1;
/** Absolute maximum passengers on the public website / public APIs. */
export const MAX_PASSENGERS = 4;
/** Instant fixed-quote path (public). Same as MAX_PASSENGERS. */
export const INSTANT_QUOTE_MAX_PASSENGERS = MAX_PASSENGERS;
/**
 * Owner/Driver Quick Quote Minibus ceiling only — never used for public Live Quote.
 * Kept for partner / subcontract pricing in the owner tool.
 */
export const OWNER_QUICK_QUOTE_MAX_PASSENGERS = 7;

/** @deprecated Public site no longer offers a 5–7 group band. */
export const GROUP_PASSENGER_MIN = 5;
/** @deprecated Public site no longer offers a 5–7 group band. */
export const GROUP_PASSENGER_MAX = OWNER_QUICK_QUOTE_MAX_PASSENGERS;

export const PASSENGER_LIMIT_ERROR =
  "We can only quote for up to 4 passengers. Please select 1–4 passengers.";

export function isValidPassengerCount(value: unknown): value is number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= MIN_PASSENGERS && n <= MAX_PASSENGERS;
}

/** Owner Quick Quote may accept up to OWNER_QUICK_QUOTE_MAX_PASSENGERS for Minibus. */
export function isValidOwnerQuickQuotePassengerCount(value: unknown): value is number {
  const n = typeof value === "number" ? value : Number(value);
  return (
    Number.isInteger(n) &&
    n >= MIN_PASSENGERS &&
    n <= OWNER_QUICK_QUOTE_MAX_PASSENGERS
  );
}

export function clampPassengerCount(value: unknown, fallback = MIN_PASSENGERS): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(MAX_PASSENGERS, Math.max(MIN_PASSENGERS, Math.trunc(n)));
}

/** @deprecated Always false on the public 1–4 capacity model. */
export function isGroupPassengerCount(passengers: number): boolean {
  void passengers;
  return false;
}
