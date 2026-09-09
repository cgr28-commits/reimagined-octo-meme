import { withBasePath } from "@/lib/paths";
import { ESTATE_VEHICLE, vehicleShortLabel } from "@/lib/vehicle-selection";

/** Presentational only — follows the already-chosen quote vehicle. */
export const QUOTE_SALOON_IMAGE = withBasePath("/images/vehicles/quote-saloon.webp");
export const QUOTE_ESTATE_IMAGE = withBasePath("/images/vehicles/quote-estate.webp");

export const QUOTE_VEHICLE_IMAGES = [QUOTE_SALOON_IMAGE, QUOTE_ESTATE_IMAGE] as const;

export function isQuoteShowcaseEstate(vehicleType: string): boolean {
  return vehicleType === ESTATE_VEHICLE || vehicleShortLabel(vehicleType) === "Estate";
}

export function quoteVehicleImageSrc(vehicleType: string): string | null {
  const label = vehicleShortLabel(vehicleType);
  if (label === "Estate") return QUOTE_ESTATE_IMAGE;
  if (label === "Saloon") return QUOTE_SALOON_IMAGE;
  return null;
}
