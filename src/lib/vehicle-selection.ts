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
import { isExecutiveVehicle } from "../../shared/executive-vehicle";
import {
  ESTATE_CUSTOMER_NAME,
  EXECUTIVE_CUSTOMER_NAME,
  SALOON_CUSTOMER_NAME,
  vehicleCustomerLabel,
} from "../../shared/vehicle-display";
import { formatPublicSuitcaseChoice } from "../../shared/vehicle-capacity";

export const SALOON_VEHICLE: VehicleType = "Standard Saloon (1–4 passengers)";
export const ESTATE_VEHICLE: VehicleType = "Estate Car (1–4 passengers)";
export const EXECUTIVE_VEHICLE: VehicleType = "Executive Saloon (1–4 passengers)";
export const MINIBUS_VEHICLE: VehicleType = MINIBUS_VEHICLE_TYPE;

/** Map a customer or stored vehicle string onto the canonical bookable type. */
export function canonicalVehicleType(raw: string | null | undefined): VehicleType {
  const value = String(raw ?? "");
  if (isExecutiveVehicle(value)) return EXECUTIVE_VEHICLE;
  if (/minibus/i.test(value)) return MINIBUS_VEHICLE;
  if (/estate/i.test(value)) return ESTATE_VEHICLE;
  return SALOON_VEHICLE;
}

/** Saloon and Business Class share saloon luggage room. Estate covers up to 4 large cases. */
export const SALOON_MAX_LARGE_SUITCASES = 2;
export const ESTATE_MAX_LARGE_SUITCASES = 4;

export const BUSINESS_CLASS_UNAVAILABLE_ONLINE_MESSAGE =
  "Business Class is not available to book online.";

export const VEHICLE_UNSUITABLE_MESSAGE =
  "That vehicle cannot accommodate this passenger and luggage combination. Please choose a suitable vehicle.";

/**
 * Physical fit only. Saloon and Business Class: 1–4 passengers and 0–2 large suitcases.
 * Estate: 1–4 passengers and up to 4 large suitcases. Minibus: up to 7 passengers.
 */
export function vehicleFitsParty(
  vehicle: string,
  passengers: number,
  suitcases: number,
): boolean {
  const pax = Math.floor(Number(passengers));
  const bags = Math.floor(Number(suitcases));
  if (!Number.isFinite(pax) || !Number.isFinite(bags) || pax < 1 || bags < 0) return false;
  const canonical = canonicalVehicleType(vehicle);
  if (canonical === MINIBUS_VEHICLE) return pax <= GROUP_PASSENGER_MAX;
  if (pax > MAX_PASSENGERS || bags > ESTATE_MAX_LARGE_SUITCASES) return false;
  if (canonical === ESTATE_VEHICLE) return true;
  return bags <= SALOON_MAX_LARGE_SUITCASES;
}

export function suitableVehicleTypesForParty(
  passengers: number,
  suitcases: number,
  options?: { publicMinibusEnabled?: boolean; publicExecutiveEnabled?: boolean },
): VehicleType[] {
  const publicMinibusEnabled = options?.publicMinibusEnabled === true;
  const publicExecutiveEnabled = options?.publicExecutiveEnabled !== false;
  const candidates: VehicleType[] = [
    SALOON_VEHICLE,
    ESTATE_VEHICLE,
    EXECUTIVE_VEHICLE,
    MINIBUS_VEHICLE,
  ];
  return candidates.filter((vehicle) => {
    if (vehicle === MINIBUS_VEHICLE && !publicMinibusEnabled) return false;
    if (vehicle === EXECUTIVE_VEHICLE && !publicExecutiveEnabled) return false;
    return vehicleFitsParty(vehicle, passengers, suitcases);
  });
}

export function resolvePublicVehicleChoice(input: {
  requested?: string | null;
  passengers: number;
  suitcases: number;
  publicMinibusEnabled?: boolean;
  publicExecutiveEnabled?: boolean;
  ownerMode?: boolean;
}): { ok: true; vehicleType: VehicleType } | { ok: false; message: string } {
  const pax = Math.floor(Number(input.passengers));
  const bags = Math.max(0, Math.floor(Number(input.suitcases)));
  const requested = String(input.requested ?? "").trim();
  const publicMinibusEnabled = input.publicMinibusEnabled === true;
  const publicExecutiveEnabled = input.publicExecutiveEnabled !== false;

  if (input.ownerMode === true) {
    if (isExecutiveVehicle(requested)) return { ok: true, vehicleType: EXECUTIVE_VEHICLE };
    if (/minibus/i.test(requested)) return { ok: true, vehicleType: MINIBUS_VEHICLE };
    if (/estate/i.test(requested)) return { ok: true, vehicleType: ESTATE_VEHICLE };
    if (/saloon/i.test(requested)) {
      if (requiresMinibus(pax, bags)) return { ok: true, vehicleType: MINIBUS_VEHICLE };
      return { ok: true, vehicleType: SALOON_VEHICLE };
    }
    return { ok: true, vehicleType: selectVehicleForParty(pax, bags) };
  }

  if (requiresMinibus(pax, bags)) {
    return { ok: true, vehicleType: MINIBUS_VEHICLE };
  }

  if (!requested) {
    return { ok: true, vehicleType: selectVehicleForParty(pax, bags) };
  }

  if (isExecutiveVehicle(requested)) {
    if (!publicExecutiveEnabled) {
      return { ok: false, message: BUSINESS_CLASS_UNAVAILABLE_ONLINE_MESSAGE };
    }
    if (!vehicleFitsParty(EXECUTIVE_VEHICLE, pax, bags)) {
      return { ok: false, message: VEHICLE_UNSUITABLE_MESSAGE };
    }
    return { ok: true, vehicleType: EXECUTIVE_VEHICLE };
  }

  if (/minibus/i.test(requested)) {
    if (!publicMinibusEnabled) {
      return { ok: false, message: "7 Seater Minibus is not available to book online." };
    }
    if (!vehicleFitsParty(MINIBUS_VEHICLE, pax, bags)) {
      return { ok: false, message: VEHICLE_UNSUITABLE_MESSAGE };
    }
    return { ok: true, vehicleType: MINIBUS_VEHICLE };
  }

  if (/estate/i.test(requested)) {
    if (!vehicleFitsParty(ESTATE_VEHICLE, pax, bags)) {
      return { ok: false, message: VEHICLE_UNSUITABLE_MESSAGE };
    }
    return { ok: true, vehicleType: ESTATE_VEHICLE };
  }

  if (/saloon/i.test(requested)) {
    if (!vehicleFitsParty(SALOON_VEHICLE, pax, bags)) {
      return { ok: false, message: VEHICLE_UNSUITABLE_MESSAGE };
    }
    return { ok: true, vehicleType: SALOON_VEHICLE };
  }

  return { ok: true, vehicleType: selectVehicleForParty(pax, bags) };
}

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
  if (isExecutiveVehicle(String(vehicleType))) return EXECUTIVE_CUSTOMER_NAME;
  if (vehicleType === ESTATE_VEHICLE || vehicleType === VEHICLE_TYPES[1] || /estate/i.test(String(vehicleType))) {
    return ESTATE_CUSTOMER_NAME;
  }
  if (vehicleType === SALOON_VEHICLE || vehicleType === VEHICLE_TYPES[0] || /saloon/i.test(String(vehicleType))) {
    return SALOON_CUSTOMER_NAME;
  }
  if (vehicleType === MINIBUS_VEHICLE || vehicleType === MINIBUS_VEHICLE_TYPE) {
    return vehicleCustomerLabel(MINIBUS_VEHICLE_TYPE);
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
