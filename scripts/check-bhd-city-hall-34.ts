/**
 * BHD city-centre + nearby: universal distance pricing (road miles required).
 * Run: npx tsx scripts/check-bhd-city-hall-34.ts
 */
import assert from "node:assert/strict";
import { calculateQuote, matchAreaFromAddress } from "../src/lib/quote";
import {
  calculateUniversalSaloonJourneyFareGbp,
  calculateUniversalEstateJourneyFareGbp,
} from "../shared/universal-distance-pricing";
import {
  ESTATE_VEHICLE,
  SALOON_VEHICLE,
  selectVehicleForParty,
} from "../src/lib/vehicle-selection";

const SALOON = SALOON_VEHICLE;
const ESTATE = ESTATE_VEHICLE;

/** ~3.5–4.5 road miles City Hall ↔ BHD (typical OSRM). */
const CITY_MILES = 4;
const cityMetrics = {
  distanceKm: CITY_MILES / 0.621371,
  durationMinutes: 12,
};

function bhd(address: string, vehicle: typeof SALOON | typeof ESTATE = SALOON) {
  return calculateQuote(address, "BHD", vehicle, false, {}, cityMetrics, false);
}

const cityHall = "Belfast City Hall, Belfast BT1 5GS";

console.log("=== City Hall → BHD (universal ~4 mi) ===");
const city = bhd(cityHall);
assert.ok(city);
assert.equal(matchAreaFromAddress(cityHall), "Belfast City Centre");
assert.equal(city.amount, 30);
assert.equal(city.journeyFareGbp, 30);
assert.equal(city.vehicleAdjustment, 0);
console.log(`OK  BHD ↔ City Hall saloon £${city.amount} at ~${CITY_MILES} mi`);

const estateCity = bhd(cityHall, ESTATE);
assert.ok(estateCity);
assert.equal(estateCity.amount, 36);
assert.equal(estateCity.vehicleAdjustment, 6);
console.log(`OK  City Hall estate £${estateCity.amount} (Saloon + £6)`);

console.log("\n=== No metrics → no zone fallback ===");
assert.equal(
  calculateQuote(cityHall, "BHD", SALOON, false, {}, null, false),
  null,
);
console.log("OK  null metrics refuse fare");

console.log("\n=== Vehicle selection unchanged ===");
assert.equal(selectVehicleForParty(2, 2), SALOON);
assert.equal(selectVehicleForParty(2, 3), ESTATE);
assert.equal(
  calculateUniversalEstateJourneyFareGbp(calculateUniversalSaloonJourneyFareGbp(4)),
  36,
);

console.log("\nAll BHD city-centre universal checks passed.");
