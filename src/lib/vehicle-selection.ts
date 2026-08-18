/**
 * Passenger / luggage → vehicle classification for the public quote form.
 * Monetary rates live in pricing-config.json and are not defined here.
 */

import { MINIBUS_VEHICLE_TYPE, VEHICLE_TYPES, type VehicleType } from "./data";
import {
  GROUP_PASSENGER_MAX,
  GROUP_PASSENGER_MIN,
  MAX_PASSENGERS,
} from "../../shared/passenger-limits";

export const SALOON_VEHICLE: VehicleType = "Standard Saloon (1–4 passengers)";
export const ESTATE_VEHICLE: VehicleType = "Estate Car (1–4 passengers)";
export const MINIBUS_VEHICLE: VehicleType = MINIBUS_VEHICLE_TYPE;

/** Sentinel value for the “5–7” tap on the quote form. */
export const FIVE_PLUS_PASSENGERS = GROUP_PASSENGER_MIN;
export const FIVE_PLUS_SUITCASES = 5;

export { GROUP_PASSENGER_MAX, GROUP_PASSENGER_MIN, MAX_PASSENGERS };

/**
 * True when the party needs a Minibus (more than 4 passengers or more than 4 large cases).
 * Minibus uses existing pricing and is bookable online via SumUp.
 */
export function requiresMinibus(passengers: number, suitcases: number): boolean {
  return passengers > 4 || suitcases > 4;
}

/**
 * Business rules (source of truth):
 * - Larger vehicle if passengers > 4 OR suitcases > 4
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

/** Main passenger selector label (1–4 or the 5–7 band). */
export function formatPassengerChoice(count: number): string {
  return count >= FIVE_PLUS_PASSENGERS ? "5–7" : String(count);
}

export function formatSuitcaseChoice(count: number): string {
  return count >= FIVE_PLUS_SUITCASES ? "5+" : String(count);
}
