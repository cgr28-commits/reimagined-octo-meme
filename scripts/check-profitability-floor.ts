/**
 * Profitability floor — formula, fail-safe, and secrecy checks.
 * Positioning failure is simulated. This does not save MPG or deploy.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { applyTripPremium } from "../src/lib/point-to-point-premium";
import {
  APPROVED_PRODUCTION_VEHICLE_MPG,
  approvedProductionProfitabilitySettings,
  defaultProfitabilitySettings,
  fuelCostPerMileGbp,
  isProfitabilityProtectionActive,
  normalizeProfitabilitySettings,
  UK_GALLON_LITRES,
} from "../src/lib/owner-profitability-settings";
import { toPublicOwnerPricingConfig, defaultOwnerPricingSettings } from "../shared/owner-pricing-config";
import { UNIVERSAL_ESTATE_PREMIUM_GBP } from "../shared/universal-distance-pricing";
import {
  applyProfitabilityProtection,
  protectSaloonOneWayFare,
  profitabilityFloorFromOperations,
  roundUpWholePoundGbp,
} from "../workers/addresses/src/profitability";

const root = process.cwd();

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

async function main() {
console.log("=== Rounding never goes down ===");
assert.equal(roundUpWholePoundGbp(63), 63);
assert.equal(roundUpWholePoundGbp(63.01), 64);
assert.equal(roundUpWholePoundGbp(63.99), 64);
assert.equal(roundUpWholePoundGbp(64), 64);

console.log("=== Rule selection ===");
{
  const floorWins = protectSaloonOneWayFare({
    existingCurveFareGbp: 32,
    minimumSaloonFareGbp: 38,
    profitabilityFloorGbp: 63.01,
    active: true,
  });
  assert.equal(floorWins.protectedFareGbp, 64);
  assert.equal(floorWins.rule, "PROFITABILITY FLOOR");

  const minimumWins = protectSaloonOneWayFare({
    existingCurveFareGbp: 31,
    minimumSaloonFareGbp: 38,
    profitabilityFloorGbp: 37.98,
    active: true,
  });
  assert.equal(minimumWins.protectedFareGbp, 38);
  assert.equal(minimumWins.rule, "MINIMUM FARE");

  const existingWins = protectSaloonOneWayFare({
    existingCurveFareGbp: 65,
    minimumSaloonFareGbp: 38,
    profitabilityFloorGbp: 60.2,
    active: true,
  });
  assert.equal(existingWins.protectedFareGbp, 65);
  assert.equal(existingWins.rule, "EXISTING FARE");

  const inactive = protectSaloonOneWayFare({
    existingCurveFareGbp: 32,
    minimumSaloonFareGbp: 38,
    profitabilityFloorGbp: 80,
    active: false,
  });
  assert.equal(inactive.protectedFareGbp, 32);
  assert.equal(inactive.rule, "NOT ACTIVE");
}

console.log("=== Fuel formula and inactive MPG ===");
{
  const defaults = defaultProfitabilitySettings();
  assert.equal(defaults.vehicleMpg, null);
  assert.equal(defaults.targetHourlyEarningsGbp, 40);
  assert.equal(defaults.minimumSaloonOneWayGbp, 38);
  assert.equal(defaults.dieselPricePerLitreGbp, 2);
  assert.equal(defaults.wearAllowancePerMileGbp, 0.1);
  assert.equal(isProfitabilityProtectionActive(defaults), false);
  assert.equal(isProfitabilityProtectionActive(normalizeProfitabilitySettings(undefined)), false);
  assert.equal(fuelCostPerMileGbp(2, null), null);
  assert.equal(normalizeProfitabilitySettings({ vehicleMpg: "nope" }).vehicleMpg, null);
  assert.equal(normalizeProfitabilitySettings({ vehicleMpg: 0 }).vehicleMpg, null);
  assert.equal(isProfitabilityProtectionActive({ vehicleMpg: -1 }), false);
  const perMile = fuelCostPerMileGbp(2, 40);
  assert.ok(perMile != null);
  assert.ok(Math.abs(perMile - (2 * UK_GALLON_LITRES) / 40) < 1e-9);

  const approved = approvedProductionProfitabilitySettings();
  assert.equal(approved.vehicleMpg, APPROVED_PRODUCTION_VEHICLE_MPG);
  assert.equal(approved.vehicleMpg, 47);
  assert.equal(approved.minimumSaloonOneWayGbp, 38);
  assert.equal(approved.dieselPricePerLitreGbp, 2);
  assert.equal(approved.wearAllowancePerMileGbp, 0.1);
  assert.equal(approved.targetHourlyEarningsGbp, 40);
  assert.equal(isProfitabilityProtectionActive(approved), true);
  const approvedPerMile = fuelCostPerMileGbp(2, 47);
  assert.ok(approvedPerMile != null);
  assert.ok(Math.abs(approvedPerMile - (2 * UK_GALLON_LITRES) / 47) < 1e-12);
  assert.ok(Math.abs(approvedPerMile - 0.19345063829787235) < 1e-12);
  assert.equal(UNIVERSAL_ESTATE_PREMIUM_GBP, 10);
}

console.log("=== Floor = time target + fuel + wear ===");
{
  const settings = { ...defaultProfitabilitySettings(), vehicleMpg: 40 };
  const floor = profitabilityFloorFromOperations({
    operationalMiles: 10,
    operationalMinutes: 30,
    settings,
  });
  assert.ok(floor);
  const expectedFuel = 10 * ((2 * UK_GALLON_LITRES) / 40);
  const expectedWear = 10 * 0.1;
  const expectedTime = 0.5 * 40;
  assert.ok(Math.abs(floor.fuelCostGbp - expectedFuel) < 1e-6);
  assert.ok(Math.abs(floor.wearCostGbp - expectedWear) < 1e-6);
  assert.ok(Math.abs(floor.targetTimeEarningsGbp - expectedTime) < 1e-6);
  assert.ok(Math.abs(floor.floorGbp - (expectedTime + expectedFuel + expectedWear)) < 1e-6);
  assert.equal(profitabilityFloorFromOperations({
    operationalMiles: 10,
    operationalMinutes: 30,
    settings: defaultProfitabilitySettings(),
  }), null);
}

console.log("=== Return discount uses protected legs and does not re-clamp ===");
{
  const premium = applyTripPremium(
    40,
    {
      outboundDate: "2026-08-19",
      outboundTime: "10:00",
      returnJourney: true,
      returnDate: "2026-08-19",
      returnTime: "18:00",
    },
    0.1,
    { returnOneWayFare: 50 },
  );
  assert.equal(Math.round(premium.total * 100) / 100, 85.5);
  assert.equal(premium.premiumAmount, 0);

  const night = applyTripPremium(
    40,
    {
      outboundDate: "2026-08-19",
      outboundTime: "05:00",
      returnJourney: true,
      returnDate: "2026-08-19",
      returnTime: "18:00",
    },
    0.1,
    { returnOneWayFare: 50 },
  );
  assert.equal(Math.round(night.premiumAmount * 100) / 100, 4);
  assert.equal(Math.round(night.total * 100) / 100, 89.5);
}

console.log("=== Failsafe keeps the existing fare ===");
{
  const approved = approvedProductionProfitabilitySettings();
  const pricing = {
    ...defaultOwnerPricingSettings(),
    profitability: approved,
  };
  const existing = {
    amountGbp: 65,
    journeyFareGbp: 65,
    airportFixedCostsGbp: 0,
    nightWeekendSurchargeGbp: 0,
  };
  const base = {
    vehicleType: "Standard Saloon (1–4 passengers)",
    routeMetrics: { distanceKm: 37.2, durationMinutes: 35 },
    pickup: { lat: 54.715, lng: -5.805 },
    dropoff: { lat: 54.6575, lng: -6.2158 },
    returnJourney: false,
    schedule: { outboundDate: "2026-10-01", outboundTime: "10:00", returnJourney: false },
    existing,
  };

  const missingMpg = await applyProfitabilityProtection({
    ...base,
    pricing: { ...pricing, profitability: defaultProfitabilitySettings() },
  });
  assert.equal(missingMpg.applied, false);
  assert.equal(missingMpg.fallbackReason, "mpg_not_configured");
  assert.equal(missingMpg.amountGbp, 65);

  const invalidMpg = await applyProfitabilityProtection({
    ...base,
    pricing: { ...pricing, profitability: { ...approved, vehicleMpg: null } },
  });
  assert.equal(invalidMpg.applied, false);
  assert.equal(invalidMpg.amountGbp, 65);

  const missingPoint = await applyProfitabilityProtection({
    ...base,
    pricing,
    pickup: null,
  });
  assert.equal(missingPoint.applied, false);
  assert.equal(missingPoint.fallbackReason, "missing_coordinates");
  assert.equal(missingPoint.amountGbp, 65);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    const routingFailed = await applyProfitabilityProtection({ ...base, pricing });
    assert.equal(routingFailed.applied, false);
    assert.equal(routingFailed.fallbackReason, "positioning_route_failed");
    assert.equal(routingFailed.amountGbp, 65);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const broken = await applyProfitabilityProtection({
    ...base,
    pricing: { profitability: approved, saloon: undefined } as unknown as typeof pricing,
  });
  assert.equal(broken.applied, false);
  assert.equal(broken.fallbackReason, "calculation_error");
  assert.equal(broken.amountGbp, 65);
}

console.log("=== Estate +£10 then return discount once ===");
{
  const outboundEstate = 41 + UNIVERSAL_ESTATE_PREMIUM_GBP;
  const returnEstate = 41 + UNIVERSAL_ESTATE_PREMIUM_GBP;
  assert.equal(outboundEstate, 51);
  const premium = applyTripPremium(
    outboundEstate,
    {
      outboundDate: "2026-10-01",
      outboundTime: "10:00",
      returnJourney: true,
      returnDate: "2026-10-02",
      returnTime: "10:00",
    },
    undefined,
    { returnDiscountRate: 0.05, returnOneWayFare: returnEstate },
  );
  assert.equal(Math.round(premium.total * 100) / 100, 96.9);
  assert.equal(premium.premiumAmount, 0);
  const twice = Math.round(premium.total * 0.95 * 100) / 100;
  assert.notEqual(Math.round(premium.total * 100) / 100, twice);
}

console.log("=== Public pricing payload omits profitability ===");
{
  const pub = toPublicOwnerPricingConfig(defaultOwnerPricingSettings());
  const text = JSON.stringify(pub);
  assert.equal("profitability" in pub, false);
  assert.doesNotMatch(text, /vehicleMpg|dieselPrice|Glen Manor|BT36 7FU|4\.54609/);
}

console.log("=== Operating base stays out of shared and public client modules ===");
{
  const banned = ["Glen Manor", "BT36 7FU", "7 Glen Manor"];
  const publicFiles = [
    "shared/owner-pricing-config.ts",
    "shared/universal-distance-pricing.ts",
    "src/lib/quote.ts",
    "src/lib/quote-service.ts",
    "src/lib/owner-profitability-settings.ts",
    "src/lib/owner-profitability-report.ts",
    "src/components/QuoteCard.tsx",
    "src/components/OwnerPricingPanel.tsx",
    "src/components/OwnerProfitabilityTester.tsx",
    "shared/booking-notifications.ts",
    "workers/addresses/src/quote-handlers.ts",
  ];
  for (const file of publicFiles) {
    const text = read(file);
    for (const secret of banned) {
      assert.equal(text.includes(secret), false, `${file} must not contain ${secret}`);
    }
  }
  const base = read("workers/addresses/src/operating-base.ts");
  assert.match(base, /Glen Manor/);
  assert.match(base, /BT36 7FU/);
  const quoteCard = read("src/components/QuoteCard.tsx");
  assert.doesNotMatch(quoteCard, /owner-profitability-settings/);
  assert.doesNotMatch(quoteCard, /operating-base/);
}

console.log("\nProfitability floor checks passed.");
}

void main();
