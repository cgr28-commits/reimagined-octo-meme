/**
 * Two booking resources share the Smart Availability engine.
 * Saloon and Estate stay on the owner diary. Executive and the 7-Seater
 * each have their own diary. An unrecognised vehicle stays on the owner diary.
 * A booking is Minibus only when its vehicle string is a recognised Minibus type.
 */

import { isExecutiveVehicle } from "./executive-vehicle";
import { isPublicMinibusVehicle } from "./owner-pricing-config";

export type AvailabilityResource = "owner" | "minibus" | "executive";

export const MINIBUS_NOTICE_HEADING = "7-Seater availability confirmation required";

export const MINIBUS_NOTICE_BODY =
  "Bookings inside this period need confirmation before payment. We will email you a secure payment link if the 7-Seater is available. No payment is taken until then.";

export const MINIBUS_NOTICE_CTA = "Request 7-Seater Availability";

export const MINIBUS_RESOURCE_UNAVAILABLE_MESSAGE =
  "The 7-Seater is not available at that time.";

export function availabilityResourceForVehicle(
  vehicle: string | null | undefined,
): AvailabilityResource {
  if (isPublicMinibusVehicle(vehicle)) return "minibus";
  if (isExecutiveVehicle(vehicle)) return "executive";
  return "owner";
}

export function occupiedJobResource(job: {
  resource?: string | null;
  vehicle?: string | null;
}): AvailabilityResource {
  if (isExecutiveVehicle(job.vehicle) || job.resource === "executive") return "executive";
  if (isPublicMinibusVehicle(job.vehicle) || job.resource === "minibus") return "minibus";
  return "owner";
}

export function filterOccupiedJobsForResource<
  T extends { resource?: string | null; vehicle?: string | null },
>(jobs: T[] | null | undefined, resource: AvailabilityResource): T[] {
  return (jobs || []).filter((job) => occupiedJobResource(job) === resource);
}

export function unavailablePeriodResource(period: {
  resource?: string | null;
}): AvailabilityResource {
  if (period.resource === "minibus") return "minibus";
  if (period.resource === "executive") return "executive";
  return "owner";
}

export function filterUnavailablePeriodsForResource<
  T extends { resource?: string | null },
>(periods: T[] | null | undefined, resource: AvailabilityResource): T[] {
  return (periods || []).filter((period) => unavailablePeriodResource(period) === resource);
}
