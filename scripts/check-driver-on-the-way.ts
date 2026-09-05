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
  BUSINESS_MAILBOX,
  BUSINESS_WHATSAPP_DIGITS,
  businessWhatsAppChatUrl,
  businessWhatsAppPublicPageUrl,
} from "../shared/business-email";
import {
  buildArrivedPickupWhatsAppMessage,
  buildDriverOnTheWayWhatsAppMessage,
} from "../shared/arrival-whatsapp";
import { SITE } from "../src/lib/data";
import { formatPartialRegistration } from "../shared/partial-registration";
import { applyJourneyAction, customerJourneyLabel } from "../shared/tracking";

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function visibleHtmlText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
}

function assertJourneyStatusContactFooter(
  email: { text: string; html: string },
  label: string,
) {
  const visible = visibleHtmlText(email.html);
  assert.match(
    email.text,
    /Questions\? Email us at bookings@myairporttaxini\.co\.uk or chat with us on WhatsApp\./,
    `${label}: exact questions footer`,
  );
  assert.match(email.text, new RegExp(BUSINESS_MAILBOX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(
    email.text,
    new RegExp(businessWhatsAppPublicPageUrl().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.doesNotMatch(email.text, /wa\.me\/\d+/, `${label}: plain-text must not expose a WhatsApp number`);
  assert.doesNotMatch(email.text, /028\s*9602\s*2952|02896022952/);
  assert.doesNotMatch(email.text, /\+44\s*2896\s*022952|442896022952/);
  assert.doesNotMatch(email.text, /07549\s*815538|07549815538|447549815538/);
  assert.doesNotMatch(email.text, /07700\s*900123|07700900123/);
  assert.doesNotMatch(email.text, /tel:/);
  assert.doesNotMatch(email.html, /028\s*9602\s*2952|tel:\+442896022952/);
  assert.doesNotMatch(email.html, /07700\s*900123|07549\s*815538|07549815538/);
  assert.doesNotMatch(visible, /028\s*9602|07\d{3}\s*\d{6}|447549815538/);
  assert.match(email.html, new RegExp(BUSINESS_MAILBOX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const chatHref = businessWhatsAppChatUrl().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    email.html,
    new RegExp(`<a href="${chatHref}"[^>]*>Chat with us on WhatsApp</a>`),
    `${label}: HTML WhatsApp control must be a clickable Chat with us on WhatsApp link`,
  );
  assert.equal(
    businessWhatsAppChatUrl(),
    `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(SITE.whatsappDefaultMessage)}`,
  );
  assert.equal(BUSINESS_WHATSAPP_DIGITS, SITE.whatsapp);
}

/** Retired website GPS / Track Your Driver wording must never appear in customer on-the-way copy. */
function assertNoWebsiteTrackingCopy(content: string, label: string) {
  assert.doesNotMatch(content, /\/track\/\?id=/i, `${label}: must not include /track/?id= URL`);
  assert.doesNotMatch(content, /Track Your Driver/i, `${label}: must not say Track Your Driver`);
  assert.doesNotMatch(content, /follow my journey/i, `${label}: must not say follow my journey`);
  assert.doesNotMatch(content, /follow your driver/i, `${label}: must not say follow your driver`);
  assert.doesNotMatch(content, /live tracking link/i, `${label}: must not say live tracking link`);
  assert.doesNotMatch(content, /Open live tracking/i, `${label}: must not say Open live tracking`);
}

console.log("=== Arrival WhatsApp company voice (no vehicle) ===");
const street = buildArrivedPickupWhatsAppMessage({ isAirportPickup: false });
assert.match(street, /🚕 Your driver has arrived/);
assert.match(street, /ready when you are/);
assert.doesNotMatch(street, /Registration:|Your vehicle:/);
const airport = buildArrivedPickupWhatsAppMessage({
  isAirportPickup: true,
  pickupLabel: "Belfast International Airport",
  airportCode: "BFS",
  airportAccessOption: "express",
  vehicle: { colour: "Black", make: "Mercedes", model: "E-Class", registration: "ABC123" },
});
assert.match(airport, /✈️ Your driver has arrived/);
assert.match(airport, /Please make your way to Express Pick-Up\./);
assert.doesNotMatch(airport, /waiting there|My Airport Taxi NI driver/);
assert.doesNotMatch(airport, /Registration: ABC123|Your vehicle:|Mercedes/);
console.log("OK  arrival WhatsApp company voice; vehicle details ignored");

console.log("\n=== Driver on the way email wording ===");
const email = buildDriverOnTheWayEmail({
  customerName: "Alex Customer",
  bookedPickupTime: "10:00",
  driverFirstName: "John",
  driverMobile: "07700 900123",
  vehicleColour: "Silver",
  partialRegistration: formatPartialRegistration("AB12 CDE"),
  trackUrl: "https://www.myairporttaxini.co.uk/track/?id=demo",
});
assert.match(email.subject, /Your driver is on the way — My Airport Taxi NI/);
assert.match(
  email.text,
  /^Hi Alex, your driver is now on the way to your pickup location for your booked pickup time of 10:00\. We may also share a live location with you here on WhatsApp\./,
);
assert.doesNotMatch(email.text, /\bJohn\b|Vehicle colour:|Registration:|AB12|Silver/);
assert.doesNotMatch(email.text, /AB12 CDE/);
assert.doesNotMatch(email.text, /Driver mobile|07700 900123/i);
assert.doesNotMatch(email.text, /I['’]m your driver|I['’]m now on the way|I may also share/i);
assertNoWebsiteTrackingCopy(email.text, "on-the-way email text");
assertNoWebsiteTrackingCopy(email.html, "on-the-way email html");
assert.doesNotMatch(email.text, /£80|£120|SumUp|driver pay/i);
assertJourneyStatusContactFooter(email, "on-the-way email");
console.log("OK  on-the-way email generated; no website tracking; WhatsApp Live Location wording kept");

console.log("\n=== Arrival email still separate ===");
const arrival = buildDriverArrivedPickupEmail({
  customerName: "Alex Customer",
  driverMobile: "07700 900123",
});
assert.match(arrival.subject, /Your driver has arrived/);
assert.doesNotMatch(arrival.subject, /Driver on the way/);
assertJourneyStatusContactFooter(arrival, "arrival email");
console.log("OK  arrival email separate; landline removed; WhatsApp chat link added");

console.log("\n=== On-the-way WhatsApp (company voice) ===");
const wa = buildDriverOnTheWayWhatsAppMessage({
  customerName: "Alex Customer",
  bookedPickupTime: "10:00",
  driverFirstName: "John",
  driverMobile: "07700 900123",
  vehicleColour: "Silver",
  partialRegistration: "AB12…",
  trackUrl: "https://www.myairporttaxini.co.uk/track/?id=demo",
});
assert.equal(
  wa,
  "Hi Alex, your driver is now on the way to your pickup location for your booked pickup time of 10:00. We may also share a live location with you here on WhatsApp.",
);
assert.doesNotMatch(wa, /\bJohn\b|Vehicle:|Registration:|Silver|AB12/);
assert.doesNotMatch(wa, /Driver mobile|Mobile:|07700 900123/i);
assert.doesNotMatch(wa, /I['’]m your driver|I['’]m now on the way|I may also share my/i);
assertNoWebsiteTrackingCopy(wa, "on-the-way WhatsApp");
assert.doesNotMatch(wa, /£80|£120|SumUp|driver pay/i);
console.log("OK  company-voice WhatsApp generated; no website tracking; no personal/vehicle details");

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
assert.doesNotMatch(handlers, /resolveAssignedDriverDetails/);
assert.match(handlers, /bookedPickupTime: job\.tripTime/);
assert.doesNotMatch(
  handlers,
  /driverFirstName:|vehicleColour:|partialRegistration:/,
  "on-the-way email must not pass operator or vehicle details",
);

const labels = read("src/lib/tracking-api.ts");
assert.match(labels, /start_tracking:\s*"Driver on the way"/);

const driver = read("src/app/driver/DriverPageClient.tsx");
assert.match(driver, /buildDriverOnTheWayWhatsAppLink/);
assert.match(driver, /customerName: job\.customerName/);
assert.match(driver, /bookedPickupTime: job\.tripTime/);
assert.doesNotMatch(driver, /partialRegistration: formatPartialRegistration\(job\.assignedDriverReg\)/);
const driverOnTheWayCall = driver.slice(
  driver.indexOf("buildDriverOnTheWayWhatsAppLink(mobile, {"),
  driver.indexOf("buildDriverOnTheWayWhatsAppLink(mobile, {") + 280,
);
assert.doesNotMatch(driverOnTheWayCall, /driverFirstName:|vehicleColour:|partialRegistration:/);

const owner = read("src/components/OwnerPaidBookingsPanel.tsx");
assert.match(owner, /openOnTheWayWhatsAppForBooking/);
assert.match(owner, /customerName: booking\.customerName/);
assert.match(owner, /bookedPickupTime: activeLegPickupTime\(booking\)/);
assert.doesNotMatch(owner, /driverFirstName: booking\.assignedDriverName/);

const sharedWa = read("shared/arrival-whatsapp.ts");
const workerWa = read("workers/addresses/shared/arrival-whatsapp.ts");
assert.equal(sharedWa, workerWa, "worker shared arrival-whatsapp must match shared/");

const sharedEmail = read("shared/booking-notifications.ts");
const workerEmail = read("workers/addresses/shared/booking-notifications.ts");
assert.equal(sharedEmail, workerEmail, "worker shared booking-notifications must match shared/");

const sharedVoice = read("shared/company-voice-journey.ts");
const workerVoice = read("workers/addresses/shared/company-voice-journey.ts");
assert.equal(sharedVoice, workerVoice, "worker shared company-voice-journey must match shared/");

const data = read("src/lib/data.ts");
assert.match(data, /liveDriverTracking:\s*false/);

const trackPage = read("src/app/track/page.tsx");
assert.match(trackPage, /Driver updates by email/);
assert.doesNotMatch(trackPage, /TrackPageClient/);
assert.doesNotMatch(trackPage, /driverMobile|Driver mobile/i);

console.log("OK  wiring + privacy");

console.log("\nAll Driver on the way checks passed.");
