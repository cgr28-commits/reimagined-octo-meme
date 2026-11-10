/**
 * Read-only: upcoming confirmed bookings assigned to a driver account.
 * Used only to alert the owner (e.g. on suspension). Never writes to a booking.
 */
import type { BookingJobRecord } from "../shared/booking-job";
import type { DriverUpcomingBooking } from "./driver-accounts";

function digits(value: string | undefined): string {
  let d = (value ?? "").replace(/\D/g, "");
  if (d.startsWith("44") && d.length === 12) d = `0${d.slice(2)}`;
  return d;
}

export function londonTodayYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function upcomingBookingsForDriver(
  jobs: BookingJobRecord[],
  driver: { email: string; mobile: string },
  today: string,
): DriverUpcomingBooking[] {
  const email = driver.email.trim().toLowerCase();
  const mobile = digits(driver.mobile);
  const out: DriverUpcomingBooking[] = [];
  for (const job of jobs) {
    if (job.status !== "paid") continue;
    if (job.driverAssignmentStatus !== "pending" && job.driverAssignmentStatus !== "accepted") continue;
    const sameEmail = Boolean(email) && (job.driverEmail ?? "").trim().toLowerCase() === email;
    const sameMobile = Boolean(mobile) && mobile.length >= 10 && digits(job.driverMobile) === mobile;
    if (!sameEmail && !sameMobile) continue;
    const reference = (job.paymentReference || job.id || "").trim();
    const customerName = (job.customerName || "").trim().split(/\s+/)[0] ?? "";
    if (job.tripDate && job.tripDate >= today) {
      out.push({ reference, tripDate: job.tripDate, tripTime: job.tripTime || "", pickup: job.pickupLabel || "", customerName, leg: "outbound" });
    }
    if (job.returnJourney && job.returnDate && job.returnDate >= today) {
      out.push({ reference, tripDate: job.returnDate, tripTime: job.returnTime || "", pickup: "Return journey", customerName, leg: "return" });
    }
  }
  return out.sort((a, b) => `${a.tripDate}T${a.tripTime}`.localeCompare(`${b.tripDate}T${b.tripTime}`));
}
