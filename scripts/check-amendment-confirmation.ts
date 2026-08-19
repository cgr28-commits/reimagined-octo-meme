/**
 * Canonical booking + updated confirmation + amendment repricing regressions.
 * Run: npx tsx scripts/check-amendment-confirmation.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  describeFareDifference,
  evaluateCustomerAmendmentAccess,
  materialFieldsChanged,
  summarizeAmendmentChanges,
} from "../shared/booking-amendment";
import {
  buildUpdatedBookingConfirmationEmail,
  type PaidBookingReceipt,
} from "../shared/booking-notifications";
import {
  mergePendingOnlyForMissingContactAudit,
  paidBookingRecordToReceipt,
} from "../shared/paid-booking-canonical";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import { saveQuotePayloadBlockMessage } from "../src/lib/save-quote-payload";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function baseRecord(overrides: Partial<PaidBookingRecord> = {}): PaidBookingRecord {
  return {
    paymentReference: "MAT-TEST-001",
    checkoutId: "chk_old",
    amount: 70,
    currency: "GBP",
    amountPaidLabel: "£70.00",
    customerName: "Alex Customer",
    customerEmail: "alex@example.com",
    mobileNumber: "07700900000",
    tripLabel: "Airport drop-off",
    pickupLabel: "1 Old Street, Belfast",
    dropoffLabel: "Belfast International Airport",
    returnJourney: false,
    tripDate: "2026-08-25",
    tripTime: "10:00",
    passengers: 2,
    suitcases: 2,
    vehicle: "Standard Saloon (1–4 passengers)",
    isAirportTrip: true,
    airportCode: "BFS",
    isFromAirport: false,
    calendarEventIds: ["evt1"],
    status: "confirmed",
    operationalStatus: "confirmed",
    paymentStatus: "paid",
    createdAt: "2026-08-19T10:00:00.000Z",
    ...overrides,
  };
}

function run() {
  console.log("=== 1. Canonical receipt uses amended pickup, ignores pending snapshot ===");
  const amended = baseRecord({ pickupLabel: "Main Street, Bangor, BT20" });
  const pendingStale = {
    customerName: "Alex Customer",
    customerEmail: "alex@example.com",
    mobileNumber: "07700900000",
    tripLabel: "Airport drop-off",
    pickupLabel: "1 Old Street, Belfast",
    dropoffLabel: "Belfast International Airport",
    returnJourney: false,
    tripDate: "2026-08-25",
    tripTime: "10:00",
    returnDate: "",
    returnTime: "",
    flightNumber: "",
    passengers: 2,
    suitcases: 2,
    vehicle: "Standard Saloon (1–4 passengers)",
    isAirportTrip: true,
    airportCode: "BFS",
    isFromAirport: false,
  };
  const receipt = paidBookingRecordToReceipt(amended);
  assert.equal(receipt.pickupLabel, "Main Street, Bangor, BT20");
  assert.notEqual(receipt.pickupLabel, pendingStale.pickupLabel);
  const merged = mergePendingOnlyForMissingContactAudit(amended, pendingStale);
  assert.equal(merged.pickupLabel, "Main Street, Bangor, BT20");

  console.log("=== 2. Updated confirmation email uses new pickup + subject format ===");
  const email = buildUpdatedBookingConfirmationEmail(receipt as PaidBookingReceipt, "My Airport Taxi NI", {
    whatChanged: ["Pickup address updated"],
    fareNote: "No change to your fare",
  });
  assert.equal(email.subject, "Updated Booking Confirmation – MAT-TEST-001");
  assert.match(email.text, /Your booking has been updated/);
  assert.match(email.text, /Main Street, Bangor, BT20/);
  assert.doesNotMatch(email.text, /1 Old Street, Belfast/);
  assert.match(email.html, /Your booking has been updated/);

  console.log("=== 3. Owner edit / resend handlers never prefer pending checkout ===");
  const editHandlers = fs.readFileSync(
    path.join(root, "workers/addresses/src/paid-booking-edit-handlers.ts"),
    "utf8",
  );
  assert.match(editHandlers, /paidBookingRecordToReceipt|sendUpdatedConfirmation/);
  assert.doesNotMatch(editHandlers, /loadBookingDetails/);
  assert.doesNotMatch(editHandlers, /getPendingCheckout/);
  assert.match(editHandlers, /automaticConfirmation:\s*true/);
  assert.match(editHandlers, /confirmationPickupLabel/);

  const paidHandlers = fs.readFileSync(
    path.join(root, "workers/addresses/src/paid-booking-handlers.ts"),
    "utf8",
  );
  assert.match(paidHandlers, /paidBookingRecordToReceipt/);
  assert.match(paidHandlers, /buildUpdatedBookingConfirmationEmail/);
  assert.doesNotMatch(paidHandlers, /if \(booking\?\.customerEmail\)/);
  assert.match(paidHandlers, /confirmationPickupLabel/);

  console.log("=== 4. 24h gate + material field detection + fare difference ===");
  const now12h = new Date("2026-08-24T22:00:00.000Z");
  const now48h = new Date("2026-08-23T10:00:00.000Z");
  const blocked = evaluateCustomerAmendmentAccess({
    booking: {
      tripDate: "2026-08-25",
      tripTime: "10:00",
      pickupLabel: "A",
      dropoffLabel: "B",
      passengers: 2,
      suitcases: 2,
      amount: 70,
      dateTimeAmendmentCount: 0,
      status: "paid",
      operationalStatus: "confirmed",
      paymentStatus: "paid",
    },
    proposed: { pickupLabel: "Bangor" },
    now: now12h,
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.reason, "within_24_hours");

  const allowed = evaluateCustomerAmendmentAccess({
    booking: {
      tripDate: "2026-08-25",
      tripTime: "10:00",
      pickupLabel: "A",
      dropoffLabel: "B",
      passengers: 2,
      suitcases: 2,
      amount: 70,
      dateTimeAmendmentCount: 0,
      status: "paid",
      operationalStatus: "confirmed",
      paymentStatus: "paid",
    },
    proposed: { pickupLabel: "Bangor", tripDate: "2026-08-26", tripTime: "11:00" },
    now: now48h,
  });
  assert.equal(allowed.ok, true);
  if (allowed.ok) assert.equal(allowed.farePreserved, false);

  const changed = materialFieldsChanged(
    {
      tripDate: "2026-08-25",
      tripTime: "10:00",
      pickupLabel: "A",
      dropoffLabel: "B",
      passengers: 2,
      suitcases: 1,
    },
    { pickupLabel: "Bangor", passengers: 3, suitcases: 4 },
  );
  assert.ok(changed.includes("pickupLabel"));
  assert.ok(changed.includes("passengers"));
  assert.ok(changed.includes("suitcases"));

  assert.equal(describeFareDifference(70, 84).kind, "additional_payment");
  assert.equal(describeFareDifference(84, 70).kind, "refund_due");
  assert.equal(describeFareDifference(70, 70).kind, "none");
  assert.equal(describeFareDifference(70, 70).label, "No change to your fare");

  console.log("=== 5. What-changed summary + Save Quote regression preserved ===");
  const what = summarizeAmendmentChanges(
    { pickupLabel: "Old", tripTime: "10:00" },
    { pickupLabel: "New", tripTime: "11:00" },
  );
  assert.ok(what.some((line) => /Pickup address/i.test(line)));
  assert.ok(what.some((line) => /Pickup time/i.test(line)));

  assert.doesNotMatch(saveQuotePayloadBlockMessage("missing_schedule"), /no longer available/i);
  const modal = fs.readFileSync(path.join(root, "src/components/SaveQuoteModal.tsx"), "utf8");
  assert.doesNotMatch(
    modal,
    /Your quote is no longer available\. Please recalculate and try again\./,
  );

  console.log("=== 6. Owner UI resend-only wording ===");
  const panel = fs.readFileSync(
    path.join(root, "src/components/OwnerPaidBookingsPanel.tsx"),
    "utf8",
  );
  assert.match(panel, /Resend Updated Confirmation/);
  assert.doesNotMatch(panel, /"Send Updated Confirmation"/);
  assert.doesNotMatch(panel, /Send Updated Booking Confirmation/);

  console.log("=== 7. Customer amend handler reprice + auto email + refund-due ===");
  const amendHandlers = fs.readFileSync(
    path.join(root, "workers/addresses/src/booking-amendment-handlers.ts"),
    "utf8",
  );
  assert.match(amendHandlers, /calculateAuthoritativeWebsiteQuote/);
  assert.match(amendHandlers, /additional_payment_required/);
  assert.match(amendHandlers, /refundDueAmount/);
  assert.match(amendHandlers, /sendUpdatedConfirmationForPaymentReference/);
  assert.match(amendHandlers, /farePreserved:\s*false/);
  assert.doesNotMatch(amendHandlers, /amountPaidLabel:\s*`£\$\{newFare/);
  assert.match(amendHandlers, /buildLowerFareAmendmentFareNote|Refund due:/);

  console.log("check-amendment-confirmation: all assertions passed");
}

run();
