/** Owner-managed booking jobs: request → paid → assign driver by email. */

export type BookingJobStatus = "awaiting_payment" | "paid" | "cancelled";

export type DriverAssignmentStatus = "unassigned" | "pending" | "accepted" | "declined";

export type BookingJobKind = "booking-request" | "vehicle-enquiry";

export type BookingJobRecord = {
  id: string;
  createdAt: string;
  status: BookingJobStatus;
  kind: BookingJobKind;
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  tripLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney: boolean;
  tripDate: string;
  tripTime: string;
  returnDate?: string;
  returnTime?: string;
  flightNumber?: string;
  returnFlightNumber?: string;
  passengers: number;
  suitcases: number;
  vehicle: string;
  quotedPrice?: string | null;
  isAirportTrip: boolean;
  airportCode?: string;
  isFromAirport?: boolean;
  message?: string;
  amountPaidLabel?: string;
  paymentReference?: string;
  paidAt?: string;
  calendarEventIds?: string[];
  calendarLogged?: boolean;
  driverFirstName?: string;
  driverEmail?: string;
  driverMobile?: string;
  driverCarMake?: string;
  driverCarModel?: string;
  driverCarColour?: string;
  driverReg?: string;
  /** Manual amount the owner will pay the driver after the journey (never the customer fare). */
  driverPayAmount?: string;
  driverAssignmentStatus?: DriverAssignmentStatus;
  driverAcceptToken?: string;
  assignedAt?: string;
  driverAcceptedAt?: string;
  driverDeclinedAt?: string;
};

export function bookingJobKey(id: string): string {
  return `booking-job:${id.trim()}`;
}

export function bookingJobDayIndexKey(tripDate: string): string {
  return `booking-job-day:${tripDate.trim()}`;
}

/** Index by London calendar day the enquiry was created (YYYY-MM-DD). */
export function bookingJobCreatedDayIndexKey(createdDate: string): string {
  return `booking-job-created:${createdDate.trim()}`;
}

export function driverAcceptKey(token: string): string {
  return `driver-accept:${token.trim()}`;
}

export function bookingJobAssignmentLabel(
  status: DriverAssignmentStatus | undefined,
): string {
  switch (status) {
    case "pending":
      return "Awaiting driver confirmation";
    case "accepted":
      return "Driver confirmed";
    case "declined":
      return "Driver declined";
    default:
      return "Unassigned";
  }
}

/** Customer-facing first name only — never include surname. */
export function driverDisplayFirstName(fullName: string | undefined | null): string {
  const trimmed = fullName?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

export function buildDriverAssignmentEmail(options: {
  job: BookingJobRecord;
  acceptUrl: string;
  businessName?: string;
}): { subject: string; text: string; html: string } {
  const businessName = options.businessName ?? "My Airport Taxi NI";
  const job = options.job;
  const driverName = driverDisplayFirstName(job.driverFirstName) || "Driver";
  const pay = job.driverPayAmount?.trim() || "TBC";
  const vehicleLine = [job.driverCarMake, job.driverCarModel, job.driverReg]
    .filter(Boolean)
    .join(" ");

  const subject = `Job assignment — ${job.tripDate} ${job.tripTime} — please confirm`;

  const lines = [
    `Hi ${driverName},`,
    "",
    `You have been assigned a job with ${businessName}.`,
    "",
    "Job details",
    `Customer: ${job.customerName}`,
    `Mobile: ${job.customerMobile}`,
    `Pickup: ${job.pickupLabel}`,
    `Drop-off: ${job.dropoffLabel}`,
    `Date: ${job.tripDate}`,
    `Pick up time: ${job.tripTime}`,
    job.returnJourney && job.returnDate
      ? `Return: ${job.returnDate} at ${job.returnTime ?? ""}`
      : null,
    job.flightNumber ? `Flight: ${job.flightNumber}` : null,
    `Passengers: ${job.passengers}`,
    `Suitcases: ${job.suitcases}`,
    `Vehicle type booked: ${job.vehicle}`,
    vehicleLine ? `Your vehicle on this job: ${vehicleLine}` : null,
    job.driverMobile?.trim() ? `Your mobile on file: ${job.driverMobile.trim()}` : null,
    "",
    `Your pay for this journey: ${pay}`,
    "You will be paid after each journey (usually the next day).",
    "",
    "You do not need a login or access key — everything is in this email.",
    "Please confirm you accept this job:",
    options.acceptUrl,
    "",
    `Reference: ${job.id}`,
    "",
    businessName,
  ].filter((line): line is string => line !== null);

  const text = lines.join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#071c38;font-family:Arial,sans-serif;color:#e8edf5;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <h1 style="color:#2fbf4a;font-size:22px;">Job assignment</h1>
    <p>Hi ${escapeHtml(driverName)},</p>
    <p>You have been assigned a job with <strong>${escapeHtml(businessName)}</strong>.</p>
    <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:16px;margin:20px 0;">
      <p style="margin:0 0 8px;"><strong>Customer:</strong> ${escapeHtml(job.customerName)}</p>
      <p style="margin:0 0 8px;"><strong>Mobile:</strong> ${escapeHtml(job.customerMobile)}</p>
      <p style="margin:0 0 8px;"><strong>Pickup:</strong> ${escapeHtml(job.pickupLabel)}</p>
      <p style="margin:0 0 8px;"><strong>Drop-off:</strong> ${escapeHtml(job.dropoffLabel)}</p>
      <p style="margin:0 0 8px;"><strong>Date:</strong> ${escapeHtml(job.tripDate)}</p>
      <p style="margin:0 0 8px;"><strong>Pick up time:</strong> ${escapeHtml(job.tripTime)}</p>
      ${
        job.flightNumber
          ? `<p style="margin:0 0 8px;"><strong>Flight:</strong> ${escapeHtml(job.flightNumber)}</p>`
          : ""
      }
      <p style="margin:0 0 8px;"><strong>Passengers / suitcases:</strong> ${job.passengers} / ${job.suitcases}</p>
      <p style="margin:0;"><strong>Your pay for this journey:</strong> ${escapeHtml(pay)}</p>
    </div>
    <p style="color:#c5d0e0;font-size:14px;">You will be paid after each journey (usually the next day).</p>
    <p style="color:#c5d0e0;font-size:14px;">You do not need a login or access key — everything is in this email.</p>
    <p style="margin:28px 0;">
      <a href="${escapeHtml(options.acceptUrl)}" style="display:inline-block;background:#2fbf4a;color:#071c38;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px;">
        Confirm I accept this job
      </a>
    </p>
    <p style="font-size:12px;color:#8a97ab;">Reference: ${escapeHtml(job.id)}</p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

/** Customer-facing driver details — first name only, never surname or driver email. */
export function buildCustomerDriverDetailsEmail(options: {
  job: BookingJobRecord;
  businessName?: string;
}): { subject: string; text: string; html: string } {
  const businessName = options.businessName ?? "My Airport Taxi NI";
  const job = options.job;
  const driverFirst = driverDisplayFirstName(job.driverFirstName) || "your driver";
  const vehicle = [job.driverCarColour, job.driverCarMake, job.driverCarModel]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  const when = [job.tripDate, job.tripTime].filter(Boolean).join(" ");
  const customerName = job.customerName?.trim() || "there";

  const subject = when
    ? `Your driver details — ${when} — ${businessName}`
    : `Your driver details — ${businessName}`;

  const lines = [
    `Hi ${customerName},`,
    "",
    when
      ? `Here are your driver details for ${when}:`
      : "Here are your driver details for your airport transfer:",
    "",
    `Driver: ${driverFirst}`,
    job.driverMobile?.trim() ? `Mobile: ${job.driverMobile.trim()}` : null,
    vehicle ? `Vehicle: ${vehicle}` : null,
    job.driverReg?.trim() ? `Registration: ${job.driverReg.trim().toUpperCase()}` : null,
    "",
    `Pickup: ${job.pickupLabel}`,
    `Drop-off: ${job.dropoffLabel}`,
    "",
    "If you need to change anything, reply to this email or WhatsApp us.",
    "",
    businessName,
  ].filter((line): line is string => line !== null);

  const text = lines.join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#071c38;font-family:Arial,sans-serif;color:#e8edf5;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <h1 style="color:#2fbf4a;font-size:22px;">Your driver details</h1>
    <p>Hi ${escapeHtml(customerName)},</p>
    <p>${
      when
        ? `Here are your driver details for <strong>${escapeHtml(when)}</strong>:`
        : "Here are your driver details for your airport transfer:"
    }</p>
    <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:16px;margin:20px 0;">
      <p style="margin:0 0 8px;"><strong>Driver:</strong> ${escapeHtml(driverFirst)}</p>
      ${
        job.driverMobile?.trim()
          ? `<p style="margin:0 0 8px;"><strong>Mobile:</strong> ${escapeHtml(job.driverMobile.trim())}</p>`
          : ""
      }
      ${vehicle ? `<p style="margin:0 0 8px;"><strong>Vehicle:</strong> ${escapeHtml(vehicle)}</p>` : ""}
      ${
        job.driverReg?.trim()
          ? `<p style="margin:0 0 8px;"><strong>Registration:</strong> ${escapeHtml(job.driverReg.trim().toUpperCase())}</p>`
          : ""
      }
      <p style="margin:0 0 8px;"><strong>Pickup:</strong> ${escapeHtml(job.pickupLabel)}</p>
      <p style="margin:0;"><strong>Drop-off:</strong> ${escapeHtml(job.dropoffLabel)}</p>
    </div>
    <p style="color:#c5d0e0;font-size:14px;">If you need to change anything, reply to this email or WhatsApp us.</p>
    <p style="font-size:12px;color:#8a97ab;">${escapeHtml(businessName)}</p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
