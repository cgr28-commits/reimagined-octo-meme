/**
 * Journey date/time amendment policy.
 *
 * Saved quotes ≠ paid bookings.
 * - Saved quote: changing date/time recalculates fare (never keeps old locked price).
 * - Paid booking >24h: one free date/time change if journey otherwise unchanged.
 * - Paid booking ≤24h: no automatic self-service (operator discretion / contact us).
 *
 * Uses Europe/London pickup wall-clock via refund-ops helpers.
 */

import { hoursUntilPickup, isWithin24HoursOfPickup } from "./refund-ops";

/** One free customer date/time amendment when more than 24 hours before pickup. */
export const FREE_CUSTOMER_DATE_TIME_AMENDMENTS = 1;

export const BOOKING_AMENDMENT_POLICY_VERSION = "August 2026 v1";

export type DateTimeAmendmentActor = "Customer" | "Owner" | "System";

export type DateTimeAmendmentAuditEntry = {
  changedAt: string;
  previousTripDate: string;
  previousTripTime: string;
  newTripDate: string;
  newTripTime: string;
  changedBy: DateTimeAmendmentActor;
  /** Fare preserved for this change (date/time-only free amendment). */
  farePreserved: boolean;
  notes?: string;
};

export type CustomerScheduleAmendmentDecision =
  | {
      ok: true;
      reason: "free_date_time_amendment";
      farePreserved: true;
      hoursUntilPickup: number;
      amendmentsUsed: number;
      amendmentsRemainingAfter: number;
    }
  | {
      ok: false;
      reason:
        | "within_24_hours"
        | "free_quota_exhausted"
        | "material_journey_change"
        | "invalid_schedule"
        | "booking_not_amendable"
        | "no_change";
      message: string;
      hoursUntilPickup?: number | null;
      contactRequired?: boolean;
    };

export type PaidBookingAmendmentView = {
  tripDate: string;
  tripTime: string;
  pickupLabel: string;
  dropoffLabel: string;
  passengers?: number;
  suitcases?: number;
  returnJourney?: boolean;
  status?: string;
  operationalStatus?: string;
  paymentStatus?: string;
  dateTimeAmendmentCount?: number;
  amountRefunded?: number;
  amount?: number;
};

export function normalizeScheduleDate(value: string): string {
  return String(value ?? "").trim();
}

export function normalizeScheduleTime(value: string): string {
  const raw = String(value ?? "").trim();
  if (/^\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw.slice(0, 5);
  return raw;
}

export function isValidScheduleDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeScheduleDate(value));
}

export function isValidScheduleTime(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(normalizeScheduleTime(value));
}

function bookingIsActiveForAmendment(booking: PaidBookingAmendmentView): boolean {
  if (booking.operationalStatus === "cancelled") return false;
  if (booking.status === "cancelled" || booking.status === "refunded") return false;
  if (booking.paymentStatus === "fully_refunded") return false;
  const refunded = Number(booking.amountRefunded) || 0;
  const amount = Number(booking.amount) || 0;
  if (amount > 0 && refunded > 0 && refunded + 0.001 >= amount) return false;
  return true;
}

/**
 * Evaluate a customer self-service date/time amendment against stored booking state.
 * Pickup/destination/party must remain unchanged for the free amendment path.
 */
export function evaluateCustomerDateTimeAmendment(input: {
  booking: PaidBookingAmendmentView;
  newTripDate: string;
  newTripTime: string;
  /** Optional proposed journey fields — if present and different, reject free path. */
  proposedPickupLabel?: string;
  proposedDropoffLabel?: string;
  proposedPassengers?: number;
  proposedSuitcases?: number;
  now?: Date;
}): CustomerScheduleAmendmentDecision {
  const now = input.now ?? new Date();
  const booking = input.booking;

  if (!bookingIsActiveForAmendment(booking)) {
    return {
      ok: false,
      reason: "booking_not_amendable",
      message: "This booking can no longer be changed online.",
    };
  }

  const newTripDate = normalizeScheduleDate(input.newTripDate);
  const newTripTime = normalizeScheduleTime(input.newTripTime);
  if (!isValidScheduleDate(newTripDate) || !isValidScheduleTime(newTripTime)) {
    return {
      ok: false,
      reason: "invalid_schedule",
      message: "Please enter a valid pickup date and time.",
    };
  }

  const currentDate = normalizeScheduleDate(booking.tripDate);
  const currentTime = normalizeScheduleTime(booking.tripTime);
  if (newTripDate === currentDate && newTripTime === currentTime) {
    return {
      ok: false,
      reason: "no_change",
      message: "The new date and time match your current booking.",
    };
  }

  if (
    (input.proposedPickupLabel !== undefined &&
      input.proposedPickupLabel.trim() !== booking.pickupLabel.trim()) ||
    (input.proposedDropoffLabel !== undefined &&
      input.proposedDropoffLabel.trim() !== booking.dropoffLabel.trim())
  ) {
    return {
      ok: false,
      reason: "material_journey_change",
      message:
        "Changing pickup or destination needs a new quote. Please contact My Airport Taxi NI.",
      contactRequired: true,
    };
  }

  if (
    typeof input.proposedPassengers === "number" &&
    typeof booking.passengers === "number" &&
    input.proposedPassengers !== booking.passengers
  ) {
    return {
      ok: false,
      reason: "material_journey_change",
      message:
        "Changing passenger numbers may affect the fare. Please contact My Airport Taxi NI.",
      contactRequired: true,
    };
  }

  if (
    typeof input.proposedSuitcases === "number" &&
    typeof booking.suitcases === "number" &&
    input.proposedSuitcases !== booking.suitcases
  ) {
    return {
      ok: false,
      reason: "material_journey_change",
      message:
        "Changing luggage requirements may affect the vehicle. Please contact My Airport Taxi NI.",
      contactRequired: true,
    };
  }

  const hours = hoursUntilPickup(currentDate, currentTime, now);
  if (hours == null || isWithin24HoursOfPickup(currentDate, currentTime, now)) {
    return {
      ok: false,
      reason: "within_24_hours",
      message:
        "As your pickup is within 24 hours, changes cannot be made automatically. Please contact My Airport Taxi NI.",
      hoursUntilPickup: hours,
      contactRequired: true,
    };
  }

  const used = Math.max(0, Math.floor(Number(booking.dateTimeAmendmentCount) || 0));
  if (used >= FREE_CUSTOMER_DATE_TIME_AMENDMENTS) {
    return {
      ok: false,
      reason: "free_quota_exhausted",
      message:
        "Your free date/time change has already been used. Further changes need approval from My Airport Taxi NI.",
      hoursUntilPickup: hours,
      contactRequired: true,
    };
  }

  return {
    ok: true,
    reason: "free_date_time_amendment",
    farePreserved: true,
    hoursUntilPickup: hours,
    amendmentsUsed: used,
    amendmentsRemainingAfter: FREE_CUSTOMER_DATE_TIME_AMENDMENTS - used - 1,
  };
}

/** Customer-facing copy when self-service is blocked inside 24 hours. */
export const WITHIN_24H_AMENDMENT_HEADLINE = "Need to change your journey?";
export const WITHIN_24H_AMENDMENT_BODY =
  "As your pickup is within 24 hours, changes cannot be made automatically. Please contact My Airport Taxi NI and we’ll do our best to accommodate your new date or time, subject to availability.";

export const FREE_AMENDMENT_HINT =
  "One free date/time change is available, subject to availability.";

/**
 * Saved quotes: any date/time change must leave the original locked price untouched
 * and force a fresh authoritative calculation for the new schedule.
 */
export function savedQuoteScheduleChanged(
  locked: { tripDate: string; tripTime: string },
  proposed: { tripDate: string; tripTime: string },
): boolean {
  return (
    normalizeScheduleDate(locked.tripDate) !== normalizeScheduleDate(proposed.tripDate) ||
    normalizeScheduleTime(locked.tripTime) !== normalizeScheduleTime(proposed.tripTime)
  );
}
