/**
 * Unit checks for Daily Quote Pricing & Competitor Intelligence.
 * Analytics only — asserts we never imply live pricing mutation.
 */

import assert from "node:assert/strict";
import {
  buildDailyPricingReport,
  buildDungivenBhdSeedEvent,
  buildQuoteAnalyticsKey,
  DUNGIVEN_BHD_SEED_DAY,
  flagMatniVsCompetitor,
  formatDailyPricingReportEmail,
  intelligenceVehicleClass,
  londonDayKey,
  parsePriceGbp,
  quoteLeadToIntelligenceEvent,
  shouldRunDailyPricingIntelligence,
} from "../shared/pricing-intelligence";

let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

check("vehicle rule: 1–4 pax + 0–2 cases → Saloon", () => {
  assert.equal(intelligenceVehicleClass(2, 2), "Saloon");
  assert.equal(intelligenceVehicleClass(4, 0), "Saloon");
});

check("vehicle rule: 1–4 pax + 3–4 cases → Estate", () => {
  assert.equal(intelligenceVehicleClass(2, 3), "Estate");
  assert.equal(intelligenceVehicleClass(4, 4), "Estate");
});

check("vehicle rule: 5–7 pax → Minibus", () => {
  assert.equal(intelligenceVehicleClass(5, 2), "Minibus");
  assert.equal(intelligenceVehicleClass(7, 4), "Minibus");
});

check("flags: HIGH when >10% or £10 above competitor", () => {
  assert.equal(flagMatniVsCompetitor(154, 130), "HIGH");
  assert.equal(flagMatniVsCompetitor(120, 100), "HIGH");
});

check("flags: COMPETITIVE within ±£5 or ±5%", () => {
  assert.equal(flagMatniVsCompetitor(100, 100), "COMPETITIVE");
  assert.equal(flagMatniVsCompetitor(104, 100), "COMPETITIVE");
});

check("flags: LOW when materially below", () => {
  assert.equal(flagMatniVsCompetitor(90, 100), "LOW");
});

check("Dungiven → BHD seed is HIGH vs FonaCAB £130", () => {
  const seed = buildDungivenBhdSeedEvent(DUNGIVEN_BHD_SEED_DAY);
  assert.equal(seed.matniPriceGbp, 154);
  assert.equal(seed.competitors?.fonacab?.priceGbp, 130);
  assert.equal(seed.journeyMiles, 54);
  const report = buildDailyPricingReport(DUNGIVEN_BHD_SEED_DAY, [seed]);
  assert.equal(report.rows[0]?.flag, "HIGH");
  assert.equal(report.rows[0]?.differenceGbp, 24);
  assert.equal(report.highCount, 1);
});

check("daily email subject uses required title format", () => {
  const seed = buildDungivenBhdSeedEvent();
  const report = buildDailyPricingReport(DUNGIVEN_BHD_SEED_DAY, [seed]);
  const email = formatDailyPricingReportEmail(report);
  assert.match(email.subject, /^My Airport Taxi NI — Daily Pricing Report — \d{4}-\d{2}-\d{2}$/);
  assert.match(email.body, /Analytics only/);
  assert.doesNotMatch(email.body, /pricing-config\.json was updated/i);
});

check("quote lead → intelligence event maps core fields", () => {
  const event = quoteLeadToIntelligenceEvent(
    {
      tripLabel: "Airport drop-off",
      pickupLabel: "Dungiven",
      dropoffLabel: "Belfast City Airport",
      returnJourney: false,
      passengers: 2,
      suitcases: 2,
      vehicle: "Standard Saloon (1–4 passengers)",
      estimatedPrice: "£154.00",
      journeyDistance: "54 mi",
      journeyDuration: "1 h 10 m",
      isAirportTrip: true,
    },
    "fp-test",
    { premiumApplied: true, source: "card" },
    new Date("2026-08-19T12:00:00.000Z"),
  );
  assert.ok(event);
  assert.equal(event?.matniPriceGbp, 154);
  assert.equal(event?.premiumApplied, true);
  assert.equal(event?.journeyMiles, 54);
  assert.equal(event?.vehicleClass, "Saloon");
  assert.equal(event?.airportCode, "BHD");
  assert.equal(event?.outcome, "viewed");
});

check("analytics key ignores schedule so funnel can link", () => {
  const a = buildQuoteAnalyticsKey({
    pickupLabel: "A",
    dropoffLabel: "B",
    returnJourney: false,
    estimatedPrice: "£10",
    vehicle: "Saloon",
    passengers: 2,
    suitcases: 1,
  });
  const b = buildQuoteAnalyticsKey({
    pickupLabel: "A",
    dropoffLabel: "B",
    returnJourney: false,
    estimatedPrice: "£10",
    vehicle: "Saloon",
    passengers: 2,
    suitcases: 1,
  });
  assert.equal(a, b);
});

check("parsePriceGbp and london day helpers", () => {
  assert.equal(parsePriceGbp("£154.00"), 154);
  assert.match(londonDayKey(new Date("2026-08-19T23:30:00+01:00")), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(
    shouldRunDailyPricingIntelligence(new Date("2026-08-19T22:05:00.000Z")),
    true,
  ); // 23:05 BST
});

check("module is analytics-only (documents no live price mutation)", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../shared/pricing-intelligence.ts", import.meta.url), "utf8");
  assert.match(src, /Never mutates pricing-config\.json/);
  assert.doesNotMatch(src, /from ["'].*pricing-config/);
  assert.doesNotMatch(src, /writeFileSync/);
});

console.log(`\n${passed} pricing-intelligence checks passed`);
