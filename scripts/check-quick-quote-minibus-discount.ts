/**
 * Owner/Driver Quick Quote — Minibus (QQ-only) + discretionary discount.
 * Run: npx tsx scripts/check-quick-quote-minibus-discount.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyQuickQuoteManualDiscount,
  formatQuickQuoteAmount,
  parseQuickQuoteDiscountType,
  parseQuickQuoteVehicleChoice,
  quickQuoteCalculatedAmount,
  quickQuoteMaxPassengersForVehicle,
  quickQuotePassengerOptions,
  QUICK_QUOTE_MINIBUS_MAX_PASSENGERS,
  QUICK_QUOTE_SALOON_MAX_PASSENGERS,
  type QuickQuoteRecord,
} from "../shared/quick-quote";
import { getWebsiteReturnJourneyFare } from "../shared/return-journey-discount";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { MINIBUS_VEHICLE, selectVehicleForParty } from "../src/lib/vehicle-selection";
import { QUICK_QUOTE_MINIBUS_PASSENGER_OPTIONS } from "../src/components/FiniteOptionSelect";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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

check("Vehicle choice parsing", () => {
  assert.equal(parseQuickQuoteVehicleChoice("Saloon"), "Saloon");
  assert.equal(parseQuickQuoteVehicleChoice("minibus"), "Minibus");
  assert.equal(parseQuickQuoteVehicleChoice("Minibus (5–7 passengers)"), "Minibus");
  assert.equal(parseQuickQuoteDiscountType("percent"), "percent");
  assert.equal(parseQuickQuoteDiscountType("fixed"), "fixed");
  assert.equal(parseQuickQuoteDiscountType(""), "none");
});

check("Passenger ceilings by vehicle", () => {
  assert.equal(QUICK_QUOTE_SALOON_MAX_PASSENGERS, 4);
  assert.equal(QUICK_QUOTE_MINIBUS_MAX_PASSENGERS, 7);
  assert.equal(quickQuoteMaxPassengersForVehicle("Saloon"), 4);
  assert.equal(quickQuoteMaxPassengersForVehicle("Minibus"), 7);
  assert.deepEqual(quickQuotePassengerOptions("Saloon"), [1, 2, 3, 4]);
  assert.deepEqual(quickQuotePassengerOptions("Minibus"), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual([...QUICK_QUOTE_MINIBUS_PASSENGER_OPTIONS], [1, 2, 3, 4, 5, 6, 7]);
});

check("Zero discount leaves fare unchanged", () => {
  const result = applyQuickQuoteManualDiscount(65, "none", 0);
  assert.equal(result.calculatedFare, 65);
  assert.equal(result.customerFare, 65);
  assert.equal(result.discountAmount, 0);
  assert.equal(result.discountType, "none");
});

check("Percentage discount (10% of £65)", () => {
  const result = applyQuickQuoteManualDiscount(65, "percent", 10);
  assert.equal(result.calculatedFare, 65);
  assert.equal(result.discountAmount, 6.5);
  assert.equal(result.customerFare, 58.5);
  assert.equal(formatQuickQuoteAmount(result.customerFare), "£58.50");
});

check("Fixed discount (£10 off £65)", () => {
  const result = applyQuickQuoteManualDiscount(65, "fixed", 10);
  assert.equal(result.discountAmount, 10);
  assert.equal(result.customerFare, 55);
});

check("Excessive fixed discount never goes negative", () => {
  const result = applyQuickQuoteManualDiscount(65, "fixed", 100);
  assert.equal(result.discountAmount, 65);
  assert.equal(result.customerFare, 0);
});

check("Excessive percent discount capped at 100%", () => {
  const result = applyQuickQuoteManualDiscount(65, "percent", 150);
  assert.equal(result.discountValue, 100);
  assert.equal(result.customerFare, 0);
});

check("Return engine discount stays inside calculated fare; manual discount is separate", () => {
  const oneWay = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
    dropoffAddress: "Belfast International Airport",
    returnJourney: false,
    outboundDate: "2026-08-20",
    outboundTime: "10:00",
    passengers: 2,
    suitcases: 2,
  });
  assert.equal(oneWay.ok, true);
  if (!oneWay.ok) return;

  const ret = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
    dropoffAddress: "Belfast International Airport",
    returnJourney: true,
    outboundDate: "2026-08-20",
    outboundTime: "10:00",
    returnDate: "2026-08-22",
    returnTime: "18:00",
    passengers: 2,
    suitcases: 2,
  });
  assert.equal(ret.ok, true);
  if (!ret.ok) return;

  // Return discount applies to the journey fare only; airport fixed costs (£5+£5) stay full.
  // One-way £55 = journey £50 + £5; return = £50×1.9 + £10 = £105 (not £55×1.9 = £104.5).
  assert.equal(oneWay.amount, 55);
  assert.equal(ret.amount, 105);
  assert.ok(ret.amount > getWebsiteReturnJourneyFare(oneWay.amount));

  // Manual 10% is applied AFTER the return-discounted calculated fare — not instead of it.
  const manual = applyQuickQuoteManualDiscount(ret.amount, "percent", 10);
  assert.equal(manual.calculatedFare, ret.amount);
  assert.ok(manual.customerFare < ret.amount);
  assert.ok(manual.customerFare > 0);
  // Must not equal a naive "10% off 2× one-way" (that would double-apply / replace return discount).
  const naiveDouble = Math.round(oneWay.amount * 2 * 0.9 * 100) / 100;
  assert.notEqual(manual.customerFare, naiveDouble);
});

check("Minibus uses existing central multiplier (forced vehicle, low pax)", () => {
  const saloon = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
    dropoffAddress: "Belfast International Airport",
    returnJourney: false,
    outboundDate: "2026-08-20",
    outboundTime: "10:00",
    passengers: 2,
    suitcases: 2,
  });
  const minibus = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
    dropoffAddress: "Belfast International Airport",
    returnJourney: false,
    outboundDate: "2026-08-20",
    outboundTime: "10:00",
    passengers: 2,
    suitcases: 2,
    vehicleType: MINIBUS_VEHICLE,
    maxPassengers: 7,
  });
  assert.equal(saloon.ok, true);
  assert.equal(minibus.ok, true);
  if (saloon.ok && minibus.ok) {
    assert.equal(minibus.vehicleType, MINIBUS_VEHICLE);
    assert.ok(minibus.amount > saloon.amount, "Minibus fare should exceed Saloon");
  }
});

check("Minibus allows 5–7 passengers when maxPassengers raised", () => {
  assert.equal(selectVehicleForParty(6, 2), MINIBUS_VEHICLE);
  const blocked = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
    dropoffAddress: "Belfast International Airport",
    returnJourney: false,
    outboundDate: "2026-08-20",
    outboundTime: "10:00",
    passengers: 6,
    suitcases: 2,
  });
  assert.equal(blocked.ok, false);

  const allowed = calculateAuthoritativeWebsiteQuote({
    airportCode: "BFS",
    fromAirport: false,
    pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
    dropoffAddress: "Belfast International Airport",
    returnJourney: false,
    outboundDate: "2026-08-20",
    outboundTime: "10:00",
    passengers: 6,
    suitcases: 2,
    vehicleType: MINIBUS_VEHICLE,
    maxPassengers: 7,
  });
  assert.equal(allowed.ok, true);
  if (allowed.ok) {
    assert.equal(allowed.vehicleType, MINIBUS_VEHICLE);
    assert.ok(allowed.amount > 0);
  }
});

check("Stored financial totals keep calculated vs customer fare distinct", () => {
  const discounted = applyQuickQuoteManualDiscount(65, "percent", 10);
  const record: Pick<QuickQuoteRecord, "quotedAmount" | "calculatedAmount" | "discountType" | "discountAmount" | "discountValue"> = {
    calculatedAmount: discounted.calculatedFare,
    quotedAmount: discounted.customerFare,
    discountType: discounted.discountType,
    discountValue: discounted.discountValue,
    discountAmount: discounted.discountAmount,
  };
  assert.equal(quickQuoteCalculatedAmount(record), 65);
  assert.equal(record.quotedAmount, 58.5);
  assert.equal(record.discountAmount, 6.5);
  // Legacy records without calculatedAmount fall back to quotedAmount
  assert.equal(quickQuoteCalculatedAmount({ quotedAmount: 55 }), 55);
});

check("Quick Quote UI wires Minibus + discount (not public Live Quote)", () => {
  const qq = read("src/app/quick-quote/QuickQuoteOwnerClient.tsx");
  assert.match(qq, /vehicleChoice/);
  assert.match(qq, /Minibus/);
  assert.match(qq, /Optional discount/);
  assert.match(qq, /Customer price/);
  assert.match(qq, /QUICK_QUOTE_MINIBUS_PASSENGER_OPTIONS/);
  assert.match(qq, /applyQuickQuoteManualDiscount/);
  assert.match(qq, /formatReturnJourneyDiscountPercent/);

  const quoteCard = read("src/components/QuoteCard.tsx");
  // Public Live Quote must not gain a new Owner-style Minibus vehicle toggle from this work
  assert.doesNotMatch(quoteCard, /vehicleChoice/);
  assert.doesNotMatch(quoteCard, /applyQuickQuoteManualDiscount/);

  const handlers = read("workers/addresses/src/quick-quote-handlers.ts");
  assert.match(handlers, /applyQuickQuoteManualDiscount/);
  assert.match(handlers, /calculatedAmount/);
  assert.match(handlers, /discountType/);

  const pay = read("workers/addresses/src/index.ts");
  assert.match(pay, /quickQuoteCalculatedAmount/);
  assert.match(pay, /standardWebsiteAmount = expectedCalculated/);
});

check("Pricing config keeps Minibus multiplier central (no invented QQ formula)", () => {
  const config = JSON.parse(read("src/lib/pricing-config.json")) as {
    vehicleMultipliers: Record<string, number>;
  };
  const minibusKey = Object.keys(config.vehicleMultipliers).find((k) =>
    k.toLowerCase().includes("minibus"),
  );
  assert.ok(minibusKey, "Minibus multiplier must remain in pricing-config.json");
  assert.equal(config.vehicleMultipliers[minibusKey!], 1.55);
});

console.log("\nAll Quick Quote Minibus + discount checks passed.");
