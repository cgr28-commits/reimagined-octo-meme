/**
 * Pure-logic checks for Saved Quote helpers (no live email / SumUp / Worker types).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSavedQuoteCustomerUrl,
  computeSavedQuoteExpiresAt,
  evaluateSavedQuoteAccess,
  generateSavedQuoteReference,
  generateSavedQuoteToken,
  isSavedQuoteExpired,
  lockSavedQuotePricingFromServer,
  normalizeSavedQuoteToken,
  shouldSendFinalReminder,
  shouldSendFirstReminder,
  type SavedQuoteRecord,
} from "../shared/saved-quote";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import {
  buildSaveQuotePayloadFromLiveQuote,
  saveQuotePayloadBlockMessage,
} from "../src/lib/save-quote-payload";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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

  console.log("=== Forged client price cannot become authoritative totalAmount ===");
  const expected = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
    dropoffAddress: "Belfast International Airport",
    returnJourney: false,
    outboundDate: "2026-08-25",
    outboundTime: "10:00",
    passengers: 2,
    suitcases: 2,
  });
  assert.equal(expected.ok, true);
  if (!expected.ok) throw new Error("expected quote to succeed");
  assert.ok(expected.amount > 1, "fixture journey must price above £1");

  const forged = lockSavedQuotePricingFromServer({
    serverAmount: expected.amount,
    amountLabel: expected.amountLabel,
    clientSubmittedAmount: 1,
    pricingMeta: { source: "website-pricing-engine" },
  });
  assert.equal(forged.totalAmount, expected.amount);
  assert.notEqual(forged.totalAmount, 1);
  assert.equal(forged.clientSubmittedAmount, 1);
  assert.equal(
    (forged.pricingMeta as { clientAmountMismatch?: boolean } | undefined)?.clientAmountMismatch,
    true,
  );
  assert.equal(
    (forged.pricingMeta as { serverAmount?: number } | undefined)?.serverAmount,
    expected.amount,
  );

  const honest = lockSavedQuotePricingFromServer({
    serverAmount: expected.amount,
    amountLabel: expected.amountLabel,
    clientSubmittedAmount: expected.amount,
    pricingMeta: { source: "website-pricing-engine" },
  });
  assert.equal(honest.totalAmount, expected.amount);
  assert.notEqual(
    (honest.pricingMeta as { clientAmountMismatch?: boolean } | undefined)?.clientAmountMismatch,
    true,
  );

  console.log("=== Handler wiring uses server engine (never parsePricing) ===");
  const handlers = fs.readFileSync(
    path.join(root, "workers/addresses/src/saved-quote-handlers.ts"),
    "utf8",
  );
  assert.match(handlers, /buildAuthoritativeSavedQuotePricing/);
  assert.match(handlers, /calculateAuthoritativeWebsiteQuote/);
  assert.match(handlers, /lockSavedQuotePricingFromServer/);
  assert.match(handlers, /Never trust client pricing/);
  assert.match(handlers, /tryClaimSavedQuoteReminder/);
  const createFn = handlers.slice(
    handlers.indexOf("export async function handleCreateSavedQuote"),
    handlers.indexOf("export async function handleGetSavedQuote"),
  );
  assert.match(createFn, /buildAuthoritativeSavedQuotePricing/);
  assert.doesNotMatch(createFn, /parsePricing\(/);
  assert.doesNotMatch(createFn, /pricing\.totalAmount\s*=\s*client/);

  console.log("=== Live quote → Save Quote payload mapping ===");
  // Bangor ← BFS is the production smoke-test shape (from-airport + named town).
  const bangorFromBfs = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: true,
    pickupAddress: "Belfast International Airport (BFS)",
    dropoffAddress: "Main Street, Bangor, BT20",
    returnJourney: false,
    outboundDate: "2026-08-25",
    outboundTime: "14:30",
    passengers: 2,
    suitcases: 2,
  });
  assert.equal(bangorFromBfs.ok, true);
  if (!bangorFromBfs.ok) throw new Error("Bangor←BFS fixture must price");

  const liveQuoteSnapshot = {
    amount: bangorFromBfs.amount,
    area: "Bangor",
    areaSurcharge: 10,
    airportBase: 35,
    vehicleMultiplier: 1,
    vehicleAdjustment: 0,
    premiumApplied: false,
    operational: null,
  };

  // Exact regression: step-1 live price without date/time must NOT look like an "expired" quote.
  const missingSchedule = buildSaveQuotePayloadFromLiveQuote({
    liveQuote: liveQuoteSnapshot,
    canPayNowOnline: true,
    isEnquiryOnly: false,
    showsRequestQuoteFlow: false,
    pickupLabel: "Belfast International Airport (BFS)",
    dropoffLabel: "Main Street, Bangor, BT20",
    airportCode: "BFS",
    tripDirection: "from-airport",
    isAirportTrip: true,
    isFromAirport: true,
    journeyType: "Airport pickup",
    tripDate: "",
    tripTime: "",
    returnJourney: false,
    passengers: 2,
    suitcases: 2,
    vehicle: "Standard Saloon (1–4 passengers)",
    tripLabel: "Airport pickup",
  });
  assert.equal(missingSchedule.ok, true);
  if (missingSchedule.ok) {
    assert.equal(missingSchedule.payload.journey.tripDate, "");
    assert.equal(missingSchedule.payload.journey.tripTime, "");
  }

  const readyPayload = buildSaveQuotePayloadFromLiveQuote({
    liveQuote: liveQuoteSnapshot,
    canPayNowOnline: true,
    isEnquiryOnly: false,
    showsRequestQuoteFlow: false,
    pickupLabel: "Belfast International Airport (BFS)",
    dropoffLabel: "Main Street, Bangor, BT20",
    airportCode: "BFS",
    tripDirection: "from-airport",
    isAirportTrip: true,
    isFromAirport: true,
    journeyType: "Airport pickup",
    tripDate: "2026-08-25",
    tripTime: "14:30",
    returnJourney: false,
    passengers: 2,
    suitcases: 2,
    vehicle: "Standard Saloon (1–4 passengers)",
    tripLabel: "Airport pickup",
    pickupLat: 54.6575,
    pickupLng: -6.2158,
    dropoffLat: 54.6633,
    dropoffLng: -5.6681,
  });
  assert.equal(readyPayload.ok, true);
  if (readyPayload.ok) {
    assert.equal(readyPayload.payload.journey.airportCode, "BFS");
    assert.equal(readyPayload.payload.journey.tripDirection, "from-airport");
    assert.equal(readyPayload.payload.journey.isFromAirport, true);
    assert.equal(readyPayload.payload.journey.tripDate, "2026-08-25");
    assert.equal(readyPayload.payload.journey.tripTime, "14:30");
    assert.equal(readyPayload.payload.journey.passengers, 2);
    assert.equal(readyPayload.payload.journey.suitcases, 2);
    assert.equal(readyPayload.payload.pricing.totalAmount, bangorFromBfs.amount);
    assert.equal(readyPayload.payload.pricing.currency, "GBP");
    // Server must still accept this journey shape via the authoritative engine.
    const serverRecalc = calculateAuthoritativeWebsiteQuote({
      airportCode: "BFS",
      fromAirport: true,
      pickupAddress: readyPayload.payload.journey.pickupLabel,
      dropoffAddress: readyPayload.payload.journey.dropoffLabel,
      returnJourney: false,
      outboundDate: readyPayload.payload.journey.tripDate,
      outboundTime: readyPayload.payload.journey.tripTime,
      passengers: readyPayload.payload.journey.passengers,
      suitcases: readyPayload.payload.journey.suitcases,
    });
    assert.equal(serverRecalc.ok, true);
    if (serverRecalc.ok) {
      assert.equal(serverRecalc.amount, readyPayload.payload.pricing.totalAmount);
    }
  }

  const modalSrc = fs.readFileSync(path.join(root, "src/components/SaveQuoteModal.tsx"), "utf8");
  assert.match(modalSrc, /saveQuoteSubmitErrorMessage/);
  assert.doesNotMatch(
    modalSrc,
    /Your quote is no longer available\. Please recalculate and try again\./,
  );
  const quoteCardSrc = fs.readFileSync(path.join(root, "src/components/QuoteCard.tsx"), "utf8");
  assert.match(quoteCardSrc, /handleSaveQuoteClick/);
  assert.match(quoteCardSrc, /buildSaveQuotePayloadFromLiveQuote/);
  assert.match(quoteCardSrc, /syncScheduleFieldsFromInputs/);

  console.log("check-saved-quote: all assertions passed");
}

run();
