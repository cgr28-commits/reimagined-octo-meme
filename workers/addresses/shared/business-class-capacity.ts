import { BUSINESS_CLASS_MAX_PASSENGERS } from "./passenger-limits";
import { isExecutiveVehicle } from "./executive-vehicle";

/** Shared booking/quote guard. Internal legacy vehicle identifiers stay unchanged. */
export function businessClassPassengerLimitError(vehicle: string | null | undefined, passengers: unknown): string | null {
  return isExecutiveVehicle(vehicle) && Number(passengers) > BUSINESS_CLASS_MAX_PASSENGERS
    ? `Business Class accommodates up to ${BUSINESS_CLASS_MAX_PASSENGERS} passengers. Please choose another vehicle.`
    : null;
}
