/**
 * Public passenger / luggage ceilings.
 *
 * Safe defaults (missing or corrupt pricing config, or public 7 Seater OFF):
 *   passengers 1–4, large bags 0–4.
 *
 * When the server-authoritative “Offer 7 Seater Minibus Online” setting is ON:
 *   passengers 1–7, large bags 0–7.
 *
 * MAX_PASSENGERS / MAX_SUITCASES stay at 4 so fail-closed paths never expand.
 * Owner/Driver Quick Quote may still price partner Minibus work up to
 * OWNER_QUICK_QUOTE_MAX_PASSENGERS — that path is not public.
 */

export const MIN_PASSENGERS = 1;
/** Safe public default. Raised to 7 only when public Minibus is explicitly ON. */
export const MAX_PASSENGERS = 4;
/** Instant fixed-quote path (public). Same as MAX_PASSENGERS. */
export const INSTANT_QUOTE_MAX_PASSENGERS = MAX_PASSENGERS;
/**
 * Owner/Driver Quick Quote Minibus ceiling, and the public ceiling when
 * Offer 7 Seater Minibus Online is ON.
 */
export const OWNER_QUICK_QUOTE_MAX_PASSENGERS = 7;

export const MIN_SUITCASES = 0;
/** Safe public default. Raised to 7 only when public Minibus is explicitly ON. */
export const MAX_SUITCASES = 4;
export const OWNER_QUICK_QUOTE_MAX_SUITCASES = 7;

/** @deprecated Public 5–7 band is gated by public Minibus ON, not a separate form. */
export const GROUP_PASSENGER_MIN = 5;
/** @deprecated Prefer OWNER_QUICK_QUOTE_MAX_PASSENGERS. */
export const GROUP_PASSENGER_MAX = OWNER_QUICK_QUOTE_MAX_PASSENGERS;

export const PASSENGER_LIMIT_ERROR =
  "We can only quote for up to 4 passengers. Please select 1–4 passengers.";
export const SUITCASE_LIMIT_ERROR =
  "We can only quote for up to 4 large suitcases. Please select 0–4.";
export const PUBLIC_MINIBUS_PASSENGER_LIMIT_ERROR =
  "We can only quote for up to 7 passengers.";
export const PUBLIC_MINIBUS_SUITCASE_LIMIT_ERROR =
  "We can only quote for up to 7 large suitcases.";

export function isValidPassengerCount(value: unknown): value is number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= MIN_PASSENGERS && n <= MAX_PASSENGERS;
}

/** Absolute vehicle capacity (1–7). Public availability is enforced separately. */
export function isValidCapacityPassengerCount(value: unknown): value is number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= MIN_PASSENGERS && n <= OWNER_QUICK_QUOTE_MAX_PASSENGERS;
}

export function isValidPublicPassengerCount(
  value: unknown,
  publicMinibusEnabled: boolean,
): value is number {
  const n = typeof value === "number" ? value : Number(value);
  const max = publicMinibusEnabled === true ? OWNER_QUICK_QUOTE_MAX_PASSENGERS : MAX_PASSENGERS;
  return Number.isInteger(n) && n >= MIN_PASSENGERS && n <= max;
}

export function isValidPublicSuitcaseCount(
  value: unknown,
  publicMinibusEnabled: boolean,
): value is number {
  const n = typeof value === "number" ? value : Number(value);
  const max = publicMinibusEnabled === true ? OWNER_QUICK_QUOTE_MAX_SUITCASES : MAX_SUITCASES;
  return Number.isInteger(n) && n >= MIN_SUITCASES && n <= max;
}

/** Absolute suitcase capacity (0–7). Public availability is enforced separately. */
export function isValidCapacitySuitcaseCount(value: unknown): value is number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= MIN_SUITCASES && n <= OWNER_QUICK_QUOTE_MAX_SUITCASES;
}

export function publicPassengerLimitMessage(publicMinibusEnabled: boolean): string {
  return publicMinibusEnabled === true
    ? PUBLIC_MINIBUS_PASSENGER_LIMIT_ERROR
    : PASSENGER_LIMIT_ERROR;
}

export function publicSuitcaseLimitMessage(publicMinibusEnabled: boolean): string {
  return publicMinibusEnabled === true
    ? PUBLIC_MINIBUS_SUITCASE_LIMIT_ERROR
    : SUITCASE_LIMIT_ERROR;
}

export function publicPassengerCapacityCopy(publicMinibusEnabled: boolean): string {
  return publicMinibusEnabled === true
    ? "Private airport transfers for up to 7 passengers."
    : "Private airport transfer for 1–4 passengers.";
}

export function publicPassengerOptions(publicMinibusEnabled: boolean): number[] {
  const max = publicMinibusEnabled === true ? OWNER_QUICK_QUOTE_MAX_PASSENGERS : MAX_PASSENGERS;
  return Array.from({ length: max }, (_, index) => index + 1);
}

export function publicSuitcaseOptions(publicMinibusEnabled: boolean): number[] {
  const max = publicMinibusEnabled === true ? OWNER_QUICK_QUOTE_MAX_SUITCASES : MAX_SUITCASES;
  return Array.from({ length: max + 1 }, (_, index) => index);
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
