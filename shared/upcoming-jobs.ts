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
