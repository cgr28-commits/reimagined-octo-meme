/**
 * Two booking resources share the Smart Availability engine.
 * Owner-operated vehicles (Saloon, Estate, Executive, and any unrecognised type)
 * stay on the existing diary. The 7-Seater is a separate subcontract resource.
 * A booking is Minibus only when its vehicle string is a recognised Minibus type.
 */

import { isPublicMinibusVehicle } from "./owner-pricing-config";

export type AvailabilityResource = "owner" | "minibus";

export const MINIBUS_NOTICE_HEADING = "7-Seater availability confirmation required";

export const MINIBUS_NOTICE_BODY =
  "Bookings inside this period need confirmation before payment. We will email you a secure payment link if the 7-Seater is available. No payment is taken until then.";

export const MINIBUS_NOTICE_CTA = "Request 7-Seater Availability";

export const MINIBUS_RESOURCE_UNAVAILABLE_MESSAGE =
  "The 7-Seater is not available at that time.";

export function availabilityResourceForVehicle(
  vehicle: string | null | undefined,
): AvailabilityResource {
  return isPublicMinibusVehicle(vehicle) ? "minibus" : "owner";
}

export function occupiedJobResource(job: {
  resource?: string | null;
  vehicle?: string | null;
}): AvailabilityResource {
  if (job.resource === "minibus") return "minibus";
  if (job.resource === "owner") return "owner";
  return availabilityResourceForVehicle(job.vehicle);
}

export function filterOccupiedJobsForResource<
  T extends { resource?: string | null; vehicle?: string | null },
>(jobs: T[] | null | undefined, resource: AvailabilityResource): T[] {
  return (jobs || []).filter((job) => occupiedJobResource(job) === resource);
}

export function unavailablePeriodResource(period: {
  resource?: string | null;
}): AvailabilityResource {
  return period.resource === "minibus" ? "minibus" : "owner";
}

export function filterUnavailablePeriodsForResource<
  T extends { resource?: string | null },
>(periods: T[] | null | undefined, resource: AvailabilityResource): T[] {
  return (periods || []).filter((period) => unavailablePeriodResource(period) === resource);
}
