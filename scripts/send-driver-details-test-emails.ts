import { mkdirSync, writeFileSync } from "fs";
import {
  buildCustomerDriverDetailsEmail,
  buildDriverAssignmentEmail,
  type BookingJobRecord,
} from "../shared/booking-job";

const TO = process.env.TEST_EMAIL_TO?.trim() || "cgr28@hotmail.co.uk";
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

async function sendViaFormSubmit(subject: string, html: string, text: string): Promise<boolean> {
  const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(TO)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      _subject: subject,
      _captcha: "false",
      _template: "box",
      name: "My Airport Taxi NI",
      message: html || text,
      _replyto: "bookings@myairporttaxini.co.uk",
    }),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const bodyText = await response.text();
  console.log("FormSubmit", subject.slice(0, 60), response.status, bodyText.slice(0, 240));
  if (!contentType.includes("application/json")) return false;
  try {
    const payload = JSON.parse(bodyText) as { success?: unknown };
    return response.ok && (payload.success === "true" || payload.success === true);
  } catch {
    return false;
  }
}

async function sendViaWeb3Forms(subject: string, html: string, text: string): Promise<boolean> {
  const accessKey = process.env.WEB3FORMS_ACCESS_KEY?.trim() ?? "";
  if (!accessKey) {
    console.log("Web3Forms skipped — WEB3FORMS_ACCESS_KEY not set");
    return false;
  }
  const response = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      access_key: accessKey,
      subject: `[Paid booking copy] ${subject}`,
      name: TO,
      from_name: "My Airport Taxi NI",
      message: text,
      email: TO,
      autoresponse: { subject, message: html },
    }),
  });
  const body = (await response.json().catch(() => null)) as { success?: unknown; message?: string } | null;
  console.log("Web3Forms", subject.slice(0, 60), response.status, body);
  return response.ok && body?.success === true;
}

async function sendOne(label: string, subject: string, html: string, text: string): Promise<boolean> {
  const fullSubject = `[TEST] ${subject}`;
  if (await sendViaFormSubmit(fullSubject, html, text)) {
    console.log(`${label}: sent via FormSubmit`);
    return true;
  }
  if (await sendViaWeb3Forms(fullSubject, html, text)) {
    console.log(`${label}: sent via Web3Forms`);
    return true;
  }
  console.error(`${label}: all providers failed`);
  return false;
}

async function main() {
  mkdirSync(PREVIEW_DIR, { recursive: true });

  const driverEmail = buildDriverAssignmentEmail({
    job: sampleJob,
    acceptUrl: "https://www.myairporttaxini.co.uk/driver?accept=TEST-TOKEN",
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
