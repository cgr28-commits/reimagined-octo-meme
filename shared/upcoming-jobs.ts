import { PRIMARY_DRIVER_LABEL } from "./paid-booking-record";

export type UpcomingBucket = "today" | "tomorrow" | "later" | "past";

export function londonYmd(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDaysYmd(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function upcomingBucketForTripDate(
  tripDate: string,
  today = londonYmd(),
): UpcomingBucket {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) return "later";
  if (tripDate === today) return "today";
  if (tripDate === addDaysYmd(today, 1)) return "tomorrow";
  if (tripDate < today) return "past";
  return "later";
}

/** Booking fields used for Upcoming vs Completed and next-leg ordering. */
export type LegAwareBooking = {
  status?: string;
  returnJourney?: boolean;
  tripDate?: string;
  tripTime?: string;
  returnDate?: string;
  returnTime?: string;
  journeyStatus?: string;
  outboundJourneyStatus?: string;
  returnJourneyStatus?: string;
  allLegsCompleted?: boolean;
  nextUnfinishedLegDate?: string;
  nextUnfinishedLegTime?: string;
};

function legStatusCompleted(status?: string | null): boolean {
  return status === "completed";
}

/**
 * True when every journey leg that exists for this paid booking is completed.
 * Return bookings stay unfinished until BOTH outbound and return are completed.
 * Missing return tracking does not count as completed.
 */
export function bookingFullyCompleted(booking: LegAwareBooking): boolean {
  if (typeof booking.allLegsCompleted === "boolean") {
    return booking.allLegsCompleted;
  }

  if (booking.returnJourney) {
    const outboundDone = legStatusCompleted(
      booking.outboundJourneyStatus ?? booking.journeyStatus,
    );
    const returnDone = legStatusCompleted(booking.returnJourneyStatus);
    return outboundDone && returnDone;
  }

  return legStatusCompleted(
    booking.outboundJourneyStatus ?? booking.journeyStatus,
  );
}

/**
 * Next unfinished journey date for Upcoming Jobs bucketing / display.
 * Uses API `nextUnfinishedLegDate` when present; otherwise derives from leg statuses.
 * Past unfinished outbound stays on the outbound date (not auto-skipped).
 */
export function relevantUpcomingJourneyDate(
  booking: LegAwareBooking,
  _today = londonYmd(),
): string {
  const explicit = booking.nextUnfinishedLegDate?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) {
    return explicit;
  }

  const tripDate = booking.tripDate?.trim() ?? "";
  const returnDate = booking.returnDate?.trim() ?? "";

  if (booking.returnJourney) {
    const outboundDone = legStatusCompleted(
      booking.outboundJourneyStatus ?? booking.journeyStatus,
    );
    if (!outboundDone) {
      return tripDate;
    }
    if (!legStatusCompleted(booking.returnJourneyStatus)) {
      return returnDate || tripDate;
    }
  }

  return tripDate;
}

export function relevantUpcomingJourneyTime(booking: LegAwareBooking): string {
  const explicitDate = booking.nextUnfinishedLegDate?.trim() ?? "";
  const explicitTime = booking.nextUnfinishedLegTime?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) {
    return explicitTime;
  }

  const nextDate = relevantUpcomingJourneyDate(booking);
  if (
    booking.returnJourney &&
    nextDate === (booking.returnDate || "").trim() &&
    nextDate !== (booking.tripDate || "").trim()
  ) {
    return booking.returnTime?.trim() ?? "";
  }
  return booking.tripTime?.trim() ?? "";
}

/** Sort key: next unfinished leg date+time ascending (soonest due first). */
export function nextUnfinishedSortKey(booking: LegAwareBooking): string {
  const date = relevantUpcomingJourneyDate(booking) || "9999-99-99";
  const time = relevantUpcomingJourneyTime(booking) || "99:99";
  return `${date}T${time}`;
}

/** True when outbound and/or return falls inside the Upcoming Jobs horizon. */
export function bookingInUpcomingHorizon(
  booking: {
    tripDate?: string;
    returnJourney?: boolean;
    returnDate?: string;
  },
  horizonStart: string,
  horizonEnd: string,
): boolean {
  const tripDate = booking.tripDate?.trim() ?? "";
  const returnDate = booking.returnDate?.trim() ?? "";
  const tripOk = /^\d{4}-\d{2}-\d{2}$/.test(tripDate);
  const returnOk =
    Boolean(booking.returnJourney) && /^\d{4}-\d{2}-\d{2}$/.test(returnDate);

  if (!tripOk && !returnOk) return true;

  if (tripOk && tripDate >= horizonStart && tripDate <= horizonEnd) {
    return true;
  }
  if (returnOk && returnDate >= horizonStart && returnDate <= horizonEnd) {
    return true;
  }
  return false;
}

export function formatDisplayTripDate(tripDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) return tripDate || "—";
  const [y, m, d] = tripDate.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function journeyStatusLabel(status?: string): string {
  switch (status) {
    case "tracking":
      return "Live tracking";
    case "arrived_pickup":
      return "Arrived at pickup";
    case "en_route":
      return "Passenger on board";
    case "arrived_destination":
      return "Arrived at destination";
    case "completed":
      return "Completed";
    case "stopped":
      return "Tracking stopped";
    default:
      return "Upcoming";
  }
}

export function assignedDriverDisplay(label?: string | null, name?: string | null): string {
  return label?.trim() || name?.trim() || PRIMARY_DRIVER_LABEL;
}

/** Upcoming Jobs: unfinished paid work only (operationally cancelled / fully completed excluded). */
export function isUpcomingWorkBooking(booking: LegAwareBooking): boolean {
  // refunded_active = money fully returned but journey still live — keep in upcoming.
  if (booking.status === "refunded" || booking.status === "cancelled") return false;
  return !bookingFullyCompleted(booking);
}

/** Completed Jobs history: fully completed legs, cancelled, or cancel+full-refund. */
export function isCompletedWorkBooking(booking: LegAwareBooking): boolean {
  if (booking.status === "refunded" || booking.status === "cancelled") return true;
  return bookingFullyCompleted(booking);
}
