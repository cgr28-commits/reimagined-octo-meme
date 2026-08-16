/**
 * Hard passenger capacity for public quotes and bookings.
 * My Airport Taxi NI does not offer journeys for more than 7 passengers.
 */

export const MIN_PASSENGERS = 1;
/** Absolute maximum passengers accepted online or via API. */
export const MAX_PASSENGERS = 7;
/** Instant fixed-quote path (where eligible). */
export const INSTANT_QUOTE_MAX_PASSENGERS = 4;
/** Tailored larger-vehicle quote band. */
export const GROUP_PASSENGER_MIN = 5;
export const GROUP_PASSENGER_MAX = MAX_PASSENGERS;

export const PASSENGER_LIMIT_ERROR =
  "We can only quote for up to 7 passengers. Please select 1–7 passengers.";

export function isValidPassengerCount(value: unknown): value is number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= MIN_PASSENGERS && n <= MAX_PASSENGERS;
}

export function clampPassengerCount(value: unknown, fallback = MIN_PASSENGERS): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(MAX_PASSENGERS, Math.max(MIN_PASSENGERS, Math.trunc(n)));
}

export function isGroupPassengerCount(passengers: number): boolean {
  return passengers >= GROUP_PASSENGER_MIN && passengers <= GROUP_PASSENGER_MAX;
}
