/**
 * BHD city-centre benchmark (£34 saloon) + nearby scaling + BFS/DUB untouched.
 * Run: npx tsx scripts/check-bhd-city-hall-34.ts
 */

import assert from "node:assert/strict";
import { PRICING_CONFIG } from "../src/lib/pricing-config";
import { calculateQuote, matchAreaFromAddress } from "../src/lib/quote";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  requiresMinibus,
  selectVehicleForParty,
} from "../src/lib/vehicle-selection";

const SALOON = SALOON_VEHICLE;
const ESTATE = ESTATE_VEHICLE;

function bhd(address: string, vehicle: typeof SALOON | typeof ESTATE = SALOON) {
  return calculateQuote(address, "BHD", vehicle);
}

const cityHall = "Belfast City Hall, Belfast BT1 5GS";
const hotel = "Europa Hotel, Great Victoria Street, Belfast BT2 7BA";
const titanic = "Titanic Belfast, 1 Olympic Way, Belfast BT3 9EP";
const holywood = "22 High Street, Holywood, BT18 9AB";
const newtownabbey = "Glengormley, Newtownabbey BT36 7QU";

console.log("=== City Hall → BHD (saloon) ===");

const city = bhd(cityHall);
assert.ok(city);
assert.equal(matchAreaFromAddress(cityHall), "Belfast City Centre");
assert.equal(city.airportBase, 34);
assert.equal(city.areaSurcharge, 0);
assert.equal(city.amount, 34);
assert.equal(city.premiumApplied, false);
assert.equal(city.vehicleAdjustment, 0);
console.log(
  `airportBase £${city.airportBase} + surcharge £${city.areaSurcharge} + minimum £${PRICING_CONFIG.airportMinimumFaresGbp.BHD} → £${city.amount}`,
);

const reverse = bhd(cityHall);
assert.equal(reverse?.amount, 34);
console.log(`OK  BHD ↔ City Hall saloon £${reverse?.amount} (direction-symmetric)`);

const estateCity = bhd(cityHall, ESTATE);
assert.ok(estateCity);
assert.equal(estateCity.amount, 39);
assert.equal(estateCity.vehicleAdjustment, 5);
console.log(`OK  City Hall estate £${estateCity.amount} (34+£5 short-tier premium)`);

console.log("\n=== Nearby BHD saloon scaling ===");
const samples = [
  ["City Hall", cityHall],
  ["City hotel", hotel],
  ["Titanic Belfast", titanic],
  ["Holywood", holywood],
  ["Newtownabbey", newtownabbey],
] as const;

for (const [label, address] of samples) {
  const quote = bhd(address);
  assert.ok(quote, label);
  console.log(
    `OK  ${label.padEnd(16)} £${quote.amount}  area=${quote.area} surcharge=£${quote.areaSurcharge}`,
  );
  if (label === "City Hall" || label === "City hotel" || label === "Titanic Belfast") {
    assert.equal(quote.amount, 34, `${label} should stay on city £34 benchmark`);
  }
  if (label === "Holywood") {
    assert.ok(quote.amount >= 34, "Holywood must be at/above city-centre £34");
  }
  if (label === "Newtownabbey") {
    assert.ok(quote.amount >= 34, "Newtownabbey must be at/above city-centre £34");
  }
}

assert.equal(PRICING_CONFIG.airportMinimumFaresGbp.BFS, 45);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.BFS, 45);
assert.equal(PRICING_CONFIG.airportMinimumFaresGbp.DUB, 180);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.DUB, 180);

const bfsCity = calculateQuote(cityHall, "BFS", SALOON);
const dubCity = calculateQuote(cityHall, "DUB", SALOON);
assert.equal(dubCity?.amount, 230, "DUB Belfast centre unchanged");
console.log(`\nOK  BFS City Hall saloon £${bfsCity?.amount}`);
console.log(`OK  DUB City Hall saloon £${dubCity?.amount} (untouched)`);

console.log("\n=== Vehicle selection ===");
assert.equal(selectVehicleForParty(1, 0), SALOON);
assert.equal(selectVehicleForParty(2, 2), SALOON);
assert.equal(selectVehicleForParty(3, 0), SALOON);
assert.equal(selectVehicleForParty(3, 2), SALOON);
assert.equal(selectVehicleForParty(4, 2), SALOON);
assert.equal(selectVehicleForParty(2, 3), ESTATE);
assert.equal(selectVehicleForParty(4, 4), ESTATE);
assert.equal(selectVehicleForParty(5, 1), MINIBUS_VEHICLE);
assert.equal(requiresMinibus(5, 1), true);
console.log("OK  Saloon 1–4 pax / 0–2 cases; Estate 1–4 pax / 3–4 cases; Minibus 5–7");

console.log("\nAll BHD £34 benchmark checks passed.");
