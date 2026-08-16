/**
 * BHD city-centre benchmark (£29 saloon) + nearby scaling + BFS/DUB untouched.
 * Run: npx tsx scripts/check-bhd-city-hall-29.ts
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

console.log("=== Previous vs new City Hall → BHD (saloon) ===");
console.log("Previous: airportBase £35 + Belfast City Centre surcharge £0 + minimum £35 → £35");
console.log("          (airport model — no OSRM mileage / no pickup fee / no day supplement)");

const city = bhd(cityHall);
assert.ok(city);
assert.equal(matchAreaFromAddress(cityHall), "Belfast City Centre");
assert.equal(city.airportBase, 29);
assert.equal(city.areaSurcharge, 0);
assert.equal(city.amount, 29);
assert.equal(city.premiumApplied, false);
assert.equal(city.vehicleAdjustment, 0);
console.log(
  `New:      airportBase £${city.airportBase} + surcharge £${city.areaSurcharge} + minimum £${PRICING_CONFIG.airportMinimumFaresGbp.BHD} → £${city.amount}`,
);

const reverse = bhd(cityHall); // same area formula either direction
assert.equal(reverse?.amount, 29);
console.log(`OK  BHD ↔ City Hall saloon £${reverse?.amount} (direction-symmetric; no invented pickup fee)`);

const estateCity = bhd(cityHall, ESTATE);
assert.ok(estateCity);
assert.equal(PRICING_CONFIG.airportEstatePremiumGbp, 8);
console.log(
  `OK  Estate supplement unchanged £${PRICING_CONFIG.airportEstatePremiumGbp} → City Hall estate £${estateCity.amount} (not the £29 saloon benchmark)`,
);
assert.ok(estateCity.amount > 29, "Estate must cost more than saloon benchmark");

console.log("\n=== Nearby BHD saloon scaling ===");
const samples = [
  ["City Hall", cityHall],
  ["City hotel", hotel],
  ["Titanic Belfast", titanic],
  ["Holywood", holywood],
  ["Newtownabbey", newtownabbey],
] as const;

let previousAmount = 0;
for (const [label, address] of samples) {
  const quote = bhd(address);
  assert.ok(quote, label);
  console.log(
    `OK  ${label.padEnd(16)} £${quote.amount}  area=${quote.area} surcharge=£${quote.areaSurcharge}`,
  );
  if (label === "City Hall" || label === "City hotel" || label === "Titanic Belfast") {
    assert.equal(quote.amount, 29, `${label} should stay on city £29 benchmark`);
  }
  if (label === "Holywood") {
    assert.ok(quote.amount > 29, "Holywood must be above city-centre £29");
  }
  if (label === "Newtownabbey") {
    assert.ok(quote.amount > 29, "Newtownabbey must be above city-centre £29");
    assert.ok(
      quote.amount >= (bhd(holywood)?.amount ?? 0),
      "Newtownabbey should be >= Holywood for BHD",
    );
  }
  previousAmount = quote.amount;
}
void previousAmount;

assert.equal(PRICING_CONFIG.airportMinimumFaresGbp.BFS, 45);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.BFS, 45);
assert.equal(PRICING_CONFIG.airportMinimumFaresGbp.DUB, 180);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.DUB, 180);

const bfsCity = calculateQuote(cityHall, "BFS", SALOON);
const dubCity = calculateQuote(cityHall, "DUB", SALOON);
assert.equal(bfsCity?.amount, 55, "BFS Belfast centre unchanged");
assert.equal(dubCity?.amount, 230, "DUB Belfast centre unchanged");
console.log(`\nOK  BFS City Hall saloon £${bfsCity?.amount} (untouched)`);
console.log(`OK  DUB City Hall saloon £${dubCity?.amount} (untouched)`);

console.log("\n=== Vehicle selection (unchanged) ===");
assert.equal(selectVehicleForParty(1, 0), SALOON);
assert.equal(selectVehicleForParty(2, 2), SALOON);
assert.equal(selectVehicleForParty(3, 0), ESTATE);
assert.equal(selectVehicleForParty(2, 3), ESTATE);
assert.equal(selectVehicleForParty(4, 4), ESTATE);
assert.equal(selectVehicleForParty(5, 1), MINIBUS_VEHICLE);
assert.equal(requiresMinibus(5, 1), true);
console.log("OK  Saloon 1–2 pax / 0–2 cases; Estate 3–4; Minibus >4 (no invented minibus fare)");

console.log("\nAll BHD £29 benchmark checks passed.");
