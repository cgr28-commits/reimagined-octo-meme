/**
 * Belfast City Airport (BHD) minimum Saloon fare. Off by default (£0); when set,
 * it floors each BHD leg like the Belfast International (BFS) minimum.
 *
 * Run: tsx scripts/check-bhd-minimum.ts
 */
import assert from "node:assert/strict";
import { applyBfsMinimumFare } from "../shared/bfs-minimum-fare";
import {
  DEFAULT_BHD_MINIMUM_SALOON_FARE_GBP,
  defaultOwnerPricingSettings,
  diffOwnerPricingSettings,
  ownerPricingEngineOptions,
  toPublicOwnerPricingConfig,
  validateOwnerPricingInput,
} from "../shared/owner-pricing-config";
import { calculateQuote } from "../src/lib/quote";
import { ESTATE_VEHICLE, SALOON_VEHICLE } from "../src/lib/vehicle-selection";

const settings = defaultOwnerPricingSettings();
settings.saloonFormula = { enabled: true, startingChargeGbp: 10, ratePerMileGbp: 2.5, minimumFareGbp: 30 };
settings.estate.upliftGbp = 7;
settings.night.enabled = false;
settings.weekend.enabled = false;
settings.bfsMinimumSaloonFareGbp = 38;
const schedule = { outboundDate: "2026-11-10", outboundTime: "12:00" };
const metrics = (fare: number) => ({ distanceKm: Math.max(0, (fare - 10) / 2.5) / 0.621371, durationMinutes: 20 });
const address = "12 Donegall Square, Belfast BT1 5GS";

console.log("=== Off by default ===");
assert.equal(DEFAULT_BHD_MINIMUM_SALOON_FARE_GBP, 0);
assert.equal(defaultOwnerPricingSettings().bhdMinimumSaloonFareGbp, 0);
assert.equal(applyBfsMinimumFare(30, SALOON_VEHICLE, ["BHD"], settings), 30, "no BHD floor when unset");
assert.equal(calculateQuote(address, "BHD", SALOON_VEHICLE, false, schedule, metrics(30), true, settings)!.journeyFareGbp, 30);

console.log("=== £38 floor on BHD legs, both directions, Saloon and Estate ===");
const withBhd = { ...settings, bhdMinimumSaloonFareGbp: 38 };
for (const fromAirport of [false, true]) {
  for (const [normal, expected] of [[30, 38], [37.99, 38], [38, 38], [52, 52]] as const) {
    const saloon = calculateQuote(address, "BHD", SALOON_VEHICLE, false, schedule, metrics(normal), fromAirport, withBhd)!;
    assert.equal(saloon.journeyFareGbp, Math.max(expected, Math.round(normal)), `saloon ${normal} → ${expected}`);
    const estate = calculateQuote(address, "BHD", ESTATE_VEHICLE, false, schedule, metrics(normal), fromAirport, withBhd)!;
    assert.equal(estate.journeyFareGbp, saloon.journeyFareGbp! + 7, "estate = saloon floor + uplift");
    const viaPublic = calculateQuote(address, "BHD", SALOON_VEHICLE, false, schedule, metrics(normal), fromAirport, toPublicOwnerPricingConfig(withBhd))!;
    assert.equal(viaPublic.amount, saloon.amount, "public config parity");
  }
}

console.log("=== BFS unaffected by the BHD setting; BFS↔BHD uses the higher floor ===");
assert.equal(applyBfsMinimumFare(30, SALOON_VEHICLE, ["BFS"], { ...withBhd, bhdMinimumSaloonFareGbp: 50 }), 38);
assert.equal(applyBfsMinimumFare(30, SALOON_VEHICLE, ["BFS", "BHD"], { ...withBhd, bhdMinimumSaloonFareGbp: 50 }), 50);
assert.equal(applyBfsMinimumFare(30, SALOON_VEHICLE, ["DUB"], withBhd), 30, "other airports unaffected");

console.log("=== Validation, public config and change summary ===");
const valid = validateOwnerPricingInput({ ...withBhd });
assert.ok(valid.ok, "38 is valid");
if (valid.ok) assert.equal(valid.settings.bhdMinimumSaloonFareGbp, 38);
const legacy = validateOwnerPricingInput({ ...settings, bhdMinimumSaloonFareGbp: undefined });
assert.ok(legacy.ok && legacy.settings.bhdMinimumSaloonFareGbp === 0, "older saves default to off");
assert.ok(!validateOwnerPricingInput({ ...settings, bhdMinimumSaloonFareGbp: -1 }).ok, "negative rejected");
assert.ok(!validateOwnerPricingInput({ ...settings, bhdMinimumSaloonFareGbp: 38.005 }).ok, "3dp rejected");
assert.equal(toPublicOwnerPricingConfig(withBhd).bhdMinimumSaloonFareGbp, 38);
assert.equal(ownerPricingEngineOptions(withBhd).bhdMinimumSaloonFareGbp, 38, "engine options carry the floor");
const diff = diffOwnerPricingSettings(settings, withBhd);
assert.ok(diff.some(row => /Belfast City Airport/.test(row.setting) && row.oldValue === "No minimum" && row.newValue === "£38.00"), "confirm dialog shows the change");

console.log("PASS");
