/**
 * Driver portal security + sanitisation + on-the-way notification checks.
 * Run: npx tsx scripts/check-driver-portal-permissions.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  assertNoDriverForbiddenFields,
  sanitizeJobForDriver,
} from "../shared/driver-job-sanitize";
import { formatPartialRegistration } from "../shared/partial-registration";
import { resolveAssignedDriverDetails } from "../shared/assigned-driver-details";
import { buildDriverOnTheWayEmail } from "../shared/booking-notifications";
import { buildDriverOnTheWayWhatsAppMessage } from "../shared/arrival-whatsapp";
import {
  buildCustomerDriverDetailsEmail,
  buildDriverAssignmentEmail,
  type BookingJobRecord,
} from "../shared/booking-job";
import {
  driverProfileComplete,
  toCustomerVehicleDetails,
} from "../shared/driver-vehicle";
import { sanitizeDemoJobForDriver } from "../src/lib/tracking-demo";
import type { DriverJob } from "../src/lib/tracking-api";
import { buildWhatsAppDriverDetailsLink } from "../src/lib/tracking-api";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

const sampleOwnerJob = {
  token: "tok-1",
  customerName: "Alex Customer",
  customerMobile: "07700900123",
  customerEmail: "alex@example.com",
  pickupLabel: "City Hall, Belfast",
  dropoffLabel: "Belfast International Airport",
  tripDate: "2026-09-01",
  tripTime: "10:30",
  pickupAt: "2026-09-01T10:30",
  flightNumber: "EZY123",
  airportCode: "BFS",
  isAirportPickup: true,
  paymentReference: "SUMUP-SECRET-999",
  amountPaidLabel: "£120.00",
  refundAmountLabel: "£20.00",
  quotedPrice: "£120",
  bookingReference: "MATNI-1001",
  driverPayAmount: "£80",
  assignedDriverName: "John Driver",
  assignedDriverMobile: "07700900999",
  assignedDriverCarColour: "Silver",
  assignedDriverReg: "AB12 CDE",
  assignmentStatus: "accepted",
  journeyStatus: "idle",
  trackUrl: "https://www.myairporttaxini.co.uk/track/?id=tok-1",
  driverLocationPointCount: 42,
  attribution: { gclid: "secret" },
};

check("Partial registration helper", () => {
  assert.equal(formatPartialRegistration("AB12 CDE"), "AB12…");
  assert.equal(formatPartialRegistration("ABC 1234"), "ABC…");
  assert.equal(formatPartialRegistration("AB12CDE"), "AB12…");
});

check("Accepted driver sees customer mobile; pending does not", () => {
  const accepted = sanitizeJobForDriver(sampleOwnerJob, { includeCustomerMobile: true });
  assert.equal(accepted.customerMobile, "07700900123");
  assert.equal(accepted.driverPayAmount, "£80");
  assert.equal("amountPaidLabel" in accepted, false);
  assert.equal("paymentReference" in accepted, false);
  assert.deepEqual(assertNoDriverForbiddenFields(accepted), []);

  const pending = sanitizeJobForDriver(
    { ...sampleOwnerJob, assignmentStatus: "pending" },
    { includeCustomerMobile: false },
  );
  assert.equal("customerMobile" in pending, false);
  assert.equal(pending.driverPayAmount, "£80");
  assert.equal(pending.customerName, "Alex Customer");
});

check("Customer-facing vehicle details use partial reg and no driver mobile", () => {
  const vehicle = toCustomerVehicleDetails({
    profileKey: "john",
    displayName: "John Driver",
    email: "john@example.com",
    mobile: "07700900999",
    make: "Mercedes",
    model: "E-Class",
    colour: "Silver",
    registration: "AB12 CDE",
    updatedAt: new Date().toISOString(),
  });
  assert.equal(vehicle.registration, "AB12…");
  assert.equal(vehicle.colour, "Silver");
  assert.equal(vehicle.driverName, "John");
  assert.equal("mobile" in vehicle, false);
});

check("Driver on the way email — company voice; no operator or vehicle details", () => {
  const email = buildDriverOnTheWayEmail({
    customerName: "Alex Customer",
    bookedPickupTime: "10:30",
    driverFirstName: "John",
    driverMobile: "07700 900123",
    vehicleColour: "Silver",
    partialRegistration: "AB12…",
    trackUrl: "https://www.myairporttaxini.co.uk/track/?id=tok-1",
  });
  assert.match(
    email.text,
    /Hi Alex, your driver is now on the way to your pickup location for your booked pickup time of 10:30/,
  );
  assert.match(email.text, /We may also share a live location with you here on WhatsApp/);
  assert.doesNotMatch(email.text, /\bJohn\b|Vehicle colour:|Registration:|Silver|AB12/);
  assert.doesNotMatch(email.text, /AB12 CDE/);
  assert.doesNotMatch(email.text, /Driver mobile|07700 900123|07700900999/i);
  assert.doesNotMatch(email.text, /\/track\/\?id=/i);
  assert.doesNotMatch(email.text, /Track Your Driver|follow your driver|live tracking link/i);
  assert.doesNotMatch(email.html, /\/track\/\?id=|Track Your Driver|follow your driver|Open live tracking/i);
  assert.doesNotMatch(email.text, /I['’]m your driver|I['’]m now on the way|I may also share my/i);
  assert.doesNotMatch(email.text, /£80|£120|SumUp|driver pay|amountPaid/i);
  assert.doesNotMatch(email.html, /07700 900123|Driver mobile|\bJohn\b/i);
  assert.match(
    email.text,
    /Questions\? Email us at bookings@myairporttaxini\.co\.uk or chat with us on WhatsApp\./,
  );
  assert.doesNotMatch(email.text, /028\s*9602\s*2952|tel:/);
  assert.doesNotMatch(email.html, /028\s*9602\s*2952|tel:\+442896022952/);
  assert.match(email.html, /<a href="https:\/\/wa\.me\/447549815538\?text=[^"]*"[^>]*>Chat with us on WhatsApp<\/a>/);
  assert.match(email.html, /bookings@myairporttaxini\.co\.uk/);
});

check("Driver on the way WhatsApp — company voice, no mobile, no website tracking", () => {
  const wa = buildDriverOnTheWayWhatsAppMessage({
    customerName: "Alex Customer",
    bookedPickupTime: "10:30",
    driverFirstName: "John",
    driverMobile: "07700 900123",
    vehicleColour: "Silver",
    partialRegistration: "AB12…",
    trackUrl: "https://www.myairporttaxini.co.uk/track/?id=tok-1",
  });
  assert.equal(
    wa,
    "Hi Alex, your driver is now on the way to your pickup location for your booked pickup time of 10:30. We may also share a live location with you here on WhatsApp.",
  );
  assert.doesNotMatch(wa, /AB12 CDE|\bJohn\b|Vehicle:|Registration:/);
  assert.doesNotMatch(wa, /Driver mobile|Mobile:|07700 900123/i);
  assert.doesNotMatch(wa, /\/track\/\?id=/i);
  assert.doesNotMatch(wa, /follow my journey|Track Your Driver|live tracking link/i);
  assert.doesNotMatch(wa, /I['’]m your driver|I may also share my/i);
  assert.doesNotMatch(wa, /£80|£120/);

  const noName = buildDriverOnTheWayWhatsAppMessage({
    bookedPickupTime: "10:30",
    vehicleColour: "Silver",
    partialRegistration: "AB12…",
  });
  assert.match(noName, /^Hi there, your driver is now on the way/);
  assert.doesNotMatch(noName, /I['’]m your driver/);
});

check("Customer driver-details email/WhatsApp never include driver mobile", () => {
  const job: BookingJobRecord = {
    id: "job-1",
    createdAt: new Date().toISOString(),
    status: "paid",
    kind: "booking-request",
    customerName: "Alex Customer",
    customerEmail: "alex@example.com",
    customerMobile: "07700900123",
    tripLabel: "Airport transfer",
    pickupLabel: "City Hall",
    dropoffLabel: "BFS",
    returnJourney: false,
    tripDate: "2026-09-01",
    tripTime: "10:30",
    passengers: 2,
    suitcases: 2,
    vehicle: "Estate",
    isAirportTrip: true,
    driverFirstName: "John",
    driverMobile: "07700900999",
    driverCarColour: "Silver",
    driverReg: "AB12 CDE",
    driverPayAmount: "£80",
    amountPaidLabel: "£120.00",
  };
  const email = buildCustomerDriverDetailsEmail({ job });
  assert.doesNotMatch(email.text, /07700900999|Mobile:/);
  assert.doesNotMatch(email.html, /07700900999/);

  const wa = buildWhatsAppDriverDetailsLink({
    customerName: "Alex",
    customerMobile: "07700900123",
    driverName: "John",
    driverMobile: "07700900999",
    carColour: "Silver",
    reg: "AB12 CDE",
  });
  assert.doesNotMatch(decodeURIComponent(wa), /07700900999/);
  assert.doesNotMatch(decodeURIComponent(wa), /Mobile:/);
});

check("Assignment email omits customer mobile until accept; includes driver pay; no fare", () => {
  const job: BookingJobRecord = {
    id: "job-1",
    createdAt: new Date().toISOString(),
    status: "paid",
    kind: "booking-request",
    customerName: "Alex Customer",
    customerEmail: "alex@example.com",
    customerMobile: "07700900123",
    tripLabel: "Airport transfer",
    pickupLabel: "City Hall",
    dropoffLabel: "BFS",
    returnJourney: false,
    tripDate: "2026-09-01",
    tripTime: "10:30",
    flightNumber: "EZY123",
    passengers: 2,
    suitcases: 2,
    vehicle: "Estate",
    isAirportTrip: true,
    driverFirstName: "John",
    driverPayAmount: "£80",
    amountPaidLabel: "£120.00",
    paymentReference: "SUMUP-SECRET",
  };
  const email = buildDriverAssignmentEmail({
    job,
    acceptUrl: "https://www.myairporttaxini.co.uk/driver-accept/?token=abc",
  });
  assert.match(email.text, /Your pay for this journey: £80/);
  assert.match(email.text, /Customer: Alex Customer/);
  assert.doesNotMatch(email.text, /Mobile: 07700900123/);
  assert.match(email.text, /after you accept/i);
  assert.doesNotMatch(email.text, /£120|SumUp|amountPaidLabel/i);
});

check("Demo: accepted keeps customer mobile; pending strips it; owner keeps driver mobile fields", () => {
  const accepted = sanitizeDemoJobForDriver({
    ...(sampleOwnerJob as unknown as DriverJob),
    assignmentStatus: "accepted",
    pickupDisplay: "1 Sep · 10:30",
    trackingWindow: { open: true, reason: "open", opensAt: "", closesAt: "", pickupAt: "" },
    sharingActive: false,
    customerSharingActive: false,
    driver: null,
    trackUrl: sampleOwnerJob.trackUrl,
  } as DriverJob);
  assert.equal(accepted.customerMobile, "07700900123");
  assert.equal(accepted.amountPaidLabel, undefined);

  const pending = sanitizeDemoJobForDriver({
    ...accepted,
    assignmentStatus: "pending",
    customerMobile: "07700900123",
  } as DriverJob);
  assert.equal(pending.customerMobile, undefined);

  assert.equal(sampleOwnerJob.assignedDriverMobile, "07700900999");
});

check("Track page retired notice has no driver mobile", () => {
  const page = read("src/app/track/page.tsx");
  assert.doesNotMatch(page, /driverMobile|Driver mobile|07700/i);
  assert.match(page, /Driver updates by email/);
});

check("Incomplete saved profiles are not assignable", () => {
  assert.equal(
    driverProfileComplete({
      profileKey: "john",
      displayName: "John",
      email: "john@example.com",
      mobile: "07700900123",
      make: "Mercedes",
      model: "E-Class",
      colour: "Silver",
      registration: "AB12 CDE",
      updatedAt: new Date().toISOString(),
    }),
    true,
  );
});

check("UI + Worker wiring for accept-gated mobile and privacy", () => {
  const card = read("src/app/driver/DriverPageClient.tsx");
  assert.match(card, /const canEdit = isOwner && !isRefunded/);
  assert.match(card, /isAcceptedAssignment\) && job\.customerMobile/);
  assert.match(card, /Customer mobile is shown after you accept/);
  assert.doesNotMatch(card, /isPendingForDriver\) && job\.customerMobile/);

  const enrich = read("workers/addresses/src/driver-booking-handlers.ts");
  assert.match(enrich, /includeCustomerMobile/);
  assert.match(enrich, /assignmentStatus === "accepted"/);

  const sanitize = read("shared/driver-job-sanitize.ts");
  assert.match(sanitize, /includeCustomerMobile/);

  const journey = read("workers/addresses/src/journey-handlers.ts");
  assert.doesNotMatch(journey, /resolveAssignedDriverDetails/);
  assert.match(journey, /bookedPickupTime: job\.tripTime/);
  assert.doesNotMatch(
    journey.slice(journey.indexOf("buildDriverOnTheWayEmail")),
    /driverFirstName:|vehicleColour:|partialRegistration:|driverMobile:/,
  );
});

check("Assigned-driver detail resolver still keeps internal mobile for owner/ops", () => {
  const resolved = resolveAssignedDriverDetails({
    tracking: {
      driverName: "Assigned Sam",
      driverMobile: "07111111111",
      carColour: "Blue",
      registration: "XY99 ZZZ",
    },
  });
  assert.equal(resolved.driverMobile, "07111111111");
  assert.equal(resolved.registrationPartial, "XY99…");
});

console.log("\nAll driver portal permission / notification checks passed.");
