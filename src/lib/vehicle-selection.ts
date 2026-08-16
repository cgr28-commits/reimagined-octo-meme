/**
 * Passenger / luggage → vehicle classification for the public quote form.
 * Capacities follow the OTS Journey Fares model (saloon / estate / people-carrier).
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
 * Saloon (OTS): up to 3 passengers + 3 large cases (23kg),
 * or 4 passengers with hand luggage only (0 large cases).
 */
export function fitsSaloonCapacity(passengers: number, suitcases: number): boolean {
  if (passengers >= 1 && passengers <= 3 && suitcases >= 0 && suitcases <= 3) {
    return true;
  }
  return passengers === 4 && suitcases === 0;
}

/**
 * Estate (OTS): up to 4 passengers + 4 large cases, when the party does not fit a saloon.
 */
export function fitsEstateCapacity(passengers: number, suitcases: number): boolean {
  if (fitsSaloonCapacity(passengers, suitcases)) {
    return false;
  }
  return passengers >= 1 && passengers <= 4 && suitcases >= 0 && suitcases <= 4;
}

/**
 * True when the party needs a minibus / people carrier
 * (more than 4 passengers or more than 4 large cases).
 * Instant online fares / SumUp must not be offered for these journeys unless approved.
 */
export function requiresMinibus(passengers: number, suitcases: number): boolean {
  return passengers > 4 || suitcases > 4;
}

/**
 * OTS-aligned capacity rules (source of truth):
 * - Minibus if passengers > 4 OR suitcases > 4
 * - Else Saloon if ≤3 pax + ≤3 cases, or 4 pax + hand luggage (0 large cases)
 * - Else Estate if ≤4 pax + ≤4 cases
 */
export function selectVehicleForParty(
  passengers: number,
  suitcases: number,
): VehicleType {
  if (requiresMinibus(passengers, suitcases)) {
    return MINIBUS_VEHICLE;
  }
  if (fitsSaloonCapacity(passengers, suitcases)) {
    return SALOON_VEHICLE;
  }
  return ESTATE_VEHICLE;
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

/** Short capacity blurb for the live “Vehicle for this journey” panel. */
export function vehicleCapacityHint(vehicleType: VehicleType | string): string {
  if (vehicleType === ESTATE_VEHICLE || vehicleType === VEHICLE_TYPES[1]) {
    return "Up to 4 passengers plus 4 large suitcases (23kg). Selected from your party size and luggage.";
  }
  if (vehicleType === SALOON_VEHICLE || vehicleType === VEHICLE_TYPES[0]) {
    return "Up to 3 passengers plus 3 large suitcases, or 4 passengers with hand luggage only.";
  }
  if (vehicleType === MINIBUS_VEHICLE || vehicleType === MINIBUS_VEHICLE_TYPE) {
    return "For more than 4 passengers or more than 4 large suitcases — arranged via licensed partners.";
  }
  return "";
}
