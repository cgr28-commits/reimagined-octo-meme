/**
 * Saved quote validity must never override booking eligibility: once the scheduled
 * pickup has passed a saved quote is expired and not bookable, whatever its 7-day
 * retrieval window says. No network.
 */
import assert from "node:assert/strict";
import {
  computeSavedQuoteExpiresAt,
  evaluateSavedQuoteAccess,
  isSavedQuoteExpired,
  savedQuotePickupPassed,
  type SavedQuoteRecord,
} from "../shared/saved-quote";

const created = new Date("2026-11-25T15:30:00Z");
const journey = { tripDate: "2026-11-28", tripTime: "12:00" }; // GMT in November

// Expiry is capped at pickup (the reported case would have said "valid until 2 Dec").
assert.equal(computeSavedQuoteExpiresAt(created, 7, journey), "2026-11-28T12:00:00.000Z");
// Far-off pickup: normal 7-day window. No date: normal 7-day window.
assert.equal(computeSavedQuoteExpiresAt(created, 7, { tripDate: "2026-12-30", tripTime: "09:00" }), "2026-12-02T15:30:00.000Z");
assert.equal(computeSavedQuoteExpiresAt(created, 7, { tripDate: "", tripTime: "" }), "2026-12-02T15:30:00.000Z");
assert.equal(computeSavedQuoteExpiresAt(created), "2026-12-02T15:30:00.000Z");

const record = (over: Partial<SavedQuoteRecord> = {}) =>
  ({
    token: "t".repeat(40),
    reference: "MAT-261125-1530-54DA",
    status: "saved",
    expiresAt: "2026-12-02T15:30:00.000Z", // legacy record: retrieval window still open
    journey,
    ...over,
  }) as SavedQuoteRecord;

// Legacy record, 7-day window still open, but pickup has passed: expired, not bookable.
const after = new Date("2026-11-28T12:00:01Z");
assert.equal(savedQuotePickupPassed(journey, after), true);
assert.equal(isSavedQuoteExpired(record(), after), true);
const denied = evaluateSavedQuoteAccess(record(), after);
assert.equal(denied.ok, false);
assert.equal(!denied.ok && denied.error, "expired");

// Before pickup, inside the window: bookable.
assert.equal(evaluateSavedQuoteAccess(record(), new Date("2026-11-26T09:00:00Z")).ok, true);
// A dateless saved quote has no pickup to pass: only the retrieval window applies.
const dateless = record({ journey: { tripDate: "", tripTime: "" } as SavedQuoteRecord["journey"] });
assert.equal(isSavedQuoteExpired(dateless, new Date("2026-12-01T00:00:00Z")), false);
assert.equal(isSavedQuoteExpired(dateless, new Date("2026-12-03T00:00:00Z")), true);
// Booked stays booked.
assert.equal(evaluateSavedQuoteAccess(record({ status: "booked" }), after).ok, false);

console.log("PASS: saved quotes expire at pickup, legacy records included; dateless quotes keep the 7-day window");
