/**
 * Profitability floor — formula, fail-safe, and secrecy checks.
 * Does not call OSRM and does not activate protection.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { applyTripPremium } from "../src/lib/point-to-point-premium";
import {
  defaultProfitabilitySettings,
  fuelCostPerMileGbp,
  isProfitabilityProtectionActive,
  normalizeProfitabilitySettings,
  UK_GALLON_LITRES,
} from "../src/lib/owner-profitability-settings";
import { toPublicOwnerPricingConfig, defaultOwnerPricingSettings } from "../shared/owner-pricing-config";
import {
  protectSaloonOneWayFare,
  profitabilityFloorFromOperations,
  roundUpWholePoundGbp,
} from "../workers/addresses/src/profitability";

const root = process.cwd();

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

console.log("=== Rounding never goes down ===");
assert.equal(roundUpWholePoundGbp(63), 63);
assert.equal(roundUpWholePoundGbp(63.01), 64);
assert.equal(roundUpWholePoundGbp(63.99), 64);
assert.equal(roundUpWholePoundGbp(64), 64);

console.log("=== Rule selection ===");
{
  const floorWins = protectSaloonOneWayFare({
    existingCurveFareGbp: 32,
    minimumSaloonFareGbp: 39,
    profitabilityFloorGbp: 63.01,
    active: true,
  });
  assert.equal(floorWins.protectedFareGbp, 64);
  assert.equal(floorWins.rule, "PROFITABILITY FLOOR");

  const minimumWins = protectSaloonOneWayFare({
    existingCurveFareGbp: 32,
    minimumSaloonFareGbp: 39,
    profitabilityFloorGbp: 30,
    active: true,
  });
  assert.equal(minimumWins.protectedFareGbp, 39);
  assert.equal(minimumWins.rule, "MINIMUM FARE");

  const existingWins = protectSaloonOneWayFare({
    existingCurveFareGbp: 65,
    minimumSaloonFareGbp: 39,
    profitabilityFloorGbp: 60.2,
    active: true,
  });
  assert.equal(existingWins.protectedFareGbp, 65);
  assert.equal(existingWins.rule, "EXISTING FARE");

  const inactive = protectSaloonOneWayFare({
    existingCurveFareGbp: 32,
    minimumSaloonFareGbp: 39,
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
  assert.equal(defaults.minimumSaloonOneWayGbp, 39);
  assert.equal(defaults.dieselPricePerLitreGbp, 2);
  assert.equal(defaults.wearAllowancePerMileGbp, 0.1);
  assert.equal(isProfitabilityProtectionActive(defaults), false);
  assert.equal(fuelCostPerMileGbp(2, null), null);
  assert.equal(normalizeProfitabilitySettings({ vehicleMpg: "nope" }).vehicleMpg, null);
  const perMile = fuelCostPerMileGbp(2, 40);
  assert.ok(perMile != null);
  assert.ok(Math.abs(perMile - (2 * UK_GALLON_LITRES) / 40) < 1e-9);
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
