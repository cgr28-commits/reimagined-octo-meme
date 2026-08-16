/**
 * Passenger / luggage → vehicle classification for the public quote form.
 * Monetary rates live in pricing-config.json and are not defined here.
 */

import { MINIBUS_VEHICLE_TYPE, VEHICLE_TYPES, type VehicleType } from "@/lib/data";

export const SALOON_VEHICLE: VehicleType = "Standard Saloon (1–4 passengers)";
export const ESTATE_VEHICLE: VehicleType = "Estate Car (1–4 passengers)";
export const MINIBUS_VEHICLE: VehicleType = MINIBUS_VEHICLE_TYPE;

/** Sentinel values for “5+” taps on the quote form. */
export const FIVE_PLUS_PASSENGERS = 5;
export const FIVE_PLUS_SUITCASES = 5;

/**
 * True when the party needs a minibus (more than 4 passengers or more than 4 large cases).
 * Instant online fares / SumUp must not be offered for these journeys unless approved.
 */
export function requiresMinibus(passengers: number, suitcases: number): boolean {
  return passengers > 4 || suitcases > 4;
}

/**
 * Business rules (source of truth):
 * - Minibus if passengers > 4 OR suitcases > 4
 * - Else Estate if passengers 3–4 OR suitcases 3–4 (and still ≤4 / ≤4)
 * - Else Saloon when passengers 1–2 AND suitcases 0–2
 */
export function selectVehicleForParty(
  passengers: number,
  suitcases: number,
): VehicleType {
  if (requiresMinibus(passengers, suitcases)) {
    return MINIBUS_VEHICLE;
  }
  if (passengers >= 3 || suitcases >= 3) {
    return ESTATE_VEHICLE;
  }
  return SALOON_VEHICLE;
}

export function vehicleShortLabel(vehicleType: VehicleType | string): string {
  if (vehicleType === ESTATE_VEHICLE || vehicleType === VEHICLE_TYPES[1]) {
    return "Estate";
  }
  if (vehicleType === SALOON_VEHICLE || vehicleType === VEHICLE_TYPES[0]) {
    return "Saloon";
  }
  if (vehicleType === MINIBUS_VEHICLE || vehicleType === MINIBUS_VEHICLE_TYPE) {
    return "Minibus";
  }
  if (String(vehicleType).includes("Executive")) {
    return "Executive";
  }
  return String(vehicleType);
}

export function formatPassengerChoice(count: number): string {
  return count >= FIVE_PLUS_PASSENGERS ? "5+" : String(count);
}

export function formatSuitcaseChoice(count: number): string {
  return count >= FIVE_PLUS_SUITCASES ? "5+" : String(count);
}
