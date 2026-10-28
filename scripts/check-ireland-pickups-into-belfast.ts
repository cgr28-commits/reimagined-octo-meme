/**
 * Pickups anywhere in Ireland that FINISH in Greater Belfast get an instant
 * quote (public flag `irelandPickupsIntoBelfastInstant`, always on — the
 * mileage tiers price these journeys without the address-to-address drive charge).
 *
 * Run: tsx scripts/check-ireland-pickups-into-belfast.ts
 */

import assert from "node:assert/strict";
import {
  isIrelandPickupIntoGreaterBelfastJourney,
  needsManualQuoteApproval,
  type SelectedPlace,
} from "../src/lib/selected-place";
import { PREVIEW_BELFAST_CITY_HALL_PLACE as belfast } from "../src/lib/preview-customer-quote";
import {
  defaultOwnerPricingSettings,
  toPublicOwnerPricingConfig,
  type OwnerPricingSettings,
} from "../shared/owner-pricing-config";
import { defaultProfitabilitySettings } from "../src/lib/owner-profitability-settings";

function place(name: string, lat: number, lng: number, countryCode: string): SelectedPlace {
  return {
    ...belfast,
    placeId: `test-${name}`,
    placeName: `Test building in ${name}`,
    formattedAddress: `1 Test Street, ${name}, ${countryCode === "IE" ? "Ireland" : "Northern Ireland"}`,
    displayAddress: null,
    postalCode: null,
    locality: name,
    administrativeArea: null,
    lat,
    lng,
    countryCode,
  };
}

const ON = { irelandPickupsIntoBelfastInstant: true };
const OFF = { irelandPickupsIntoBelfastInstant: false };

console.log("=== Ireland pickups finishing in Greater Belfast ===");
const pickups = [
  ["Glenarm", 54.9661, -5.9558, "GB"],
  ["Derry", 54.997, -7.321, "GB"],
  ["Enniskillen", 54.3438, -7.631, "GB"],
  ["Ballycastle", 55.205, -6.242, "GB"],
  ["Cork", 51.8985, -8.4756, "IE"],
  ["Galway", 53.2707, -9.0568, "IE"],
  ["Letterkenny", 54.95, -7.737, "IE"],
] as const;
for (const [name, lat, lng, country] of pickups) {
  const pickup = place(name, lat, lng, country);
  assert.equal(isIrelandPickupIntoGreaterBelfastJourney(pickup, belfast), true, name);
  assert.equal(needsManualQuoteApproval(pickup, belfast), true, `${name}: manual when flag absent`);
  assert.equal(needsManualQuoteApproval(pickup, belfast, OFF), true, `${name}: manual when charge OFF`);
  assert.equal(needsManualQuoteApproval(pickup, belfast, ON), false, `${name}: instant when charge ON`);
  // Outbound from Belfast is unchanged (already instant).
  assert.equal(needsManualQuoteApproval(belfast, pickup, ON), false, `${name}: outbound unchanged`);
  assert.equal(needsManualQuoteApproval(belfast, pickup, OFF), false, `${name}: outbound unchanged`);
}

console.log("=== Must finish in Greater Belfast ===");
const glenarm = place("Glenarm", 54.9661, -5.9558, "GB");
// Ballymena is inside the owner's existing Greater Belfast boundary; Coleraine is not.
const coleraine = place("Coleraine", 55.1325, -6.6646, "GB");
assert.equal(isIrelandPickupIntoGreaterBelfastJourney(glenarm, coleraine), false);
assert.equal(
  needsManualQuoteApproval(glenarm, coleraine, ON),
  needsManualQuoteApproval(glenarm, coleraine, OFF),
  "outside Greater Belfast keeps its existing rule",
);
assert.equal(needsManualQuoteApproval(glenarm, coleraine, ON), true);

console.log("=== Pickups outside Ireland are not affected by the flag ===");
const london = place("London", 51.5074, -0.1278, "GB");
const londonPlace = { ...london, formattedAddress: "1 Test Street, London, UK" };
assert.equal(isIrelandPickupIntoGreaterBelfastJourney(londonPlace, belfast), false);
assert.equal(
  needsManualQuoteApproval(londonPlace, belfast, ON),
  needsManualQuoteApproval(londonPlace, belfast, OFF),
  "non-Ireland pickups keep their existing rule",
);
const paris = place("Paris", 48.8566, 2.3522, "FR");
assert.equal(isIrelandPickupIntoGreaterBelfastJourney(paris, belfast), false);

console.log("=== Incomplete addresses are not unlocked ===");
assert.equal(isIrelandPickupIntoGreaterBelfastJourney({ ...glenarm, placeId: "" }, belfast), false);

console.log("=== Public flag is always on (no drive charge needed) ===");
const base = defaultOwnerPricingSettings();
const withProfitability = (profitability: ReturnType<typeof defaultProfitabilitySettings>) =>
  ({ ...base, profitability }) as OwnerPricingSettings;
assert.equal(toPublicOwnerPricingConfig(base).irelandPickupsIntoBelfastInstant, true, "no settings → instant");
assert.equal(
  toPublicOwnerPricingConfig(withProfitability(defaultProfitabilitySettings())).irelandPickupsIntoBelfastInstant,
  true,
  "A2A drive charge OFF → still instant",
);
const a2aOn = { ...defaultProfitabilitySettings(), positioningA2aEnabled: true, positioningA2aRatePerMileGbp: 0.5 };
assert.equal(toPublicOwnerPricingConfig(withProfitability(a2aOn)).irelandPickupsIntoBelfastInstant, true, "A2A drive charge ON → instant");
const publicJson = JSON.stringify(toPublicOwnerPricingConfig(withProfitability(a2aOn)));
assert.ok(!/positioning|freeMiles|ratePerMile.*0\.5/i.test(publicJson), "no drive-charge details leak");

console.log("PASS");
