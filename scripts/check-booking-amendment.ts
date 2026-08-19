/**
 * Booking amendment policy + saved-quote schedule recalculation checks.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateCustomerDateTimeAmendment,
  savedQuoteScheduleChanged,
  FREE_CUSTOMER_DATE_TIME_AMENDMENTS,
} from "../shared/booking-amendment";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { lockSavedQuotePricingFromServer } from "../shared/saved-quote";
import { isWithin24HoursOfPickup } from "../shared/refund-ops";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function bookingBase(overrides: Record<string, unknown> = {}) {
  return {
    tripDate: "2026-08-25",
    tripTime: "10:00",
    pickupLabel: "Belfast City Hall",
    dropoffLabel: "Belfast International Airport",
    passengers: 2,
    suitcases: 2,
    status: "paid",
    operationalStatus: "confirmed" as const,
    paymentStatus: "paid" as const,
    dateTimeAmendmentCount: 0,
    amount: 55,
    amountRefunded: 0,
    ...overrides,
  };
}

function run() {
  const now48h = new Date("2026-08-23T10:00:00.000Z"); // ~48h before 25th 10:00 London (BST)
  const now12h = new Date("2026-08-24T22:00:00.000Z"); // within 24h of 25th 10:00 BST

  console.log("=== 1. Booking 48h away → first date/time amendment permitted ===");
  const ok = evaluateCustomerDateTimeAmendment({
    booking: bookingBase(),
    newTripDate: "2026-08-26",
    newTripTime: "11:00",
    now: now48h,
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.farePreserved, true);
    assert.equal(ok.amendmentsRemainingAfter, FREE_CUSTOMER_DATE_TIME_AMENDMENTS - 1);
  }

  console.log("=== 2. Booking 48h away → original journey fare preserved (policy) ===");
  assert.equal(ok.ok && ok.farePreserved, true);

  console.log("=== 3. Booking 12h away → automatic amendment rejected ===");
  assert.equal(isWithin24HoursOfPickup("2026-08-25", "10:00", now12h), true);
  const within = evaluateCustomerDateTimeAmendment({
    booking: bookingBase(),
    newTripDate: "2026-09-01",
    newTripTime: "10:00",
    now: now12h,
  });
  assert.equal(within.ok, false);
  if (!within.ok) {
    assert.equal(within.reason, "within_24_hours");
    assert.equal(within.contactRequired, true);
  }

  console.log("=== 4/5. Direct API path rejects within-24h (wiring + bypass protection) ===");
  const handlers = fs.readFileSync(
    path.join(root, "workers/addresses/src/booking-amendment-handlers.ts"),
    "utf8",
  );
  assert.match(handlers, /evaluateCustomerDateTimeAmendment/);
  assert.match(handlers, /within_24_hours/);
  assert.match(handlers, /403/);
  // Moving to a later date while inside 24h must still be rejected (cancellation bypass).
  const bypass = evaluateCustomerDateTimeAmendment({
    booking: bookingBase(),
    newTripDate: "2026-10-01",
    newTripTime: "09:00",
    now: now12h,
  });
  assert.equal(bypass.ok, false);
  if (!bypass.ok) assert.equal(bypass.reason, "within_24_hours");

  console.log("=== Free quota exhausted ===");
  const quota = evaluateCustomerDateTimeAmendment({
    booking: bookingBase({ dateTimeAmendmentCount: 1 }),
    newTripDate: "2026-08-26",
    newTripTime: "12:00",
    now: now48h,
  });
  assert.equal(quota.ok, false);
  if (!quota.ok) assert.equal(quota.reason, "free_quota_exhausted");

  console.log("=== 6. Saved quote date change → fare recalculated ===");
  assert.equal(
    savedQuoteScheduleChanged(
      { tripDate: "2026-08-25", tripTime: "10:00" },
      { tripDate: "2026-08-29", tripTime: "10:00" },
    ),
    true,
  );
  const weekday = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
    dropoffAddress: "Belfast International Airport",
    returnJourney: false,
    outboundDate: "2026-08-25", // Tue
    outboundTime: "10:00",
    passengers: 2,
    suitcases: 2,
  });
  const weekend = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
    dropoffAddress: "Belfast International Airport",
    returnJourney: false,
    outboundDate: "2026-08-29", // Sat
    outboundTime: "10:00",
    passengers: 2,
    suitcases: 2,
  });
  assert.equal(weekday.ok && weekend.ok, true);
  if (weekday.ok && weekend.ok) {
    // Locked weekday price must not be reused after a date change — server amount wins.
    const requoted = lockSavedQuotePricingFromServer({
      serverAmount: weekend.amount,
      clientSubmittedAmount: weekday.amount,
    });
    assert.equal(requoted.totalAmount, weekend.amount);
    if (Math.abs(weekday.amount - weekend.amount) >= 0.01) {
      assert.equal(
        (requoted.pricingMeta as { clientAmountMismatch?: boolean })?.clientAmountMismatch,
        true,
      );
    }
  }

  console.log("=== 7. Route/destination change → material change (repricing / contact) ===");
  const material = evaluateCustomerDateTimeAmendment({
    booking: bookingBase(),
    newTripDate: "2026-08-26",
    newTripTime: "11:00",
    proposedPickupLabel: "Somewhere Else",
    now: now48h,
  });
  assert.equal(material.ok, false);
  if (!material.ok) assert.equal(material.reason, "material_journey_change");

  console.log("=== 8. Amendment history retained (model + handler wiring) ===");
  const record = fs.readFileSync(path.join(root, "shared/paid-booking-record.ts"), "utf8");
  assert.match(record, /dateTimeAmendmentHistory/);
  assert.match(record, /dateTimeAmendmentCount/);
  assert.match(record, /originalTripDate/);
  assert.match(handlers, /dateTimeAmendmentHistory/);
  assert.match(handlers, /changedBy: \"Customer\"/);

  const index = fs.readFileSync(path.join(root, "workers/addresses/src/index.ts"), "utf8");
  assert.match(index, /isPaidBookingAmendSchedulePath/);
  assert.match(index, /handleCustomerAmendSchedule/);
  assert.match(index, /saved-quotes\/requote/);
  assert.match(index, /scheduleChanged/);
  assert.match(index, /buildAuthoritativeSavedQuotePricing/);

  const terms = fs.readFileSync(path.join(root, "src/lib/terms.ts"), "utf8");
  assert.match(terms, /Changes to Your Booking/);
  assert.match(terms, /within 24 hours/);

  console.log("check-booking-amendment: all assertions passed");
}

run();
