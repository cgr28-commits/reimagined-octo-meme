/**
 * Customer-facing vehicle labels.
 * Internal identifier `Minibus (5–7 passengers)` stays in booking records.
 * Customers see "7 Seater Minibus" — never "minibus" as a raw type.
 */

export const MINIBUS_INTERNAL_TYPE = "Minibus (5–7 passengers)";
export const MINIBUS_CUSTOMER_NAME = "7 Seater Minibus";
export const MINIBUS_CUSTOMER_DESCRIPTION = "Up to 7 passengers";

export const SALOON_CUSTOMER_NAME = "Saloon";
export const SALOON_CUSTOMER_DESCRIPTION = "1–4 passengers";

export const ESTATE_CUSTOMER_NAME = "Estate or similar larger vehicle";
export const ESTATE_CUSTOMER_DESCRIPTION = "Extra luggage space and comfort";

/** Customer label only. Stored bookings stay "Executive Saloon (1–4 passengers)". */
export const EXECUTIVE_CUSTOMER_NAME = "Business Class";
export const EXECUTIVE_CUSTOMER_DESCRIPTION = "Premium executive vehicle";

export function isBusinessClassLabel(vehicleType: string | null | undefined): boolean {
  const value = String(vehicleType ?? "").toLowerCase();
  return value.includes("executive") || value.includes("business class");
}

export function isMinibusVehicleType(vehicleType: string | null | undefined): boolean {
  return String(vehicleType ?? "").toLowerCase().includes("minibus");
}

export function vehicleCustomerLabel(vehicleType: string | null | undefined): string {
  const value = String(vehicleType ?? "");
  if (isMinibusVehicleType(value)) return MINIBUS_CUSTOMER_NAME;
  if (isBusinessClassLabel(value)) return EXECUTIVE_CUSTOMER_NAME;
  if (value.toLowerCase().includes("estate")) return ESTATE_CUSTOMER_NAME;
  if (value.toLowerCase().includes("saloon")) return SALOON_CUSTOMER_NAME;
  return value || "Vehicle";
}

/** Customer confirmation wording. Stored booking type is unchanged. */
export function customerFacingVehicleName(vehicle?: string | null): string {
  const value = String(vehicle ?? "");
  if (!value) return "";
  if (isBusinessClassLabel(value)) return EXECUTIVE_CUSTOMER_NAME;
  if (isMinibusVehicleType(value)) return MINIBUS_CUSTOMER_NAME;
  if (value.toLowerCase().includes("estate")) return ESTATE_CUSTOMER_NAME;
  if (value.toLowerCase().includes("saloon")) return SALOON_CUSTOMER_NAME;
  return value;
}

export function vehicleCustomerDescription(vehicleType: string | null | undefined): string {
  const value = String(vehicleType ?? "");
  if (isBusinessClassLabel(value)) return EXECUTIVE_CUSTOMER_DESCRIPTION;
  if (isMinibusVehicleType(value)) return MINIBUS_CUSTOMER_DESCRIPTION;
  if (value.toLowerCase().includes("estate")) return ESTATE_CUSTOMER_DESCRIPTION;
  if (value.toLowerCase().includes("saloon")) return SALOON_CUSTOMER_DESCRIPTION;
  return value;
}

export function vehicleCustomerFullName(vehicleType: string | null | undefined): string {
  return vehicleCustomerLabel(vehicleType);
}
