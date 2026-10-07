/**
 * Customer-facing vehicle labels.
 * Internal identifier `Minibus (5–7 passengers)` stays in booking records.
 * Customers see "7 Seater Minibus" — never "minibus" as a raw type.
 */

export const MINIBUS_INTERNAL_TYPE = "Minibus (5–7 passengers)";
export const MINIBUS_CUSTOMER_NAME = "7 Seater Minibus";
export const MINIBUS_CUSTOMER_DESCRIPTION = "Up to 7 passengers";

/** Customer label only. Stored bookings stay "Executive Saloon (1–4 passengers)". */
export const EXECUTIVE_CUSTOMER_NAME = "Executive — Mercedes-Benz C-Class or similar";
export const EXECUTIVE_CUSTOMER_DESCRIPTION = "Premium executive vehicle";

export function isMinibusVehicleType(vehicleType: string | null | undefined): boolean {
  return String(vehicleType ?? "").toLowerCase().includes("minibus");
}

export function vehicleCustomerLabel(vehicleType: string | null | undefined): string {
  const value = String(vehicleType ?? "");
  if (isMinibusVehicleType(value)) return MINIBUS_CUSTOMER_NAME;
  if (value.includes("Estate")) return "Estate";
  if (value.toLowerCase().includes("executive")) return EXECUTIVE_CUSTOMER_NAME;
  if (value.includes("Saloon")) return "Saloon";
  return value || "Vehicle";
}

/** Customer confirmation wording. Stored booking type is unchanged. */
export function customerFacingVehicleName(vehicle?: string | null): string {
  const value = String(vehicle ?? "");
  if (value.toLowerCase().includes("executive")) return EXECUTIVE_CUSTOMER_NAME;
  return value;
}

export function vehicleCustomerFullName(vehicleType: string | null | undefined): string {
  const value = String(vehicleType ?? "");
  if (isMinibusVehicleType(value)) return MINIBUS_CUSTOMER_NAME;
  if (value.includes("Estate")) return "Estate Car";
  if (value.toLowerCase().includes("executive")) return EXECUTIVE_CUSTOMER_NAME;
  if (value.includes("Saloon")) return "Saloon";
  return value || "Vehicle";
}
