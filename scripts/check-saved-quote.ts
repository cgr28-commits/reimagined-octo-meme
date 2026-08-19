/**
 * Pure-logic checks for Saved Quote helpers (no network / KV).
 */
import assert from "node:assert/strict";
import {
  buildSavedQuoteCustomerUrl,
  computeSavedQuoteExpiresAt,
  evaluateSavedQuoteAccess,
  generateSavedQuoteReference,
  generateSavedQuoteToken,
  isSavedQuoteExpired,
  normalizeSavedQuoteToken,
  shouldSendFinalReminder,
  shouldSendFirstReminder,
  type SavedQuoteRecord,
} from "../shared/saved-quote";

function baseRecord(overrides: Partial<SavedQuoteRecord> = {}): SavedQuoteRecord {
  const now = new Date("2026-08-19T10:00:00.000Z");
  return {
    id: "abc123",
    reference: "MAT-260819-1100-ABCD",
    token: "a".repeat(48),
    customerName: "Test Customer",
    customerEmail: "test@example.com",
    journey: {
      pickupLabel: "1 Main St, Belfast",
      dropoffLabel: "Belfast International Airport",
      isAirportTrip: true,
      airportCode: "BFS",
      tripDate: "2026-08-25",
      tripTime: "09:00",
      returnJourney: false,
      passengers: 2,
      suitcases: 2,
      vehicle: "Standard Saloon (1–4 passengers)",
      tripLabel: "Airport drop-off",
    },
    pricing: {
      totalAmount: 42.5,
      currency: "GBP",
      amountLabel: "£42.50",
    },
    status: "saved",
    createdAt: now.toISOString(),
    expiresAt: computeSavedQuoteExpiresAt(now),
    ...overrides,
  };
}

function run() {
  const token = generateSavedQuoteToken();
  assert.equal(token.length, 48);
  assert.equal(normalizeSavedQuoteToken(token), token);
  assert.match(generateSavedQuoteReference(new Date("2026-08-19T09:45:00Z")), /^MAT-\d{6}-\d{4}-[0-9A-F]{4}$/);

  const url = buildSavedQuoteCustomerUrl(token);
  assert.ok(url.includes("/quote/?t="));
  assert.ok(!url.includes("42.5"));
  assert.ok(!url.includes("test@"));

  const saved = baseRecord();
  assert.equal(isSavedQuoteExpired(saved, new Date("2026-08-20T10:00:00Z")), false);
  assert.equal(isSavedQuoteExpired(saved, new Date("2026-08-26T11:00:00Z")), true);

  const accessOk = evaluateSavedQuoteAccess(saved, new Date("2026-08-20T10:00:00Z"));
  assert.equal(accessOk.ok, true);

  const booked = evaluateSavedQuoteAccess(baseRecord({ status: "booked" }));
  assert.equal(booked.ok, false);
  if (!booked.ok) assert.equal(booked.error, "booked");

  const expired = evaluateSavedQuoteAccess(
    baseRecord({ status: "saved" }),
    new Date("2026-08-27T10:00:00Z"),
  );
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.error, "expired");

  const day0 = baseRecord();
  assert.equal(shouldSendFirstReminder(day0, new Date("2026-08-19T12:00:00Z")), false);
  assert.equal(shouldSendFirstReminder(day0, new Date("2026-08-20T11:00:00Z")), true);
  assert.equal(
    shouldSendFirstReminder(
      baseRecord({ firstReminderSentAt: "2026-08-20T11:05:00Z" }),
      new Date("2026-08-20T12:00:00Z"),
    ),
    false,
  );
  assert.equal(
    shouldSendFirstReminder(baseRecord({ status: "booked" }), new Date("2026-08-20T11:00:00Z")),
    false,
  );

  assert.equal(shouldSendFinalReminder(day0, new Date("2026-08-23T09:00:00Z")), false);
  assert.equal(shouldSendFinalReminder(day0, new Date("2026-08-24T11:00:00Z")), true);
  assert.equal(
    shouldSendFinalReminder(
      baseRecord({ finalReminderSentAt: "2026-08-24T11:05:00Z" }),
      new Date("2026-08-24T12:00:00Z"),
    ),
    false,
  );
  assert.equal(
    shouldSendFinalReminder(day0, new Date("2026-08-27T10:00:00Z")),
    false,
    "no reminders after expiry",
  );

  console.log("check-saved-quote: all assertions passed");
}

run();
