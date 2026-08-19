/**
 * Paid booking amendment policy.
 *
 * Canonical state after finalize: PaidBookingRecord (KV booking:ref:{ref}).
 *
 * Customer self-service (material or schedule):
 * - ≤24h before confirmed pickup (Europe/London): blocked — contact required.
 * - >24h: one self-service amendment allowed (quota), always server-repriced.
 *
 * Owner/admin may amend anytime (completed-journey protections still apply)
 * and may optionally override the authoritative fare (audit logged).
 *
 * Saved quotes remain separate: schedule changes recalculate without mutating
 * the locked original quote price.
 */

import { hoursUntilPickup, isWithin24HoursOfPickup } from "./refund-ops";

/** One free customer self-service material/schedule amendment when >24h before pickup. */
export const FREE_CUSTOMER_DATE_TIME_AMENDMENTS = 1;

export const BOOKING_AMENDMENT_POLICY_VERSION = "August 2026 v2";

export type DateTimeAmendmentActor = "Customer" | "Owner" | "System";

export type DateTimeAmendmentAuditEntry = {
  changedAt: string;
  previousTripDate: string;
  previousTripTime: string;
  newTripDate: string;
  newTripTime: string;
  changedBy: DateTimeAmendmentActor;
  /** @deprecated Prefer amendmentHistory fare fields — schedule changes now reprice. */
  farePreserved: boolean;
  previousFare?: number;
  newFare?: number;
  notes?: string;
};

/** Fields that always trigger authoritative server-side repricing. */
export const MATERIAL_REPRICE_FIELDS = [
  "pickupLabel",
  "dropoffLabel",
  "airportCode",
  "isFromAirport",
  "tripDate",
  "tripTime",
  "returnJourney",
  "returnDate",
  "returnTime",
  "passengers",
  "suitcases",
  "childSeats",
  "vehicle",
] as const;

export type MaterialRepriceField = (typeof MATERIAL_REPRICE_FIELDS)[number];

/** Fields that usually update without repricing. */
export const NON_REPRICE_FIELDS = [
  "customerName",
  "customerEmail",
  "mobileNumber",
  "flightNumber",
  "returnFlightNumber",
  "notes",
  "childSeatNotes",
] as const;

export type CustomerScheduleAmendmentDecision =
  | {
      ok: true;
      reason: "free_schedule_amendment_repriced";
      /** Schedule/material self-service always reprices (weekday/weekend/bank holiday). */
      farePreserved: false;
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
        | "no_change"
        | "capacity_not_online"
        | "awaiting_extra_payment";
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
  childSeats?: number;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  airportCode?: string;
  isFromAirport?: boolean;
  status?: string;
  operationalStatus?: string;
  paymentStatus?: string;
  dateTimeAmendmentCount?: number;
  amountRefunded?: number;
  amount?: number;
  pendingAmendment?: { status?: string } | null;
};

export type ProposedBookingAmendment = {
  tripDate?: string;
  tripTime?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  passengers?: number;
  suitcases?: number;
  childSeats?: number;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  airportCode?: string;
  isFromAirport?: boolean;
  vehicle?: string;
  flightNumber?: string;
  returnFlightNumber?: string;
  customerName?: string;
  customerEmail?: string;
  mobileNumber?: string;
  notes?: string;
};

export type FareDifferenceKind = "none" | "additional_payment" | "refund_due";

export type FareDifferencePreview = {
  previousFare: number;
  newFare: number;
  difference: number;
  kind: FareDifferenceKind;
  label: string;
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

export function roundMoneyGbp(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function describeFareDifference(previousFare: number, newFare: number): FareDifferencePreview {
  const previous = roundMoneyGbp(previousFare);
  const next = roundMoneyGbp(newFare);
  const difference = roundMoneyGbp(next - previous);
  if (Math.abs(difference) < 0.005) {
    return {
      previousFare: previous,
      newFare: next,
      difference: 0,
      kind: "none",
      label: "No change to your fare",
    };
  }
  if (difference > 0) {
    return {
      previousFare: previous,
      newFare: next,
      difference,
      kind: "additional_payment",
      label: `Additional payment required: £${difference.toFixed(2)}`,
    };
  }
  return {
    previousFare: previous,
    newFare: next,
    difference: Math.abs(difference),
    kind: "refund_due",
    label: `Refund due: £${Math.abs(difference).toFixed(2)}`,
  };
}

export function materialFieldsChanged(
  current: PaidBookingAmendmentView,
  proposed: ProposedBookingAmendment,
): MaterialRepriceField[] {
  const changed: MaterialRepriceField[] = [];
  const checks: Array<[MaterialRepriceField, string | number | boolean | undefined, string | number | boolean | undefined]> = [
    ["pickupLabel", proposed.pickupLabel, current.pickupLabel],
    ["dropoffLabel", proposed.dropoffLabel, current.dropoffLabel],
    ["airportCode", proposed.airportCode, current.airportCode],
    ["isFromAirport", proposed.isFromAirport, current.isFromAirport],
    ["tripDate", proposed.tripDate !== undefined ? normalizeScheduleDate(proposed.tripDate) : undefined, normalizeScheduleDate(current.tripDate)],
    ["tripTime", proposed.tripTime !== undefined ? normalizeScheduleTime(proposed.tripTime) : undefined, normalizeScheduleTime(current.tripTime)],
    ["returnJourney", proposed.returnJourney, current.returnJourney],
    ["returnDate", proposed.returnDate, current.returnDate],
    ["returnTime", proposed.returnTime, current.returnTime],
    ["passengers", proposed.passengers, current.passengers],
    ["suitcases", proposed.suitcases, current.suitcases],
    ["childSeats", proposed.childSeats, current.childSeats],
    ["vehicle", proposed.vehicle, undefined],
  ];
  for (const [field, next, prev] of checks) {
    if (next === undefined) continue;
    if (typeof next === "string" && typeof prev === "string") {
      if (next.trim() !== String(prev ?? "").trim()) changed.push(field);
      continue;
    }
    if (next !== prev) changed.push(field);
  }
  return changed;
}

export function summarizeAmendmentChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const labels: Record<string, string> = {
    pickupLabel: "Pickup address updated",
    dropoffLabel: "Destination updated",
    tripDate: "Pickup date changed",
    tripTime: "Pickup time changed",
    returnJourney: "Return journey updated",
    returnDate: "Return date changed",
    returnTime: "Return time changed",
    passengers: "Passenger count updated",
    suitcases: "Luggage count updated",
    childSeats: "Child seats updated",
    airportCode: "Airport updated",
    flightNumber: "Flight number updated",
    returnFlightNumber: "Return flight number updated",
    customerName: "Name updated",
    customerEmail: "Email updated",
    mobileNumber: "Mobile updated",
    vehicle: "Vehicle/service updated",
  };
  const lines: string[] = [];
  for (const [key, label] of Object.entries(labels)) {
    if (!(key in after)) continue;
    if (String(before[key] ?? "") !== String(after[key] ?? "")) {
      lines.push(label);
    }
  }
  return lines;
}

/**
 * Gate customer self-service before preview/commit.
 * Material journey changes are allowed when >24h + quota remaining — they must
 * still go through server-side authoritative repricing (not fare-preserved).
 */
export function evaluateCustomerAmendmentAccess(input: {
  booking: PaidBookingAmendmentView;
  proposed: ProposedBookingAmendment;
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

  if (booking.pendingAmendment?.status === "awaiting_payment") {
    return {
      ok: false,
      reason: "awaiting_extra_payment",
      message:
        "An amendment payment is already in progress for this booking. Please complete or abandon that payment first.",
    };
  }

  const proposedDate =
    input.proposed.tripDate !== undefined
      ? normalizeScheduleDate(input.proposed.tripDate)
      : normalizeScheduleDate(booking.tripDate);
  const proposedTime =
    input.proposed.tripTime !== undefined
      ? normalizeScheduleTime(input.proposed.tripTime)
      : normalizeScheduleTime(booking.tripTime);

  if (input.proposed.tripDate !== undefined || input.proposed.tripTime !== undefined) {
    if (!isValidScheduleDate(proposedDate) || !isValidScheduleTime(proposedTime)) {
      return {
        ok: false,
        reason: "invalid_schedule",
        message: "Please enter a valid pickup date and time.",
      };
    }
  }

  const changed = materialFieldsChanged(booking, {
    ...input.proposed,
    tripDate: input.proposed.tripDate !== undefined ? proposedDate : undefined,
    tripTime: input.proposed.tripTime !== undefined ? proposedTime : undefined,
  });

  const nonMaterialTouched = NON_REPRICE_FIELDS.some((field) => {
    const value = input.proposed[field as keyof ProposedBookingAmendment];
    if (value === undefined) return false;
    const current = (booking as Record<string, unknown>)[field];
    return String(value).trim() !== String(current ?? "").trim();
  });

  if (changed.length === 0 && !nonMaterialTouched) {
    return {
      ok: false,
      reason: "no_change",
      message: "The proposed details match your current booking.",
    };
  }

  // Non-material-only (name/email/mobile/flight/notes): allowed without 24h / quota burn.
  if (changed.length === 0 && nonMaterialTouched) {
    return {
      ok: true,
      reason: "free_schedule_amendment_repriced",
      farePreserved: false,
      hoursUntilPickup: hoursUntilPickup(booking.tripDate, booking.tripTime, now) ?? 0,
      amendmentsUsed: Math.max(0, Math.floor(Number(booking.dateTimeAmendmentCount) || 0)),
      amendmentsRemainingAfter: Math.max(
        0,
        FREE_CUSTOMER_DATE_TIME_AMENDMENTS -
          Math.max(0, Math.floor(Number(booking.dateTimeAmendmentCount) || 0)),
      ),
    };
  }

  const currentDate = normalizeScheduleDate(booking.tripDate);
  const currentTime = normalizeScheduleTime(booking.tripTime);
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
        "Your free online change has already been used. Further changes need approval from My Airport Taxi NI.",
      hoursUntilPickup: hours,
      contactRequired: true,
    };
  }

  return {
    ok: true,
    reason: "free_schedule_amendment_repriced",
    farePreserved: false,
    hoursUntilPickup: hours,
    amendmentsUsed: used,
    amendmentsRemainingAfter: FREE_CUSTOMER_DATE_TIME_AMENDMENTS - used - 1,
  };
}

/**
 * Evaluate a customer self-service date/time amendment against stored booking state.
 * Material pickup/destination/party changes use the same 24h + quota gate and must reprice.
 */
export function evaluateCustomerDateTimeAmendment(input: {
  booking: PaidBookingAmendmentView;
  newTripDate: string;
  newTripTime: string;
  proposedPickupLabel?: string;
  proposedDropoffLabel?: string;
  proposedPassengers?: number;
  proposedSuitcases?: number;
  now?: Date;
}): CustomerScheduleAmendmentDecision {
  return evaluateCustomerAmendmentAccess({
    booking: input.booking,
    proposed: {
      tripDate: input.newTripDate,
      tripTime: input.newTripTime,
      pickupLabel: input.proposedPickupLabel,
      dropoffLabel: input.proposedDropoffLabel,
      passengers: input.proposedPassengers,
      suitcases: input.proposedSuitcases,
    },
    now: input.now,
  });
}

/** Customer-facing copy when self-service is blocked inside 24 hours. */
export const WITHIN_24H_AMENDMENT_HEADLINE = "Need to change your journey?";
export const WITHIN_24H_AMENDMENT_BODY =
  "As your pickup is within 24 hours, changes cannot be made automatically. Please contact My Airport Taxi NI and we’ll do our best to accommodate your new journey details, subject to availability.";

export const FREE_AMENDMENT_HINT =
  "One free online change is available more than 24 hours before pickup. Fare may change if weekday/weekend or journey details differ.";

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

/** Generate a stable opaque amendment id (hex). */
export function generateAmendmentId(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
