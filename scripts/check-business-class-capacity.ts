/**
 * Business Class capacity: 1–3 passengers and up to 2 large suitcases.
 * Run: npx tsx scripts/check-business-class-capacity.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import {
  BUSINESS_CLASS_MAX_LARGE_SUITCASES,
  BUSINESS_CLASS_MAX_PASSENGERS,
  ESTATE_VEHICLE,
  EXECUTIVE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  keepOrSmallestSuitableVehicle,
  resolvePublicVehicleChoice,
  selectVehicleForParty,
  suitableVehicleTypesForParty,
  vehicleFitsParty,
} from "../src/lib/vehicle-selection";
import {
  EXECUTIVE_CUSTOMER_CAPACITY,
  EXECUTIVE_LUGGAGE_CAPACITY,
} from "../shared/vehicle-display";
import {
  BUSINESS_CLASS_WATER_INCLUDED,
  DEFAULT_EXECUTIVE_MULTIPLIER,
} from "../shared/executive-vehicle";
import { UNIVERSAL_ESTATE_PREMIUM_GBP, calculateUniversalJourneyFareGbp } from "../shared/universal-distance-pricing";
import { roundGbp } from "../shared/gbp";
import { defaultOwnerPricingSettings } from "../shared/owner-pricing-config";

const flags = { publicMinibusEnabled: true, publicExecutiveEnabled: true };

assert.equal(BUSINESS_CLASS_MAX_PASSENGERS, 3);
assert.equal(BUSINESS_CLASS_MAX_LARGE_SUITCASES, 2);
assert.equal(EXECUTIVE_CUSTOMER_CAPACITY, "1–3 passengers");
assert.equal(EXECUTIVE_LUGGAGE_CAPACITY, "2 large suitcases");
assert.equal(BUSINESS_CLASS_WATER_INCLUDED, "Complimentary water included");
assert.equal(DEFAULT_EXECUTIVE_MULTIPLIER, 1.5);
assert.equal(UNIVERSAL_ESTATE_PREMIUM_GBP, 10);

for (const passengers of [1, 2, 3]) {
  for (const suitcases of [0, 1, 2]) {
    assert.equal(
      vehicleFitsParty(EXECUTIVE_VEHICLE, passengers, suitcases),
      true,
      `${passengers}p/${suitcases}c`,
    );
  }
}
assert.equal(vehicleFitsParty(EXECUTIVE_VEHICLE, 4, 2), false);
assert.equal(vehicleFitsParty(EXECUTIVE_VEHICLE, 4, 0), false);
assert.equal(vehicleFitsParty(EXECUTIVE_VEHICLE, 3, 3), false);
assert.equal(vehicleFitsParty(EXECUTIVE_VEHICLE, 2, 3), false);
assert.equal(vehicleFitsParty(SALOON_VEHICLE, 4, 2), true);
assert.equal(vehicleFitsParty(SALOON_VEHICLE, 4, 3), false);
assert.equal(vehicleFitsParty(ESTATE_VEHICLE, 4, 4), true);
assert.equal(vehicleFitsParty(MINIBUS_VEHICLE, 7, 2), true);

const fourPassengers = suitableVehicleTypesForParty(4, 2, flags);
assert.equal(fourPassengers.includes(EXECUTIVE_VEHICLE), false);
assert.equal(fourPassengers.includes(SALOON_VEHICLE), true);
assert.equal(suitableVehicleTypesForParty(3, 3, flags).includes(EXECUTIVE_VEHICLE), false);
assert.equal(suitableVehicleTypesForParty(3, 2, flags).includes(EXECUTIVE_VEHICLE), true);

assert.equal(
  keepOrSmallestSuitableVehicle({
    current: EXECUTIVE_VEHICLE,
    passengers: 4,
    suitcases: 2,
    ...flags,
  }),
  SALOON_VEHICLE,
);
assert.equal(
  keepOrSmallestSuitableVehicle({
    current: EXECUTIVE_VEHICLE,
    passengers: 3,
    suitcases: 3,
    ...flags,
  }),
  ESTATE_VEHICLE,
);
assert.equal(
  keepOrSmallestSuitableVehicle({
    current: EXECUTIVE_VEHICLE,
    passengers: 3,
    suitcases: 2,
    ...flags,
  }),
  EXECUTIVE_VEHICLE,
);
assert.equal(selectVehicleForParty(4, 2), SALOON_VEHICLE);
assert.equal(selectVehicleForParty(3, 2), SALOON_VEHICLE);

const pricing = {
  ...defaultOwnerPricingSettings(),
  minibus: { publicEnabled: true, multiplier: 1.55 },
};
const metrics = { distanceKm: 22, durationMinutes: 25 };
function quote(vehicle: string, passengers: number, suitcases: number, ownerMode = false) {
  return calculateAuthoritativeWebsiteQuote({
    pickupAddress: "Belfast City Hall, Belfast",
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS",
    fromAirport: false,
    returnJourney: false,
    passengers,
    suitcases,
    routeMetrics: metrics,
    vehicleType: vehicle,
    pricing,
    ownerMode,
  });
}

for (const passengers of [1, 2, 3]) {
  const accepted = quote(EXECUTIVE_VEHICLE, passengers, 2);
  assert.equal(accepted.ok, true, `accept ${passengers}`);
  if (accepted.ok) assert.equal(accepted.vehicleType, EXECUTIVE_VEHICLE);
}
const tooManyPassengers = quote(EXECUTIVE_VEHICLE, 4, 2);
const tooManyBags = quote(EXECUTIVE_VEHICLE, 3, 3);
const ownerBypass = quote(EXECUTIVE_VEHICLE, 4, 1, true);
assert.equal(tooManyPassengers.ok, false);
assert.equal(tooManyBags.ok, false);
assert.equal(ownerBypass.ok, false);
if (!tooManyPassengers.ok) assert.equal(tooManyPassengers.reason, "vehicle_unavailable");
if (!tooManyBags.ok) assert.equal(tooManyBags.reason, "vehicle_unavailable");
if (!ownerBypass.ok) assert.equal(ownerBypass.reason, "vehicle_unavailable");

const saloon = quote(SALOON_VEHICLE, 4, 2);
const estate = quote(ESTATE_VEHICLE, 4, 2);
const business = quote(EXECUTIVE_VEHICLE, 2, 2);
assert.equal(saloon.ok, true);
assert.equal(estate.ok, true);
assert.equal(business.ok, true);
if (saloon.ok && estate.ok && business.ok) {
  assert.equal(
    (estate.journeyFareGbp ?? estate.amount) - (saloon.journeyFareGbp ?? saloon.amount),
    UNIVERSAL_ESTATE_PREMIUM_GBP,
  );
  assert.equal(
    business.journeyFareGbp,
    roundGbp((saloon.journeyFareGbp ?? saloon.amount) * DEFAULT_EXECUTIVE_MULTIPLIER),
  );
}

assert.equal(
  calculateUniversalJourneyFareGbp(0, EXECUTIVE_VEHICLE, {
    saloonFareGbp: 29,
    executiveMultiplier: 1.4,
    executiveMinimumGbp: 105,
  }).journeyFareGbp,
  roundGbp(29 * 1.4),
);

const forced = resolvePublicVehicleChoice({
  requested: EXECUTIVE_VEHICLE,
  passengers: 4,
  suitcases: 1,
  ...flags,
});
assert.equal(forced.ok, false);

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const categories = read("src/components/QuoteVehicleCategories.tsx");
const showcase = read("src/components/QuoteResultShowcase.tsx");
const card = read("src/components/QuoteCard.tsx");
const fleet = read("src/components/VehiclesSection.tsx");
const sharedCopy = read("shared/executive-vehicle.ts");
assert.match(categories, /EXECUTIVE_CUSTOMER_CAPACITY/);
assert.match(categories, /EXECUTIVE_LUGGAGE_CAPACITY/);
assert.match(categories, /1–4 passengers/);
assert.match(categories, /SALOON_LUGGAGE_CAPACITY = "2 large suitcases"/);
assert.match(categories, /grid-cols-\[6\.4rem_minmax\(0,1fr\)_1\.5rem\]/);
assert.match(categories, /QuoteLuggageIcon/);
assert.match(categories, /QuoteCrownIcon/);
assert.match(categories, /disabled=\{!fits\}/);
assert.doesNotMatch(categories, /w-\[3\.1rem\]/);
assert.match(showcase, /isExecutive[\s\S]*1–3 passengers/);
assert.match(showcase, /1–4 passengers/);
assert.match(card, /Complimentary water included/);
assert.doesNotMatch(card, /bottled water|Bottle of water|Complimentary bottled water/);
assert.match(fleet, /Complimentary water included/);
assert.doesNotMatch(fleet, /bottled water/);
assert.match(fleet, /Business Class carries 1–3 passengers and up to 2 large suitcases/);
assert.match(sharedCopy, /Complimentary water included/);
assert.doesNotMatch(sharedCopy, /bottled water/);
assert.doesNotMatch(read("src/components/quote-vehicle-line-icons.tsx"), /w-\[3\.1rem\]/);

const capacityCopy = "Business Class carries 1–3 passengers and up to 2 large suitcases";
for (const rel of [
  "src/app/transfers/[slug]/page.tsx",
  "src/lib/transfer-routes-belfast.ts",
  "src/lib/transfer-routes-content.ts",
  "src/lib/terms.ts",
  "src/lib/data.ts",
]) {
  const source = read(rel);
  assert.match(source, new RegExp(capacityCopy));
  assert.doesNotMatch(source, /Business Class carry up to 4/);
  assert.doesNotMatch(source, /and Business Class carry up to 4/);
}
assert.match(read("src/app/page.tsx"), /VehiclesSection/);
assert.doesNotMatch(read("src/app/page.tsx"), /bottled water/);
assert.match(read("src/lib/data.ts"), /Complimentary water included/);
assert.doesNotMatch(read("src/lib/data.ts"), /bottled water/);

console.log("OK  business class capacity");
