/**
 * Hotfix regressions: Quick Quote checkout uses stored fare (no route-less requote);
 * timed-link KV retention covers full validity (not capped at 8 days).
 * Run: npx tsx scripts/check-quick-quote-checkout-expiry-hotfix.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  QUICK_QUOTE_EXPIRED_RETENTION_SECONDS,
  QUICK_QUOTE_KV_MAX_EXPIRATION_TTL_SECONDS,
  QUICK_QUOTE_TTL_SECONDS,
  isApprovedQuickQuoteStoredFare,
  quickQuoteCalculatedAmount,
  quickQuoteCheckoutStandardWebsiteAmount,
  quickQuoteKvExpirationTtlSeconds,
  resolveQuickQuoteCheckoutAmount,
  type QuickQuoteRecord,
} from "../shared/quick-quote";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";

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
const DAY = 60 * 60 * 24;
const LEGACY_EIGHT_DAY_CAP = QUICK_QUOTE_TTL_SECONDS + QUICK_QUOTE_EXPIRED_RETENTION_SECONDS;

function baseRecord(
  overrides: Partial<QuickQuoteRecord> & {
    pricingSource: QuickQuoteRecord["pricingSource"];
    calculatedAmount: number;
    quotedAmount: number;
  },
): QuickQuoteRecord {
  return {
    id: "c".repeat(48),
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
    quotedAmountLabel: `£${overrides.quotedAmount}`,
    ...overrides,
  };
}

check("30-day quote KV TTL is not capped at 8 days", () => {
  const now = Date.parse("2026-09-01T12:00:00.000Z");
  const expiresAt = new Date(now + 30 * DAY * 1000).toISOString();
  const ttl = quickQuoteKvExpirationTtlSeconds(expiresAt, now);
  assert.ok(typeof ttl === "number");
  assert.ok(ttl! > LEGACY_EIGHT_DAY_CAP, `expected > ${LEGACY_EIGHT_DAY_CAP}, got ${ttl}`);
  assert.equal(ttl, 30 * DAY + QUICK_QUOTE_EXPIRED_RETENTION_SECONDS);
});

check("365-day quote remains stored for its full validity period", () => {
  const now = Date.parse("2026-09-01T12:00:00.000Z");
  const expiresAt = new Date(now + 365 * DAY * 1000).toISOString();
  const ttl = quickQuoteKvExpirationTtlSeconds(expiresAt, now);
  assert.ok(typeof ttl === "number");
  // Cloudflare caps TTL at 365 days; must still cover the full validity window.
  assert.ok(ttl! >= 365 * DAY, `expected >= 365 days, got ${ttl}`);
  assert.equal(ttl, QUICK_QUOTE_KV_MAX_EXPIRATION_TTL_SECONDS);
});

check("24h / 7d / custom validity retain through expiry (+ grace)", () => {
  const now = Date.parse("2026-09-01T12:00:00.000Z");
  assert.equal(
    quickQuoteKvExpirationTtlSeconds(new Date(now + DAY * 1000).toISOString(), now),
    DAY + QUICK_QUOTE_EXPIRED_RETENTION_SECONDS,
  );
  assert.equal(
    quickQuoteKvExpirationTtlSeconds(new Date(now + 7 * DAY * 1000).toISOString(), now),
    7 * DAY + QUICK_QUOTE_EXPIRED_RETENTION_SECONDS,
  );
  assert.equal(
    quickQuoteKvExpirationTtlSeconds(new Date(now + 90 * DAY * 1000).toISOString(), now),
    90 * DAY + QUICK_QUOTE_EXPIRED_RETENTION_SECONDS,
  );
});

check("No-time-limit quotes have no KV expiration", () => {
  assert.equal(quickQuoteKvExpirationTtlSeconds(null), undefined);
  assert.equal(quickQuoteKvExpirationTtlSeconds(""), undefined);
  assert.equal(quickQuoteKvExpirationTtlSeconds(undefined), undefined);
});

check("Downings → BHD route-less engine returns no_fare; stored £273 checkout succeeds", () => {
  const routeless = calculateAuthoritativeWebsiteQuote({
    airportCode: "BHD",
    fromAirport: false,
    pickupAddress: PICKUP,
    dropoffAddress: DROPOFF,
    returnJourney: false,
    outboundDate: "2026-09-10",
    outboundTime: "12:00",
    passengers: 2,
    suitcases: 2,
    vehicleType: "Standard Saloon (1–4 passengers)",
    maxPassengers: 4,
  });
  assert.equal(routeless.ok, false);
  if (!routeless.ok) {
    assert.equal(routeless.reason, "no_fare");
  }

  const record = baseRecord({
    pricingSource: "website-pricing-engine",
    calculatedAmount: 273,
    quotedAmount: 273,
  });
  const approved = quickQuoteCalculatedAmount(record);
  assert.equal(approved, 273);
  assert.equal(isApprovedQuickQuoteStoredFare(approved), true);
  assert.equal(quickQuoteCheckoutStandardWebsiteAmount(record), 273);

  // Customer-supplied fake totals/fees must not change the transfer fare.
  const checkout = resolveQuickQuoteCheckoutAmount(record, false);
  assert.equal(checkout.transferFareGbp, 273);
  assert.equal(checkout.totalGbp, 273);
});

check("Manual quote accounting leaves standardWebsiteAmount undefined", () => {
  const record = baseRecord({
    pricingSource: "owner-manual",
    calculatedAmount: 250,
    quotedAmount: 250,
  });
  assert.equal(quickQuoteCheckoutStandardWebsiteAmount(record), undefined);
  assert.equal(isApprovedQuickQuoteStoredFare(quickQuoteCalculatedAmount(record)), true);
});

check("Express selection is recalculated server-side; customer totals/fees ignored", () => {
  const record = baseRecord({
    pricingSource: "website-pricing-engine",
    calculatedAmount: 273,
    quotedAmount: 999, // tampered customer total must not win
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
      expressDropOffSelected: false,
      expressDropOffFee: 99, // tampered fee ignored
      expressDropOffAirport: "BHD",
    },
  });
  const withExpress = resolveQuickQuoteCheckoutAmount(record, true);
  assert.equal(withExpress.transferFareGbp, 273);
  assert.ok(withExpress.express.feeGbp > 0);
  assert.ok(withExpress.express.feeGbp !== 99);
  assert.equal(withExpress.totalGbp, 273 + withExpress.express.feeGbp);

  const without = resolveQuickQuoteCheckoutAmount(record, false);
  assert.equal(without.transferFareGbp, 273);
  assert.equal(without.express.feeGbp, 0);
  assert.equal(without.totalGbp, 273);
});

check("Worker checkout uses stored fare helpers; does not route-less requote", () => {
  const index = read("workers/addresses/src/index.ts");
  const qqStart = index.indexOf("} else if (quickQuoteIdRaw) {");
  const qqEnd = index.indexOf("} else if (savedQuoteTokenRaw) {", qqStart);
  assert.ok(qqStart > 0 && qqEnd > qqStart);
  const qqBlock = index.slice(qqStart, qqEnd);
  assert.doesNotMatch(qqBlock, /calculateAuthoritativeWebsiteQuote/);
  assert.match(qqBlock, /isApprovedQuickQuoteStoredFare/);
  assert.match(qqBlock, /quickQuoteCalculatedAmount/);
  assert.match(qqBlock, /quickQuoteCheckoutStandardWebsiteAmount/);
  assert.match(qqBlock, /Never trust a customer-supplied amount/);
  assert.match(qqBlock, /resolveQuickQuoteCheckoutAmount/);

  const store = read("workers/addresses/src/quick-quote-store.ts");
  assert.match(store, /quickQuoteKvExpirationTtlSeconds/);
  assert.doesNotMatch(store, /Math\.min\(\s*QUICK_QUOTE_TTL_SECONDS/);
});

check("Shared quick-quote mirrors stay in sync after sync:worker-shared", () => {
  const a = read("shared/quick-quote.ts");
  const b = read("workers/addresses/shared/quick-quote.ts");
  assert.equal(a, b);
});

console.log("\nAll Quick Quote checkout / expiry hotfix checks passed.");
