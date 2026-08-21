/**
 * Regression checks for Driver on the way email/status + preserved arrival WhatsApp.
 * Run: npx tsx scripts/check-driver-on-the-way.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildDriverArrivedPickupEmail,
  buildDriverOnTheWayEmail,
} from "../shared/booking-notifications";
import {
  buildArrivedPickupWhatsAppMessage,
  buildDriverOnTheWayWhatsAppMessage,
} from "../shared/arrival-whatsapp";
import { applyJourneyAction, customerJourneyLabel } from "../shared/tracking";

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

console.log("=== Arrival WhatsApp preserved exactly ===");
const street = buildArrivedPickupWhatsAppMessage({ isAirportPickup: false });
assert.match(street, /🚕 Your driver has arrived/);
assert.match(street, /ready when you are/);
const airport = buildArrivedPickupWhatsAppMessage({
  isAirportPickup: true,
  vehicle: { colour: "Black", make: "Mercedes", model: "E-Class", registration: "ABC123" },
});
assert.match(airport, /✈️ Your driver has arrived/);
assert.match(airport, /agreed airport pickup point/);
assert.match(airport, /Registration: ABC123/);
console.log("OK  arrival WhatsApp copy unchanged");

console.log("\n=== Driver on the way email wording ===");
const email = buildDriverOnTheWayEmail({ customerName: "Alex Customer" });
assert.equal(email.subject, "Driver on the way — My Airport Taxi NI");
assert.match(email.text, /Driver on the way/);
assert.match(
  email.text,
  /Your driver is on the way to collect you\. Your driver may share their live location with you via WhatsApp when appropriate\./,
);
assert.doesNotMatch(email.text, /track\/\?id=/i);
assert.doesNotMatch(email.text, /Track Your Driver/i);
assert.doesNotMatch(email.html, /track\/\?id=/i);
assert.doesNotMatch(email.html, /Track Your Driver/i);
console.log("OK  on-the-way email uses exact status wording and has no track link");

console.log("\n=== Arrival email still separate ===");
const arrival = buildDriverArrivedPickupEmail({ customerName: "Alex Customer" });
assert.match(arrival.subject, /Your driver has arrived/);
assert.doesNotMatch(arrival.subject, /Driver on the way/);
console.log("OK  arrival email untouched");

console.log("\n=== On-the-way WhatsApp (manual) ===");
const wa = buildDriverOnTheWayWhatsAppMessage();
assert.match(wa, /Driver on the way/);
assert.match(wa, /may share their live location with you via WhatsApp when appropriate/);
assert.doesNotMatch(wa, /track\/\?id=/i);
console.log("OK  optional on-the-way WhatsApp is manual / no track URL");

console.log("\n=== Status transition ===");
let job = {
  token: "tok",
  paymentReference: "pay",
  createdAt: "2026-08-19T09:00:00.000Z",
  updatedAt: "2026-08-19T09:00:00.000Z",
  customerName: "Alex Customer",
  customerEmail: "alex@example.com",
  customerMobile: "07123456789",
  pickupLabel: "Ballyclare",
  dropoffLabel: "Belfast International Airport",
  tripDate: "2026-08-20",
  tripTime: "10:00",
  pickupAt: "2026-08-20T10:00",
  journeyStatus: "idle" as const,
  sharingActive: false,
};
const started = applyJourneyAction(job, "start_tracking", "2026-08-19T09:10:00.000Z");
assert.equal(started.ok, true);
if (started.ok) {
  assert.equal(started.job.journeyStatus, "tracking");
  assert.equal(customerJourneyLabel(started.job), "Driver on the way");
}
console.log("OK  start_tracking → Driver on the way");

console.log("\n=== Wiring ===");
const handlers = read("workers/addresses/src/journey-handlers.ts");
assert.match(handlers, /sendOnTheWayNotificationIfNeeded/);
assert.match(handlers, /action === "start_tracking"/);
assert.match(handlers, /buildDriverOnTheWayEmail/);
assert.match(handlers, /sendArrivalNotificationIfNeeded/);
assert.match(handlers, /buildDriverArrivedPickupEmail/);

const labels = read("src/lib/tracking-api.ts");
assert.match(labels, /start_tracking:\s*"Driver on the way"/);
assert.match(labels, /arrived_pickup:\s*"Driver has arrived"/);

const driver = read("src/app/driver/DriverPageClient.tsx");
assert.match(driver, /buildArrivedPickupWhatsAppMessage/);
assert.match(driver, /buildDriverOnTheWayWhatsAppLink/);
assert.match(driver, /action === "arrived_pickup"/);
assert.match(driver, /action === "start_tracking"/);
assert.match(
  driver,
  /Customer update actions[\s\S]*must NOT wait for the[\s\S]*GPS tracking window/,
);

const owner = read("src/components/OwnerPaidBookingsPanel.tsx");
assert.match(owner, /Driver on the way/);
assert.match(owner, /Driver has arrived/);
assert.match(owner, /ownerUpcomingPrimaryJourneyActions/);
assert.match(owner, /openArrivalWhatsAppForBooking/);
assert.match(owner, /openOnTheWayWhatsAppForBooking/);
assert.doesNotMatch(owner, /🚕 Arrived at Pickup/);

const sharedWa = read("shared/arrival-whatsapp.ts");
const workerWa = read("workers/addresses/shared/arrival-whatsapp.ts");
assert.match(sharedWa, /buildDriverOnTheWayWhatsAppMessage/);
assert.match(workerWa, /buildDriverOnTheWayWhatsAppMessage/);
assert.equal(sharedWa, workerWa, "worker shared arrival-whatsapp must match shared/");

const sharedEmail = read("shared/booking-notifications.ts");
const workerEmail = read("workers/addresses/shared/booking-notifications.ts");
assert.match(sharedEmail, /buildDriverOnTheWayEmail/);
assert.match(workerEmail, /buildDriverOnTheWayEmail/);

const data = read("src/lib/data.ts");
assert.match(data, /liveDriverTracking:\s*false/);
assert.match(data, /We do not use a website live-tracking page/);

const trackPage = read("src/app/track/page.tsx");
assert.match(trackPage, /Driver updates by email/);
assert.doesNotMatch(trackPage, /TrackPageClient/);
assert.match(trackPage, /Message us on WhatsApp/);

const cal = read("src/lib/owner-booking-calendar.ts");
assert.match(cal, /defaultOwnerCalendarView[\s\S]*return "month"/);

console.log("OK  driver/owner/worker wiring + website tracking retired + Month calendar default");

console.log("\nAll Driver on the way checks passed.");

