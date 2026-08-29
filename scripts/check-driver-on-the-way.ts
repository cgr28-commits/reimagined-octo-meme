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
import { formatPartialRegistration } from "../shared/partial-registration";
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
const email = buildDriverOnTheWayEmail({
  customerName: "Alex Customer",
  driverFirstName: "John",
  driverMobile: "07700 900123",
  vehicleColour: "Silver",
  partialRegistration: formatPartialRegistration("AB12 CDE"),
  trackUrl: "https://www.myairporttaxini.co.uk/track/?id=demo",
});
assert.match(email.subject, /Your driver is on the way — My Airport Taxi NI/);
assert.match(email.text, /Your driver is on the way/);
assert.match(email.text, /Your My Airport Taxi NI driver, John, is now on the way/);
assert.match(email.text, /Vehicle colour: Silver/);
assert.match(email.text, /Registration: AB12…/);
assert.doesNotMatch(email.text, /AB12 CDE/);
assert.doesNotMatch(email.text, /Driver mobile|07700 900123/i);
assert.match(
  email.text,
  /Your driver may also contact you or share their live location with you through WhatsApp/,
);
assert.match(email.text, /track\/\?id=demo/);
assert.doesNotMatch(email.text, /£80|£120|SumUp|driver pay/i);
console.log("OK  on-the-way email privacy-safe + may contact via WhatsApp");

console.log("\n=== Arrival email still separate ===");
const arrival = buildDriverArrivedPickupEmail({ customerName: "Alex Customer" });
assert.match(arrival.subject, /Your driver has arrived/);
assert.doesNotMatch(arrival.subject, /Driver on the way/);
console.log("OK  arrival email untouched");

console.log("\n=== On-the-way WhatsApp (driver voice) ===");
const wa = buildDriverOnTheWayWhatsAppMessage({
  driverFirstName: "John",
  driverMobile: "07700 900123",
  vehicleColour: "Silver",
  partialRegistration: "AB12…",
  trackUrl: "https://www.myairporttaxini.co.uk/track/?id=demo",
});
assert.match(wa, /^Hi, I'm John, your driver for My Airport Taxi NI/);
assert.match(wa, /I may also share my live location with you here on WhatsApp/);
assert.match(wa, /Registration: AB12…/);
assert.doesNotMatch(wa, /Driver mobile|Mobile:|07700 900123/i);
assert.match(wa, /follow my journey here/);
console.log("OK  driver-sent WhatsApp identifies sender; no driver mobile");

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

console.log("\n=== Idempotency wiring ===");
const handlers = read("workers/addresses/src/journey-handlers.ts");
assert.match(handlers, /sendOnTheWayNotificationIfNeeded/);
assert.match(handlers, /action === "start_tracking"/);
assert.match(handlers, /buildDriverOnTheWayEmail/);
assert.match(handlers, /onTheWayNotificationStatus === "sent"/);
assert.match(handlers, /resolveAssignedDriverDetails/);

const labels = read("src/lib/tracking-api.ts");
assert.match(labels, /start_tracking:\s*"Driver on the way"/);

const driver = read("src/app/driver/DriverPageClient.tsx");
assert.match(driver, /buildDriverOnTheWayWhatsAppLink/);
assert.match(driver, /formatPartialRegistration/);

const owner = read("src/components/OwnerPaidBookingsPanel.tsx");
assert.match(owner, /openOnTheWayWhatsAppForBooking/);

const sharedWa = read("shared/arrival-whatsapp.ts");
const workerWa = read("workers/addresses/shared/arrival-whatsapp.ts");
assert.equal(sharedWa, workerWa, "worker shared arrival-whatsapp must match shared/");

const sharedEmail = read("shared/booking-notifications.ts");
const workerEmail = read("workers/addresses/shared/booking-notifications.ts");
assert.equal(sharedEmail, workerEmail, "worker shared booking-notifications must match shared/");

const data = read("src/lib/data.ts");
assert.match(data, /liveDriverTracking:\s*false/);

const trackPage = read("src/app/track/page.tsx");
assert.match(trackPage, /Driver updates by email/);
assert.doesNotMatch(trackPage, /TrackPageClient/);
assert.doesNotMatch(trackPage, /driverMobile|Driver mobile/i);

console.log("OK  wiring + privacy");

console.log("\nAll Driver on the way checks passed.");
