import { mkdirSync, writeFileSync } from "fs";
import {
  buildCustomerDriverDetailsEmail,
  buildDriverAssignmentEmail,
  type BookingJobRecord,
} from "../shared/booking-job";
import { resolveBookingFromHeader } from "../shared/email-config";
import { sendViaResend } from "../shared/resend-email";

const TO = process.env.TEST_EMAIL_TO?.trim() || "bookings@myairporttaxini.co.uk";
const PREVIEW_DIR = process.env.EMAIL_PREVIEW_DIR?.trim() || "/tmp/email-previews";

const sampleJob: BookingJobRecord = {
  id: "TEST-DRV-001",
  createdAt: new Date().toISOString(),
  status: "paid",
  kind: "booking-request",
  customerName: "Jamie Murphy",
  customerEmail: "jamie.murphy@example.com",
  customerMobile: "07700 900123",
  tripLabel: "Belfast City → Belfast International (BFS)",
  pickupLabel: "12 Botanic Avenue, Belfast BT7 1JG",
  dropoffLabel: "Belfast International Airport (BFS)",
  returnJourney: false,
  tripDate: "12 Aug 2026",
  tripTime: "06:45",
  passengers: 2,
  suitcases: 2,
  vehicle: "Saloon",
  isAirportTrip: true,
  airportCode: "BFS",
  isFromAirport: false,
  flightNumber: "EZY8021",
  // Full name on file — customer-facing copy must show first name only
  driverFirstName: "Gary Wilson",
  driverEmail: "gary.driver@example.com",
  driverMobile: "07700 900456",
  driverCarMake: "Skoda",
  driverCarModel: "Octavia",
  driverCarColour: "Silver",
  driverReg: "AB12 CDE",
  driverPayAmount: "£45",
  driverAssignmentStatus: "pending",
};

async function sendViaResendApi(subject: string, html: string, text: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  if (!apiKey) {
    console.log("Resend skipped — RESEND_API_KEY not set");
    return false;
  }

  const result = await sendViaResend({
    apiKey,
    from: resolveBookingFromHeader({
      BOOKING_FROM_EMAIL: process.env.BOOKING_FROM_EMAIL,
    }),
    to: TO,
    subject,
    text,
    html,
  });
  console.log("Resend", subject.slice(0, 60), result.ok, result.error ?? result.id);
  return result.ok;
}

async function sendOne(label: string, subject: string, html: string, text: string): Promise<boolean> {
  const fullSubject = `[TEST] ${subject}`;
  if (await sendViaResendApi(fullSubject, html, text)) {
    console.log(`${label}: sent via Resend`);
    return true;
  }
  console.error(`${label}: Resend failed (set RESEND_API_KEY to send live tests)`);
  return false;
}

async function main() {
  mkdirSync(PREVIEW_DIR, { recursive: true });

  const driverEmail = buildDriverAssignmentEmail({
    job: sampleJob,
    acceptUrl: "https://www.myairporttaxini.co.uk/driver-accept/?token=TEST-TOKEN",
  });
  const customerEmail = buildCustomerDriverDetailsEmail({ job: sampleJob });

  writeFileSync(`${PREVIEW_DIR}/driver-assignment.html`, driverEmail.html);
  writeFileSync(`${PREVIEW_DIR}/customer-driver-details.html`, customerEmail.html);
  writeFileSync(`${PREVIEW_DIR}/driver-assignment.txt`, driverEmail.text);
  writeFileSync(`${PREVIEW_DIR}/customer-driver-details.txt`, customerEmail.text);

  console.log("--- DRIVER (what the driver sees) ---");
  console.log(driverEmail.text);
  console.log("--- CUSTOMER (driver details, first name only) ---");
  console.log(customerEmail.text);

  if (process.env.SKIP_SEND === "1") {
    console.log(JSON.stringify({ to: TO, skippedSend: true, previewDir: PREVIEW_DIR }));
    return;
  }

  const driverSent = await sendOne("DRIVER", driverEmail.subject, driverEmail.html, driverEmail.text);
  const customerSent = await sendOne(
    "CUSTOMER",
    customerEmail.subject,
    customerEmail.html,
    customerEmail.text,
  );

  console.log(JSON.stringify({ to: TO, driverSent, customerSent, previewDir: PREVIEW_DIR }));
  if (!driverSent || !customerSent) process.exitCode = 1;
}

void main();
