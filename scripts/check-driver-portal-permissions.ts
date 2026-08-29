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
import {
  buildDriverOnTheWayEmail,
} from "../shared/booking-notifications";
import {
  buildDriverOnTheWayWhatsAppMessage,
} from "../shared/arrival-whatsapp";
import { buildDriverAssignmentEmail, type BookingJobRecord } from "../shared/booking-job";
import { driverProfileComplete } from "../shared/driver-vehicle";
import { sanitizeDemoJobForDriver } from "../src/lib/tracking-demo";
import type { DriverJob } from "../src/lib/tracking-api";

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
  assert.equal(formatPartialRegistration(""), "");
});

check("sanitizeJobForDriver whitelist — pay in, fare/payment/refund out", () => {
  const sanitized = sanitizeJobForDriver(sampleOwnerJob);
  assert.equal(sanitized.driverPayAmount, "£80");
  assert.equal(sanitized.customerName, "Alex Customer");
  assert.equal(sanitized.customerMobile, "07700900123");
  assert.equal(sanitized.assignedDriverRegPartial, "AB12…");
  assert.equal(sanitized.flightNumber, "EZY123");
  assert.equal(sanitized.bookingReference, "MATNI-1001");

  assert.equal("amountPaidLabel" in sanitized, false);
  assert.equal("paymentReference" in sanitized, false);
  assert.equal("refundAmountLabel" in sanitized, false);
  assert.equal("quotedPrice" in sanitized, false);
  assert.equal("customerEmail" in sanitized, false);
  assert.equal("attribution" in sanitized, false);
  assert.equal("driverLocationPointCount" in sanitized, false);

  assert.deepEqual(assertNoDriverForbiddenFields(sanitized), []);
});

check("Assigned-driver detail priority prefers tracking snapshot over owner fallback", () => {
  const resolved = resolveAssignedDriverDetails({
    tracking: {
      driverName: "Assigned Sam",
      driverMobile: "07111111111",
      carColour: "Blue",
      registration: "XY99 ZZZ",
    },
    booking: {
      driverName: "Booking Name",
      carColour: "Red",
      registration: "AA11 BBB",
    },
    ownerFallback: {
      driverName: "Owner",
      carColour: "Black",
      registration: "OWNER1",
    },
    ownerIsActiveDriver: true,
  });
  assert.equal(resolved.driverFirstName, "Assigned");
  assert.equal(resolved.carColour, "Blue");
  assert.equal(resolved.registrationPartial, "XY99…");
  assert.equal(resolved.driverMobile, "07111111111");
});

check("Driver on the way email — privacy-safe details, may share, no fare/pay", () => {
  const email = buildDriverOnTheWayEmail({
    customerName: "Alex Customer",
    driverFirstName: "John",
    vehicleColour: "Silver",
    partialRegistration: "AB12…",
    trackUrl: "https://www.myairporttaxini.co.uk/track/?id=tok-1",
  });
  assert.match(email.subject, /Your driver is on the way/);
  assert.match(email.text, /Alex/);
  assert.match(email.text, /Driver: John/);
  assert.match(email.text, /Vehicle colour: Silver/);
  assert.match(email.text, /Registration: AB12…/);
  assert.doesNotMatch(email.text, /AB12 CDE/);
  assert.doesNotMatch(email.text, /Driver mobile|07700 900123/i);
  assert.match(email.text, /track\/\?id=tok-1/);
  assert.match(
    email.text,
    /Your driver may also share their live location with you directly on WhatsApp/,
  );
  assert.doesNotMatch(email.text, /£80|£120|SumUp|payment reference|driver pay/i);
});

check("Driver on the way WhatsApp — matching privacy-safe details + may share", () => {
  const wa = buildDriverOnTheWayWhatsAppMessage({
    driverFirstName: "John",
    vehicleColour: "Silver",
    partialRegistration: "AB12…",
    trackUrl: "https://www.myairporttaxini.co.uk/track/?id=tok-1",
  });
  assert.match(wa, /Driver: John/);
  assert.match(wa, /Vehicle: Silver/);
  assert.match(wa, /Registration: AB12…/);
  assert.doesNotMatch(wa, /AB12 CDE/);
  assert.doesNotMatch(wa, /Driver mobile|07700 900123/i);
  assert.match(wa, /track\/\?id=tok-1/);
  assert.match(wa, /may also share their live location with you directly here on WhatsApp/);
  assert.doesNotMatch(wa, /will share|automatically share|£120|£80/i);
});

check("Assignment email includes driver pay and operational details, not customer fare", () => {
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
  assert.match(email.text, /Flight: EZY123/);
  assert.match(email.text, /driver-accept\/\?token=abc/);
  assert.doesNotMatch(email.text, /£120|SumUp|amountPaidLabel|margin/i);
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
  assert.equal(
    driverProfileComplete({
      profileKey: "john",
      displayName: "John",
      email: "john@example.com",
      make: "Mercedes",
      model: "E-Class",
      colour: "Silver",
      registration: "AB12 CDE",
      updatedAt: new Date().toISOString(),
    }),
    false,
  );
});

check("Demo driver sanitisation mirrors production whitelist", () => {
  const demo = sanitizeDemoJobForDriver({
    ...(sampleOwnerJob as unknown as DriverJob),
    pickupDisplay: "1 Sep · 10:30",
    trackingWindow: {
      open: true,
      reason: "open",
      opensAt: "",
      closesAt: "",
      pickupAt: "",
    },
    sharingActive: false,
    customerSharingActive: false,
    driver: null,
    trackUrl: sampleOwnerJob.trackUrl,
  } as DriverJob);
  assert.equal(demo.driverPayAmount, "£80");
  assert.equal(demo.amountPaidLabel, undefined);
  assert.equal(demo.paymentReference, undefined);
});

check("UI + Worker wiring: owner-only edit, profile assign, sanitise, on-the-way", () => {
  const card = read("src/app/driver/DriverPageClient.tsx");
  assert.match(card, /const canEdit = isOwner && !isRefunded/);
  assert.doesNotMatch(card, /isAcceptedAssignment \|\| \(isPendingForDriver && job\.isAirportPickup\)/);
  assert.match(card, /Amount I am paying this driver/);
  assert.match(card, /Your pay for this journey/);
  assert.match(card, /driverProfileComplete/);
  assert.match(card, /formatPartialRegistration/);

  const bookingUpdate = read("workers/addresses/src/driver-booking-handlers.ts");
  assert.match(bookingUpdate, /booking edits require the owner access key/);
  assert.match(bookingUpdate, /ownerAuthorized/);

  const assign = read("workers/addresses/src/driver-assignment-handlers.ts");
  assert.match(assign, /assignedDriverCarColour/);
  assert.match(assign, /driverPayAmount/);
  assert.match(assign, /ownerAuthorized/);

  const auth = read("workers/addresses/src/driver-auth.ts");
  assert.match(auth, /sanitizeJobForDriver/);

  const journey = read("workers/addresses/src/journey-handlers.ts");
  assert.match(journey, /resolveAssignedDriverDetails/);
  assert.match(journey, /partialRegistration/);
  assert.match(journey, /onTheWayNotificationStatus === "sent"/);

  const refund = read("workers/addresses/src/refund-handlers.ts");
  assert.match(refund, /ownerAuthorized/);
});

console.log("\nAll driver portal permission / notification checks passed.");
