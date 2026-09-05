/**
 * Canonical paid-booking → email/receipt mapping.
 *
 * After finalize, PaidBookingRecord (KV `booking:ref:{ref}`) is the single
 * authoritative current journey. Never prefer pending-checkout.booking for
 * confirmation content — that snapshot is frozen at payment time and becomes
 * stale after amendments.
 */

import type {
  PaidBookingDetails,
  PaidBookingReceipt,
} from "./booking-notifications";
import type { PaidBookingRecord } from "./paid-booking-record";

/** Build journey/contact details strictly from the canonical paid booking record. */
export function paidBookingRecordToDetails(record: PaidBookingRecord): PaidBookingDetails {
  return {
    customerName: record.customerName,
    customerEmail: record.customerEmail,
    mobileNumber: record.mobileNumber,
    tripLabel: record.tripLabel,
    pickupLabel: record.pickupLabel,
    dropoffLabel: record.dropoffLabel,
    returnJourney: Boolean(record.returnJourney),
    tripDate: record.tripDate,
    tripTime: record.tripTime,
    returnDate: record.returnDate ?? "",
    returnTime: record.returnTime ?? "",
    flightNumber: record.flightNumber ?? "",
    returnFlightNumber: record.returnFlightNumber ?? "",
    passengers: record.passengers ?? 1,
    suitcases: record.suitcases ?? 0,
    vehicle: record.vehicle ?? "Saloon",
    journeyDistance: record.journeyDistance,
    journeyDuration: record.journeyDuration,
    isAirportTrip:
      record.isAirportTrip ??
      /airport/i.test(`${record.tripLabel} ${record.pickupLabel} ${record.dropoffLabel}`),
    airportCode: record.airportCode,
    isFromAirport: record.isFromAirport,
    ...(typeof record.expressDropOffSelected === "boolean"
      ? { expressDropOffSelected: record.expressDropOffSelected }
      : {}),
    ...(typeof record.expressDropOffFee === "number"
      ? { expressDropOffFee: record.expressDropOffFee }
      : {}),
    ...(record.expressDropOffAirport === "BFS" ||
    record.expressDropOffAirport === "BHD" ||
    record.expressDropOffAirport === null
      ? { expressDropOffAirport: record.expressDropOffAirport }
      : {}),
    ...(record.airportAccessOption === "express" ||
    record.airportAccessOption === "free" ||
    record.airportAccessOption === null
      ? { airportAccessOption: record.airportAccessOption }
      : {}),
    ...(record.dublinArrivalTerminal === "T1" ||
    record.dublinArrivalTerminal === "T2" ||
    record.dublinArrivalTerminal === null
      ? { dublinArrivalTerminal: record.dublinArrivalTerminal }
      : {}),
    termsAcceptedAt: record.termsAcceptedAt,
    termsVersion: record.termsVersion,
    cancellationPolicyVersion: record.cancellationPolicyVersion,
  };
}

/** Receipt for confirmation / updated-confirmation emails — canonical record only. */
export function paidBookingRecordToReceipt(record: PaidBookingRecord): PaidBookingReceipt {
  return {
    ...paidBookingRecordToDetails(record),
    amountPaid: record.amountPaidLabel,
    paymentReference: record.paymentReference,
    transactionCode: record.transactionCode,
    customerReference: record.customerReference,
  };
}

/**
 * Merge helper for tests / migration: if a pending snapshot is supplied, only
 * fill blanks that the canonical record does not already have. Never overwrite
 * active journey fields (pickup, dropoff, schedule, party, contact) from pending.
 */
export function mergePendingOnlyForMissingContactAudit(
  record: PaidBookingRecord,
  pending?: PaidBookingDetails | null,
): PaidBookingDetails {
  const canonical = paidBookingRecordToDetails(record);
  if (!pending) return canonical;
  // Intentionally ignore pending journey fields — they are stale after amendments.
  return canonical;
}
