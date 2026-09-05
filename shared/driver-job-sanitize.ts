/**
 * Whitelist sanitisation for driver-facing job payloads.
 * Owner responses must not use this — they keep full financial/admin fields.
 */

import { formatPartialRegistration } from "./partial-registration";

/** Fields a driver may receive for journey ops, contact, tracking, assignment, and their pay. */
export const DRIVER_JOB_WHITELIST = [
  "token",
  "customerName",
  "customerMobile",
  "pickupLabel",
  "dropoffLabel",
  "tripDate",
  "tripTime",
  "pickupAt",
  "returnJourney",
  "returnDate",
  "returnTime",
  "bookingReference",
  "flightNumber",
  "airportCode",
  "airportAccessOption",
  "dublinArrivalTerminal",
  "isAirportTrip",
  "isFromAirport",
  "isAirportPickup",
  "flight",
  "notes",
  "instructions",
  "message",
  "driverPayAmount",
  "assignedDriverName",
  "assignedDriverMobile",
  "assignedDriverCarMake",
  "assignedDriverCarModel",
  "assignedDriverCarColour",
  "assignedDriverReg",
  "assignedDriverRegPartial",
  "assignmentStatus",
  "assignedAt",
  "acceptedAt",
  "declinedAt",
  "journeyStatus",
  "journeyStatusLabel",
  "allowedJourneyActions",
  "sharingActive",
  "trackUrl",
  "trackingWindow",
  "trackingStartedAt",
  "arrivedPickupAt",
  "journeyStartedAt",
  "arrivedDestinationAt",
  "journeyCompletedAt",
  "trackingStoppedAt",
  "driver",
  "customer",
  "pickup",
  "dropoff",
  "activeDriverName",
  "bookingStatus",
  "createdAt",
  "updatedAt",
  "onTheWayNotificationStatus",
  "arrivalNotificationStatus",
] as const;

export type DriverJobWhitelistKey = (typeof DRIVER_JOB_WHITELIST)[number];

const DRIVER_JOB_WHITELIST_SET = new Set<string>(DRIVER_JOB_WHITELIST);

/** Financial / admin fields that must never appear in driver JSON. */
export const DRIVER_FORBIDDEN_FINANCIAL_KEYS = [
  "amountPaidLabel",
  "refundAmountLabel",
  "paymentReference",
  "quotedPrice",
  "amountPaid",
  "amountRefunded",
  "sumupCheckoutId",
  "checkoutId",
  "refundId",
  "refundStatus",
  "paymentStatus",
  "ownerMargin",
  "profit",
  "margin",
  "financialSummary",
  "attribution",
  "customerEmail",
  "driverLocationPointCount",
  "driverLocationRecordedFrom",
  "driverLocationRecordedTo",
] as const;

/**
 * Whitelist-only copy for driver role. Prefer this over denylist deletes.
 * Also attaches assignedDriverRegPartial when a full registration snapshot exists.
 *
 * Customer mobile is only included after the driver has accepted the job
 * (`includeCustomerMobile: true`). Pending drivers do not receive it.
 */
export function sanitizeJobForDriver<T extends Record<string, unknown>>(
  job: T,
  options?: { includeCustomerMobile?: boolean },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(job)) {
    if (!DRIVER_JOB_WHITELIST_SET.has(key)) {
      continue;
    }
    out[key] = job[key];
  }

  if (!options?.includeCustomerMobile) {
    delete out.customerMobile;
  }

  const fullReg =
    typeof out.assignedDriverReg === "string" ? out.assignedDriverReg : "";
  if (fullReg.trim()) {
    out.assignedDriverRegPartial = formatPartialRegistration(fullReg);
  }

  // Drivers keep the full reg for their own vehicle ops on accepted jobs, but
  // customer-facing helpers must use assignedDriverRegPartial only.
  return out;
}

export function sanitizeDriverJobForRole<T extends Record<string, unknown>>(
  job: T,
  role: "owner" | "driver",
  options?: { includeCustomerMobile?: boolean },
): T | Record<string, unknown> {
  if (role === "owner") {
    return job;
  }
  return sanitizeJobForDriver(job, options);
}

export function assertNoDriverForbiddenFields(job: Record<string, unknown>): string[] {
  return DRIVER_FORBIDDEN_FINANCIAL_KEYS.filter((key) => key in job && job[key] != null && job[key] !== "");
}
