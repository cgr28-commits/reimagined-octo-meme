/**
 * ROI Quick Quote / Personal Quote parity + manual price / validity.
 * Downings (Donegal) → BHD must price at £273 for 117 miles / 155 minutes.
 * Run: npx tsx scripts/check-quick-quote-roi-manual-price.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isAddressAllowedForAirport, isAllowedAutocompleteLabel } from "../shared/address-validation";
import {
  applyQuickQuoteManualDiscount,
  assertQuickQuoteTransferFareFloor,
  isQuickQuoteExpired,
  parseQuickQuoteManualTransferFare,
  parseQuickQuotePriceSource,
  resolveQuickQuoteCheckoutAmount,
  resolveQuickQuoteTtlSeconds,
  type QuickQuoteRecord,
} from "../shared/quick-quote";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { calculateQuote } from "../src/lib/quote";
import { calculateWebsiteOneWayFare } from "../src/lib/website-fare";
import { quickSelectToPlace, selectedPlaceFromParts } from "../src/lib/selected-place";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  fn();
  console.log(`OK  ${label}`);
}

const PICKUP = "Crocknamurleog, Downings, Co. Donegal, Ireland";
const DROPOFF = "George Best Belfast City Airport";
const METRICS = {
  distanceKm: 117 / 0.621371,
  durationMinutes: 155,
};
const SALOON = "Standard Saloon (1–4 passengers)";

check("Downings Donegal label is accepted by A2A address lookup (not BHD-only filter)", () => {
  assert.equal(isAllowedAutocompleteLabel(PICKUP, "A2A"), true);
  assert.equal(
    isAddressAllowedForAirport("A2A", {
      county: "Donegal",
      country: "Ireland",
      displayName: PICKUP,
      town: "Downings",
    }),
    true,
  );
  // Airport-specific BHD mode rejects ROI residential — that was the QQ bug.
  assert.equal(isAllowedAutocompleteLabel(PICKUP, "BHD"), false);
});

check("QQ + Personal Quote AddressInputs use airportCode=\"A2A\"", () => {
  const qq = read("src/app/quick-quote/QuickQuoteOwnerClient.tsx");
  const pq = read("src/components/OwnerPersonalQuotesPanel.tsx");
  assert.match(qq, /airportCode=["']A2A["']/);
  assert.match(pq, /airportCode=["']A2A["']/);
  // Real airport code still inferred for pricing — do not hardcode A2A into draft.airportCode.
  assert.match(qq, /resolveAirportTransferIntent/);
});

check("Main Quote / Quick Quote engine / Personal Quote all return £273", () => {
  const main = calculateQuote(PICKUP, "BHD", SALOON, false, {}, METRICS, false);
  assert.ok(main);
  assert.equal(main.amount, 273);

  const qq = calculateAuthoritativeWebsiteQuote({
    airportCode: "BHD",
    fromAirport: false,
    pickupAddress: PICKUP,
    dropoffAddress: DROPOFF,
    returnJourney: false,
    outboundDate: "2026-09-10",
    outboundTime: "12:00",
    passengers: 2,
    suitcases: 2,
    routeMetrics: METRICS,
    vehicleType: SALOON,
    maxPassengers: 4,
  });
  assert.equal(qq.ok, true);
  if (qq.ok) assert.equal(qq.amount, 273);

  const pickupPlace = selectedPlaceFromParts({
    placeId: "ChIJ_downings_test",
    formattedAddress: PICKUP,
    lat: 55.19,
    lng: -7.83,
    countryCode: "IE",
    locality: "Downings",
    administrativeArea: "Donegal",
  });
  const dropoffPlace = quickSelectToPlace("BHD")!;
  assert.ok(dropoffPlace);

  const personal = calculateWebsiteOneWayFare({
    pickupAddress: PICKUP,
    dropoffAddress: DROPOFF,
    pickupPlace,
    dropoffPlace,
    vehicleType: SALOON,
    routeMetrics: METRICS,
  });
  assert.ok(personal);
  assert.equal(personal.amount, 273);
});

check("Manual £273 no discount + no-expiry validity helpers", () => {
  const manual = parseQuickQuoteManualTransferFare(273);
  assert.equal(manual.ok, true);
  if (!manual.ok) return;
  const discounted = applyQuickQuoteManualDiscount(manual.amount, "none", 0);
  assert.equal(discounted.customerFare, 273);
  assert.equal(assertQuickQuoteTransferFareFloor(discounted.customerFare).ok, true);

  assert.equal(resolveQuickQuoteTtlSeconds({ validityMode: "none" }), null);
  // Legacy clients that omit validityMode keep 24h.
  assert.equal(resolveQuickQuoteTtlSeconds({}), 60 * 60 * 24);
  assert.equal(resolveQuickQuoteTtlSeconds({ validityMode: "24h" }), 60 * 60 * 24);
  assert.equal(resolveQuickQuoteTtlSeconds({ validityMode: "7d" }), 60 * 60 * 24 * 7);
  assert.equal(resolveQuickQuoteTtlSeconds({ validityMode: "30d" }), 60 * 60 * 24 * 30);
  assert.equal(
    resolveQuickQuoteTtlSeconds({ validityMode: "custom", validityDays: 14 }),
    60 * 60 * 24 * 14,
  );
});

check("Manual £273 with £23 discount → £250", () => {
  const discounted = applyQuickQuoteManualDiscount(273, "fixed", 23);
  assert.equal(discounted.calculatedFare, 273);
  assert.equal(discounted.discountAmount, 23);
  assert.equal(discounted.customerFare, 250);
});

check("Invalid manual prices and final transfer below £1 are rejected", () => {
  assert.equal(parseQuickQuoteManualTransferFare(0).ok, false);
  assert.equal(parseQuickQuoteManualTransferFare(0.5).ok, false);
  assert.equal(parseQuickQuoteManualTransferFare(5000.01).ok, false);
  assert.equal(parseQuickQuoteManualTransferFare(-10).ok, false);
  assert.equal(parseQuickQuoteManualTransferFare("abc").ok, false);
  assert.equal(parseQuickQuoteManualTransferFare(1).ok, true);
  assert.equal(parseQuickQuoteManualTransferFare(5000).ok, true);

  const wiped = applyQuickQuoteManualDiscount(20, "fixed", 20);
  assert.equal(wiped.customerFare, 0);
  assert.equal(assertQuickQuoteTransferFareFloor(wiped.customerFare).ok, false);
  assert.equal(assertQuickQuoteTransferFareFloor(0.99).ok, false);
  assert.equal(assertQuickQuoteTransferFareFloor(1).ok, true);
});

check("No-expiry links stay open; timed links still expire", () => {
  const base: QuickQuoteRecord = {
    id: "a".repeat(48),
    createdAt: new Date().toISOString(),
    expiresAt: null,
    status: "open",
    journey: {
      pickupAddress: PICKUP,
      dropoffAddress: DROPOFF,
      airportCode: "BHD",
      fromAirport: false,
      returnJourney: false,
      outboundDate: "2026-09-10",
      outboundTime: "12:00",
      passengers: 2,
      suitcases: 2,
    },
    quotedAmount: 273,
    quotedAmountLabel: "£273",
    calculatedAmount: 273,
    pricingSource: "owner-manual",
  };
  assert.equal(isQuickQuoteExpired(base), false);
  assert.equal(
    isQuickQuoteExpired({
      ...base,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    false,
  );
  assert.equal(
    isQuickQuoteExpired({
      ...base,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }),
    true,
  );
});

check("Customer cannot tamper with stored manual fare at checkout helper", () => {
  const record: QuickQuoteRecord = {
    id: "b".repeat(48),
    createdAt: new Date().toISOString(),
    expiresAt: null,
    status: "open",
    journey: {
      pickupAddress: PICKUP,
      dropoffAddress: DROPOFF,
      airportCode: "BHD",
      fromAirport: false,
      returnJourney: false,
      outboundDate: "2026-09-10",
      outboundTime: "12:00",
      passengers: 2,
      suitcases: 2,
      expressDropOffSelected: true,
      expressDropOffFee: 4,
      expressDropOffAirport: "BHD",
    },
    quotedAmount: 277,
    quotedAmountLabel: "£277",
    calculatedAmount: 273,
    discountType: "none",
    discountValue: 0,
    discountAmount: 0,
    pricingSource: "owner-manual",
  };
  // Even if a customer asked for a different total, checkout reuses KV transfer + server Express.
  const withExpress = resolveQuickQuoteCheckoutAmount(record, true);
  assert.equal(withExpress.transferFareGbp, 273);
  assert.equal(withExpress.totalGbp, 277);
  const withoutExpress = resolveQuickQuoteCheckoutAmount(record, false);
  assert.equal(withoutExpress.transferFareGbp, 273);
  assert.equal(withoutExpress.totalGbp, 273);
  assert.equal(withoutExpress.express.feeGbp, 0);
});

check("Owner auth required for manual create; price source audit tags", () => {
  const handlers = read("workers/addresses/src/quick-quote-handlers.ts");
  assert.match(handlers, /ownerAuthorized\(request, env\)/);
  assert.match(handlers, /owner-manual/);
  assert.match(handlers, /parseQuickQuoteManualTransferFare/);
  assert.match(handlers, /assertQuickQuoteTransferFareFloor/);
  assert.match(handlers, /resolveQuickQuoteTtlSeconds/);
  assert.equal(parseQuickQuotePriceSource("owner-manual"), "owner-manual");
  assert.equal(parseQuickQuotePriceSource("website"), "website-pricing-engine");

  const index = read("workers/addresses/src/index.ts");
  assert.match(index, /isApprovedQuickQuoteStoredFare/);
  assert.match(index, /Never trust a customer-supplied amount/);
  assert.doesNotMatch(
    index.slice(
      index.indexOf("} else if (quickQuoteIdRaw) {"),
      index.indexOf("} else if (savedQuoteTokenRaw) {"),
    ),
    /calculateAuthoritativeWebsiteQuote/,
  );

  const store = read("workers/addresses/src/quick-quote-store.ts");
  assert.match(store, /expiresAt == null|quickQuoteKvExpirationTtlSeconds/);
  assert.match(store, /without a KV expiration|No time limit/i);

  const book = read("src/app/book-quote/BookQuoteCustomerClient.tsx");
  assert.match(book, /no expiry date/);
});

check("Shared quick-quote mirrors stay in sync after sync:worker-shared", () => {
  const a = read("shared/quick-quote.ts");
  const b = read("workers/addresses/shared/quick-quote.ts");
  assert.equal(a, b);
});

console.log("\nAll Quick Quote ROI / manual-price checks passed.");
