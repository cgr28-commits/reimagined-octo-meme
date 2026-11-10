/**
 * Read-only links between bookings and driver accounts.
 * Used only to alert the owner (e.g. on suspension) and to verify what the owner reports.
 * Nothing here ever writes to a booking.
 */
import type { BookingJobRecord } from "../shared/booking-job";
import type { BookingAssignmentCheck, DriverIdentity, DriverUpcomingBooking } from "./driver-accounts";

function digits(value: string | undefined): string {
  let d = (value ?? "").replace(/\D/g, "");
  if (d.startsWith("44") && d.length === 12) d = `0${d.slice(2)}`;
  return d;
}

export function londonTodayYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * How a booking is linked to this driver:
 * - "driver_id": the booking carries this driver's permanent account id (authoritative);
 * - "contact": no account id on the booking, but its driver email/mobile match (older assignments);
 * - null: not this driver. A booking carrying a different account id never matches on contact details.
 */
export function bookingDriverLink(job: BookingJobRecord, driver: DriverIdentity): "driver_id" | "contact" | null {
  const accountId = (job.driverAccountId ?? "").trim();
  if (accountId) return accountId === driver.id ? "driver_id" : null;
  const email = driver.email.trim().toLowerCase();
  const mobile = digits(driver.mobile);
  if (email && (job.driverEmail ?? "").trim().toLowerCase() === email) return "contact";
  if (mobile.length >= 10 && digits(job.driverMobile) === mobile) return "contact";
  return null;
}

function isActiveAssignment(job: BookingJobRecord): boolean {
  return job.driverAssignmentStatus === "pending" || job.driverAssignmentStatus === "accepted";
}

export function upcomingBookingsForDriver(jobs: BookingJobRecord[], driver: DriverIdentity, today: string): DriverUpcomingBooking[] {
  const out: DriverUpcomingBooking[] = [];
  for (const job of jobs) {
    if (job.status !== "paid" || !isActiveAssignment(job)) continue;
    const link = bookingDriverLink(job, driver);
    if (!link) continue;
    const reference = (job.paymentReference || job.id || "").trim();
    const customerName = (job.customerName || "").trim().split(/\s+/)[0] ?? "";
    const assignment = {
      driverAccountId: job.driverAccountId ?? "",
      driverFirstName: job.driverFirstName ?? "",
      driverEmail: job.driverEmail ?? "",
      driverMobile: job.driverMobile ?? "",
      assignmentStatus: job.driverAssignmentStatus ?? "",
      driverProfileKey: job.driverProfileKey ?? "",
    };
    if (job.tripDate && job.tripDate >= today) {
      out.push({ reference, tripDate: job.tripDate, tripTime: job.tripTime || "", pickup: job.pickupLabel || "", customerName, leg: "outbound", matchMethod: link, assignment });
    }
    if (job.returnJourney && job.returnDate && job.returnDate >= today) {
      out.push({ reference, tripDate: job.returnDate, tripTime: job.returnTime || "", pickup: "Return journey", customerName, leg: "return", matchMethod: link, assignment });
    }
  }
  return out.sort((a, b) => `${a.tripDate}T${a.tripTime}`.localeCompare(`${b.tripDate}T${b.tripTime}`));
}

/** Current state of one booking, to verify an owner's "replacement confirmed" or "cancelled". */
export function checkBookingAssignment(job: BookingJobRecord | null, driver: DriverIdentity): BookingAssignmentCheck {
  if (!job) return { found: false, cancelled: false, assignedToThisDriver: false, otherDriver: "" };
  const cancelled = job.status === "cancelled";
  const assignedToThisDriver = isActiveAssignment(job) && bookingDriverLink(job, driver) !== null;
  const hasDriver = isActiveAssignment(job) && Boolean((job.driverAccountId || job.driverEmail || job.driverMobile || "").trim());
  const otherDriver = hasDriver && !assignedToThisDriver ? (job.driverFirstName || job.driverAccountId || job.driverEmail || "another driver").trim() : "";
  return { found: true, cancelled, assignedToThisDriver, otherDriver };
}
