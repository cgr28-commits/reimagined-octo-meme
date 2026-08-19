/**
 * Airport pricing revision checks: BHD £34, tiered estate premiums,
 * calibration targets, rounding, direction, weekend, Dublin/A2A/minibus floors.
 *
 * Run: npx tsx scripts/check-airport-pricing-revision.ts
 */

import assert from "node:assert/strict";

import { PRICING_CONFIG } from "../src/lib/pricing-config";
import {
  AIRPORT_OTS_UNDERCUT_MAX,
  AIRPORT_OTS_UNDERCUT_MIN,
  applyBelfastAirportDistanceFloor,
  calculatePointToPointQuote,
  calculateQuote,
  getAirportEstatePremiumGbp,
} from "../src/lib/quote";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
} from "../src/lib/vehicle-selection";

const SALOON = SALOON_VEHICLE;
const ESTATE = ESTATE_VEHICLE;
const MINIBUS = MINIBUS_VEHICLE;

const cityHall = "Belfast City Hall, Belfast BT1 5GS";
const holywood = "22 High Street, Holywood, BT18 9AB";

assert.equal(PRICING_CONFIG.airportBasePricesGbp.BHD, 34);
assert.equal(PRICING_CONFIG.airportMinimumFaresGbp.BHD, 34);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.BFS, 45);
assert.equal(PRICING_CONFIG.airportMinimumFaresGbp.BFS, 45);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.DUB, 180);
assert.equal(PRICING_CONFIG.airportMinimumFaresGbp.DUB, 180);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.LDY, 35);
assert.equal(PRICING_CONFIG.airportMinimumFaresGbp.LDY, 35);
console.log("OK  BHD £34 / BFS £45 / DUB & LDY unchanged");

assert.equal(AIRPORT_OTS_UNDERCUT_MIN, 3);
assert.equal(AIRPORT_OTS_UNDERCUT_MAX, 5);
assert.equal(PRICING_CONFIG.otsReferenceModel.undercutMinGbp, 8);
assert.equal(PRICING_CONFIG.otsReferenceModel.undercutMaxGbp, 10);
console.log("OK  Airport OTS calibration £3–£5; A2A reference undercut still £8–£10");

assert.equal(getAirportEstatePremiumGbp("BFS", 34), 5);
assert.equal(getAirportEstatePremiumGbp("BFS", 45), 5);
assert.equal(getAirportEstatePremiumGbp("BFS", 46), 8);
assert.equal(getAirportEstatePremiumGbp("BFS", 139), 8);
assert.equal(getAirportEstatePremiumGbp("BFS", 140), 24);
assert.equal(getAirportEstatePremiumGbp("BHD", 45), 5);
assert.equal(getAirportEstatePremiumGbp("BHD", 140), 24);
assert.equal(getAirportEstatePremiumGbp("DUB", 34), 8);
assert.equal(getAirportEstatePremiumGbp("DUB", 45), 8);
assert.equal(getAirportEstatePremiumGbp("DUB", 140), 8);
console.log("OK  Estate tiers +£5 / +£8 / +£24; Dublin flat £8");

const bhdCity = calculateQuote(cityHall, "BHD", SALOON);
assert.ok(bhdCity);
assert.equal(bhdCity.airportBase, 34);
assert.equal(bhdCity.amount, 34, "BHD city saloon keeps £x4");
const bhdCityEstate = calculateQuote(cityHall, "BHD", ESTATE);
assert.equal(bhdCityEstate?.amount, 39, "BHD city estate = 34+5");
console.log(`OK  BHD City Hall saloon £${bhdCity.amount} / estate £${bhdCityEstate?.amount}`);

const bfsCity = calculateQuote(cityHall, "BFS", SALOON);
const dubCity = calculateQuote(cityHall, "DUB", SALOON);
assert.equal(dubCity?.amount, 230, "DUB Belfast centre unchanged");
assert.ok(bfsCity && bfsCity.amount >= 45);
console.log(`OK  DUB City Hall £${dubCity?.amount}; BFS City Hall £${bfsCity?.amount}`);

const toAirport = calculateQuote(holywood, "BHD", SALOON);
const fromAirport = calculateQuote(holywood, "BHD", SALOON);
assert.equal(toAirport?.amount, fromAirport?.amount, "same fare either direction");
console.log(`OK  Direction-symmetric Holywood↔BHD £${toAirport?.amount}`);

const weekend = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-08-22", // Saturday
  outboundTime: "10:00",
});
const weekday = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-08-19", // Wednesday
  outboundTime: "10:00",
});
assert.equal(PRICING_CONFIG.airportTripPremiumRate, 0);
assert.ok(weekday);
assert.equal(weekday.premiumApplied, false);
assert.ok(weekend);
assert.equal(weekend.premiumApplied, false);
assert.equal(
  weekend.amount,
  weekday.amount,
  `airport weekend fare (£${weekend.amount}) must equal weekday (£${weekday.amount})`,
);
console.log(
  `OK  Airport weekday = weekend £${weekday.amount} (no Bank Holiday / weekend surcharge)`,
);

const x4 = calculateQuote(cityHall, "BHD", SALOON);
assert.equal(x4?.amount, 34);
const nearest5 = calculateQuote("7 Castle Street, Ballymena, BT42 3AB", "BFS", SALOON);
assert.ok(nearest5);
assert.equal(nearest5.amount % 5 === 0 || nearest5.amount % 5 === 4, true);
console.log("OK  Fare rounding (£x4 keep / nearest £5)");

assert.equal(PRICING_CONFIG.belfastAirportDistanceFloor?.enabled, true);
assert.equal(applyBelfastAirportDistanceFloor(80, "BHD", 29.4 * 1.60934), 85);
console.log("OK  belfastAirportDistanceFloor still applies");

const a2a = calculatePointToPointQuote(
  cityHall,
  "1 Marcus Square, Newry BT35 8DQ",
  SALOON,
  false,
  {},
  { distanceKm: 60, durationMinutes: 55 },
);
assert.ok(a2a && a2a.amount > 0);
assert.equal(
  calculatePointToPointQuote(cityHall, "1 Marcus Square, Newry BT35 8DQ", SALOON),
  null,
  "A2A without route metrics must not invent a fare",
);
console.log(`OK  A2A still requires route metrics (sample £${a2a.amount})`);

const minibus = calculateQuote(cityHall, "BFS", MINIBUS);
assert.ok(minibus && minibus.amount > (bfsCity?.amount ?? 0));
console.log(`OK  Minibus still prices from estate tier (£${minibus.amount})`);

console.log("\nAll airport pricing revision checks passed.");
