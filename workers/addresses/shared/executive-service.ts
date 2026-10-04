/**
 * Public Executive service — a comfort upgrade, not a larger vehicle.
 * The journey fare is the Saloon fare plus the dashboard Executive upgrade
 * (default £20). Airport and Express charges stay outside that uplift.
 * The enquiry-only Executive Saloon is unchanged.
 *
 * Luggage: Executive takes up to 3 large suitcases. Four large suitcases
 * are not an Executive booking. Estate remains available for 0–4.
 */

export const DEFAULT_EXECUTIVE_UPLIFT_GBP = 20;
/** Missing-config fallback. Customer quotes use the dashboard upgrade. */
export const EXECUTIVE_PREMIUM_GBP = DEFAULT_EXECUTIVE_UPLIFT_GBP;
export const EXECUTIVE_MAX_PASSENGERS = 3;
/** Up to 3 large suitcases. Four or more is not Executive. */
export const EXECUTIVE_MAX_SUITCASES = 3;
export const SALOON_MAX_PASSENGERS = 4;
/** Up to 3 large suitcases. Four large suitcases are not a Saloon booking. */
export const SALOON_MAX_SUITCASES = 3;
export const ESTATE_MAX_PASSENGERS = 4;
export const ESTATE_MAX_SUITCASES = 4;

export const EXECUTIVE_VEHICLE_TYPE = "Executive (up to 3 passengers)" as const;
export const LEGACY_EXECUTIVE_SALOON_TYPE = "Executive Saloon (1–4 passengers)" as const;

export const EXECUTIVE_PASSENGER_LIMIT_MESSAGE =
  "Executive is available for up to 3 passengers.";
export const EXECUTIVE_PASSENGER_LIMIT_SHORT = "Maximum 3 passengers";
export const EXECUTIVE_LUGGAGE_LIMIT_SHORT = "Maximum 3 large suitcases";
export const EXECUTIVE_LUGGAGE_UNAVAILABLE_MESSAGE = "Maximum 3 large suitcases";
export const SALOON_LUGGAGE_UNAVAILABLE_MESSAGE = "Not suitable for your luggage";

export const EXECUTIVE_BENEFITS = [
  "Complimentary bottled water",
  "Phone charging available",
  "Quiet Journey option",
  "Climate preference",
  "Luggage assistance",
  "Premium comfort",
] as const;

export const EXECUTIVE_AIRPORT_PICKUP_BENEFIT = "Flight monitoring for airport pickups";

export type ClimatePreference = "no_preference" | "cooler" | "warmer";

function wholeInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** Instant-pay Executive. The older Executive Saloon enquiry is not this service. */
export function isPremiumExecutiveVehicle(vehicle: string | null | undefined): boolean {
  const value = String(vehicle ?? "");
  return /executive/i.test(value) && !/saloon/i.test(value);
}

export function isLegacyExecutiveSaloon(vehicle: string | null | undefined): boolean {
  const value = String(vehicle ?? "");
  return /executive/i.test(value) && /saloon/i.test(value);
}

/** Saloon: 1–4 passengers and 0–3 large suitcases. */
export function saloonCapacityAllows(passengers: number, suitcases: number): boolean {
  return (
    wholeInRange(passengers, 1, SALOON_MAX_PASSENGERS) &&
    wholeInRange(suitcases, 0, SALOON_MAX_SUITCASES)
  );
}

/**
 * Estate can be chosen whenever a car (not a minibus) can take the party,
 * including a voluntary upgrade when Saloon would also fit.
 */
export function estateCapacityAllows(passengers: number, suitcases: number): boolean {
  return (
    wholeInRange(passengers, 1, ESTATE_MAX_PASSENGERS) &&
    wholeInRange(suitcases, 0, ESTATE_MAX_SUITCASES)
  );
}

/** True when Estate fits and Saloon does not, currently 4 large suitcases. */
export function estateRecommendedForLuggage(passengers: number, suitcases: number): boolean {
  return estateCapacityAllows(passengers, suitcases) && !saloonCapacityAllows(passengers, suitcases);
}

/**
 * Executive: 1–3 passengers and 0–3 large suitcases.
 * 5+ passengers or 5+ bags stay on the existing Minibus rule.
 */
export function executiveAvailableForParty(passengers: number, suitcases: number): boolean {
  return (
    wholeInRange(passengers, 1, EXECUTIVE_MAX_PASSENGERS) &&
    wholeInRange(suitcases, 0, EXECUTIVE_MAX_SUITCASES)
  );
}

/**
 * Why a requested public vehicle cannot be booked for this party.
 * Null means the existing capacity rules allow it. Minibus and the legacy
 * Executive Saloon enquiry are decided elsewhere.
 */
export function publicVehicleEligibilityMessage(
  vehicle: string | null | undefined,
  passengers: number,
  suitcases: number,
): string | null {
  const value = String(vehicle ?? "");
  if (!value || /minibus/i.test(value) || isLegacyExecutiveSaloon(value)) return null;
  if (isPremiumExecutiveVehicle(value)) {
    if (!wholeInRange(passengers, 1, EXECUTIVE_MAX_PASSENGERS)) {
      return EXECUTIVE_PASSENGER_LIMIT_MESSAGE;
    }
    if (!wholeInRange(suitcases, 0, EXECUTIVE_MAX_SUITCASES)) {
      return "Executive is available for up to 3 large suitcases.";
    }
    return null;
  }
  if (/estate/i.test(value)) {
    if (!estateCapacityAllows(passengers, suitcases)) {
      return "Estate is not suitable for this passenger and luggage combination.";
    }
    return null;
  }
  if (/saloon/i.test(value)) {
    if (!saloonCapacityAllows(passengers, suitcases)) {
      return "Saloon is not suitable for your luggage.";
    }
    return null;
  }
  return null;
}

export function parseClimatePreference(value: unknown): ClimatePreference | null {
  if (value === "no_preference" || value === "cooler" || value === "warmer") return value;
  return null;
}

export function climatePreferenceLabel(value: ClimatePreference | null | undefined): string {
  if (value === "cooler") return "Cooler";
  if (value === "warmer") return "Warmer";
  return "No preference";
}

/** Persist cabin preferences only on an Executive booking. */
export function executivePreferenceFields(input: {
  vehicle?: string | null;
  quietJourney?: unknown;
  climatePreference?: unknown;
}): { quietJourney?: boolean; climatePreference?: ClimatePreference } {
  if (!isPremiumExecutiveVehicle(input.vehicle)) return {};
  return {
    quietJourney: input.quietJourney === true,
    climatePreference: parseClimatePreference(input.climatePreference) ?? "no_preference",
  };
}

export function formatExecutivePreferenceLines(input: {
  vehicle?: string | null;
  quietJourney?: boolean | null;
  climatePreference?: ClimatePreference | string | null;
}): string[] {
  if (!isPremiumExecutiveVehicle(input.vehicle)) return [];
  const climate = parseClimatePreference(input.climatePreference);
  return [
    `Quiet Journey: ${input.quietJourney === true ? "Yes" : "No"}`,
    `Climate preference: ${climatePreferenceLabel(climate)}`,
  ];
}
