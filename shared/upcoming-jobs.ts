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

/**
 * Next journey date for Upcoming Jobs bucketing.
 * When the outbound day is past but a return leg is still upcoming, use returnDate
 * so return trips (e.g. 19 Aug after an 8 Aug outbound) stay visible.
 */
export function relevantUpcomingJourneyDate(
  booking: {
    tripDate?: string;
    returnJourney?: boolean;
    returnDate?: string;
  },
  today = londonYmd(),
): string {
  const tripDate = booking.tripDate?.trim() ?? "";
  const returnDate = booking.returnDate?.trim() ?? "";
  if (
    booking.returnJourney &&
    /^\d{4}-\d{2}-\d{2}$/.test(returnDate) &&
    returnDate >= today &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate) || tripDate < today)
  ) {
    return returnDate;
  }
  return tripDate;
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

export function isUpcomingWorkBooking(booking: {
  status?: string;
  journeyStatus?: string;
}): boolean {
  if (booking.status === "refunded") return false;
  if (booking.journeyStatus === "completed") return false;
  return true;
}
