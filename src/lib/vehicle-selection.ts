/**
 * Passenger / luggage → vehicle classification for the public quote form.
 * Monetary rates live in pricing-config.json and are not defined here.
 *
 * Public website (source of truth for customers):
 * - Standard Saloon: 1–4 passengers AND 0–2 suitcases
 * - Estate Car: 1–4 passengers AND 3–4 suitcases
 * - 7 Seater Minibus: 5–7 passengers OR 5+ large bags
 *   (only bookable when Offer 7 Seater Minibus Online is ON)
 *
 * Owner/Driver Quick Quote may still select Minibus (5–7) when public Minibus is OFF.
 *
 * Passenger count of 3 or 4 does NOT by itself trigger Estate.
 * 5+ large bags maps to Minibus and always holds payment for luggage
 * capacity confirmation (see shared/vehicle-capacity.ts). Do not claim an
 * exact physical suitcase maximum on the vehicle card.
 */

import { MINIBUS_VEHICLE_TYPE, VEHICLE_TYPES, type VehicleType } from "./data";
import {
  GROUP_PASSENGER_MAX,
  GROUP_PASSENGER_MIN,
  MAX_PASSENGERS,
  OWNER_QUICK_QUOTE_MAX_PASSENGERS,
} from "../../shared/passenger-limits";
import { vehicleCustomerLabel } from "../../shared/vehicle-display";
import { formatPublicSuitcaseChoice } from "../../shared/vehicle-capacity";

export const SALOON_VEHICLE: VehicleType = "Standard Saloon (1–4 passengers)";
export const ESTATE_VEHICLE: VehicleType = "Estate Car (1–4 passengers)";
export const MINIBUS_VEHICLE: VehicleType = MINIBUS_VEHICLE_TYPE;

/** First passenger count that requires Minibus. */
export const FIVE_PLUS_PASSENGERS = GROUP_PASSENGER_MIN;
/** First suitcase count that requires Minibus. */
export const FIVE_PLUS_SUITCASES = 5;
/** Safe public luggage default. Raised to the 5+ token when public Minibus is ON. */
export const MAX_PUBLIC_SUITCASES = 4;

export { GROUP_PASSENGER_MAX, GROUP_PASSENGER_MIN, MAX_PASSENGERS, OWNER_QUICK_QUOTE_MAX_PASSENGERS };

/**
 * True when the party needs a 7 Seater Minibus.
 * Public quotes allow this only when Offer 7 Seater Minibus Online is ON.
 */
export function requiresMinibus(passengers: number, suitcases: number): boolean {
  return passengers > MAX_PASSENGERS || suitcases > MAX_PUBLIC_SUITCASES;
}

/**
 * Shared vehicle-selection rule used by public quote, Quick Quote, Personal Quote,
 * owner tools, and the quote assistant.
 */
export function selectVehicleForParty(
  passengers: number,
  suitcases: number,
): VehicleType {
  if (requiresMinibus(passengers, suitcases)) {
    return MINIBUS_VEHICLE;
  }
  // Estate only when luggage needs it — not merely because passengers are 3–4.
  if (passengers >= 1 && passengers <= 4 && suitcases >= 3 && suitcases <= 4) {
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
    return vehicleCustomerLabel(MINIBUS_VEHICLE_TYPE);
  }
  if (String(vehicleType).includes("Executive")) {
    return "Executive";
  }
  return String(vehicleType);
}

/** Public passenger selector label. */
export function formatPassengerChoice(count: number): string {
  return String(count);
}

export function formatSuitcaseChoice(count: number): string {
  return formatPublicSuitcaseChoice(count);
}
