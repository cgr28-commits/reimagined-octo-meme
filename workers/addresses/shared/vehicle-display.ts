/**
 * Customer-facing vehicle labels.
 * Internal identifier `Minibus (5–7 passengers)` stays in booking records.
 * Customers see "7 Seater Minibus" — never "minibus" as a raw type.
 */

export const MINIBUS_INTERNAL_TYPE = "Minibus (5–7 passengers)";
export const MINIBUS_CUSTOMER_NAME = "7 Seater Minibus";
export const MINIBUS_CUSTOMER_DESCRIPTION = "Up to 7 passengers";

export function isMinibusVehicleType(vehicleType: string | null | undefined): boolean {
  return String(vehicleType ?? "").toLowerCase().includes("minibus");
}

export function vehicleCustomerLabel(vehicleType: string | null | undefined): string {
  const value = String(vehicleType ?? "");
  if (isMinibusVehicleType(value)) return MINIBUS_CUSTOMER_NAME;
  if (value.includes("Estate")) return "Estate";
  if (value.includes("Executive")) return "Executive";
  if (value.includes("Saloon")) return "Saloon";
  return value || "Vehicle";
}

export function vehicleCustomerFullName(vehicleType: string | null | undefined): string {
  const value = String(vehicleType ?? "");
  if (isMinibusVehicleType(value)) return MINIBUS_CUSTOMER_NAME;
  if (value.includes("Estate")) return "Estate Car";
  if (value.includes("Executive")) return "Executive Saloon";
  if (value.includes("Saloon")) return "Saloon";
  return value || "Vehicle";
}
