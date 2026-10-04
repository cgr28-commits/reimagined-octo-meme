/**
 * Executive is Saloon + the dashboard upgrade (default £20), capped at 3 passengers
 * and 3 large suitcases. Estate default is +£6. Airport charges stay separate.
 */
import assert from "node:assert/strict";
import { calculateUniversalJourneyFareGbp } from "../shared/universal-distance-pricing";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_EXECUTIVE_UPLIFT_GBP,
  EXECUTIVE_MAX_SUITCASES,
  EXECUTIVE_VEHICLE_TYPE,
  executiveAvailableForParty,
  executivePreferenceFields,
  formatExecutivePreferenceLines,
  isPremiumExecutiveVehicle,
  publicVehicleEligibilityMessage,
} from "../shared/executive-service";
import { defaultOwnerPricingSettings, normalizeOwnerPricingSettings } from "../shared/owner-pricing-config";
import { getReturnJourneyFare } from "../src/lib/point-to-point-premium";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { RETURN_JOURNEY_DISCOUNT_RATE } from "../shared/return-journey-discount";
import { vehicleServiceCode } from "../shared/booking-notice";
import { vehicleReportLabel } from "../shared/quote-session";
import { resolvePublicBookingVehicle } from "../src/lib/vehicle-selection";
import { isInstantPayVehicle } from "../src/lib/data";

const SALOON = "Standard Saloon (1–4 passengers)";
const ESTATE = "Estate Car (1–4 passengers)";
const LEGACY = "Executive Saloon (1–4 passengers)";

const saloon = calculateUniversalJourneyFareGbp(20, SALOON);
const estate = calculateUniversalJourneyFareGbp(20, ESTATE);
const executive = calculateUniversalJourneyFareGbp(20, EXECUTIVE_VEHICLE_TYPE);
const legacy = calculateUniversalJourneyFareGbp(20, LEGACY);

assert.equal(estate.journeyFareGbp, saloon.journeyFareGbp + 6);
assert.equal(executive.journeyFareGbp, saloon.journeyFareGbp + DEFAULT_EXECUTIVE_UPLIFT_GBP);
assert.equal(executive.vehicleAdjustmentGbp, 20);
assert.equal(executive.journeyFareGbp, 73);
assert.notEqual(legacy.journeyFareGbp, saloon.journeyFareGbp + 20);
assert.ok(legacy.journeyFareGbp >= 105);

const customEstate = calculateUniversalJourneyFareGbp(20, ESTATE, { estatePremiumGbp: 6 });
assert.equal(customEstate.journeyFareGbp, saloon.journeyFareGbp + 6);
const executiveIgnoresEstateUplift = calculateUniversalJourneyFareGbp(20, EXECUTIVE_VEHICLE_TYPE, {
  estatePremiumGbp: 6,
});
assert.equal(
  executiveIgnoresEstateUplift.journeyFareGbp,
  saloon.journeyFareGbp + DEFAULT_EXECUTIVE_UPLIFT_GBP,
);
const executiveDashboard = calculateUniversalJourneyFareGbp(20, EXECUTIVE_VEHICLE_TYPE, {
  executivePremiumGbp: 25,
  estatePremiumGbp: 6,
});
assert.equal(executiveDashboard.journeyFareGbp, saloon.journeyFareGbp + 25);
assert.equal(defaultOwnerPricingSettings().executive.upliftGbp, 20);
assert.equal(defaultOwnerPricingSettings().estate.upliftGbp, 6);
const legacySaved = normalizeOwnerPricingSettings({
  ...defaultOwnerPricingSettings(),
  executive: undefined,
  estate: { upliftGbp: 8 },
});
assert.equal(legacySaved.estate.upliftGbp, 8);
assert.equal(legacySaved.executive.upliftGbp, 20);

const returnExecutive = getReturnJourneyFare(executive.journeyFareGbp);
assert.ok(
  Math.abs(
    returnExecutive - executive.journeyFareGbp * 2 * (1 - RETURN_JOURNEY_DISCOUNT_RATE),
  ) < 1e-9,
);
const airportCharge = 8;
assert.equal(returnExecutive + airportCharge - returnExecutive, airportCharge);

assert.equal(executiveAvailableForParty(1, 0), true);
assert.equal(executiveAvailableForParty(1, 1), true);
assert.equal(executiveAvailableForParty(2, 2), true);
assert.equal(executiveAvailableForParty(3, 2), true);
assert.equal(executiveAvailableForParty(3, 3), true);
assert.equal(executiveAvailableForParty(1, 3), true);
assert.equal(executiveAvailableForParty(3, 4), false);
assert.equal(executiveAvailableForParty(4, 0), false);
assert.equal(executiveAvailableForParty(4, 3), false);
assert.equal(executiveAvailableForParty(3, 5), false);
assert.equal(EXECUTIVE_MAX_SUITCASES, 3);
assert.equal(publicVehicleEligibilityMessage(EXECUTIVE_VEHICLE_TYPE, 2, 3), null);
assert.equal(
  publicVehicleEligibilityMessage(EXECUTIVE_VEHICLE_TYPE, 2, 4),
  "Executive is available for up to 3 large suitcases.",
);
assert.equal(
  publicVehicleEligibilityMessage(EXECUTIVE_VEHICLE_TYPE, 4, 1),
  "Executive is available for up to 3 passengers.",
);

assert.equal(isInstantPayVehicle(EXECUTIVE_VEHICLE_TYPE), true);
assert.equal(isInstantPayVehicle(LEGACY), false);
assert.equal(resolvePublicBookingVehicle(EXECUTIVE_VEHICLE_TYPE), EXECUTIVE_VEHICLE_TYPE);
assert.notEqual(resolvePublicBookingVehicle(EXECUTIVE_VEHICLE_TYPE), SALOON);
assert.equal(vehicleServiceCode(EXECUTIVE_VEHICLE_TYPE), "EXECUTIVE");
assert.equal(vehicleServiceCode(LEGACY), "SALOON");
assert.equal(vehicleReportLabel(EXECUTIVE_VEHICLE_TYPE), "Executive");
assert.equal(vehicleReportLabel("Executive Saloon (1–4 passengers)"), "Saloon");

const prefs = executivePreferenceFields({
  vehicle: EXECUTIVE_VEHICLE_TYPE,
  quietJourney: true,
  climatePreference: "cooler",
});
assert.deepEqual(prefs, { quietJourney: true, climatePreference: "cooler" });
assert.deepEqual(
  executivePreferenceFields({ vehicle: SALOON, quietJourney: true, climatePreference: "warmer" }),
  {},
);
assert.deepEqual(formatExecutivePreferenceLines({ ...prefs, vehicle: EXECUTIVE_VEHICLE_TYPE }), [
  "Quiet Journey: Yes",
  "Climate preference: Cooler",
]);

assert.equal(isPremiumExecutiveVehicle(LEGACY), false);

const metrics = { distanceKm: 14 / 0.621371, durationMinutes: 25 };
const quoteBase = {
  pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
  dropoffAddress: "Belfast International Airport",
  airportCode: "BFS",
  fromAirport: false,
  suitcases: 1,
  routeMetrics: metrics,
  outboundDate: "2026-12-01",
  outboundTime: "10:00",
};
const saloonQuote = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 2,
  vehicleType: SALOON,
  returnJourney: false,
});
const estateQuote = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 2,
  vehicleType: ESTATE,
  returnJourney: false,
});
const executiveQuote = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 2,
  vehicleType: EXECUTIVE_VEHICLE_TYPE,
  returnJourney: false,
});
assert.equal(saloonQuote.ok && estateQuote.ok && executiveQuote.ok, true);
if (saloonQuote.ok && estateQuote.ok && executiveQuote.ok) {
  const saloonFare = saloonQuote.journeyFareGbp ?? saloonQuote.amount;
  const estateFare = estateQuote.journeyFareGbp ?? estateQuote.amount;
  const executiveFare = executiveQuote.journeyFareGbp ?? executiveQuote.amount;
  assert.equal(estateFare, saloonFare + 6);
  assert.equal(executiveFare, saloonFare + 20);
  assert.equal(executiveQuote.airportFixedCostsGbp ?? 0, saloonQuote.airportFixedCostsGbp ?? 0);
  assert.equal(executiveQuote.vehicleType, EXECUTIVE_VEHICLE_TYPE);
}

const executiveReturn = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 3,
  vehicleType: EXECUTIVE_VEHICLE_TYPE,
  returnJourney: true,
  returnDate: "2026-12-08",
  returnTime: "16:00",
});
assert.equal(executiveReturn.ok, true);
if (executiveReturn.ok && executiveQuote.ok) {
  const oneWay = executiveQuote.journeyFareGbp ?? executiveQuote.amount;
  const returned = executiveReturn.journeyFareGbp ?? executiveReturn.amount;
  assert.ok(Math.abs(returned - oneWay * 2 * (1 - RETURN_JOURNEY_DISCOUNT_RATE)) < 0.02);
  assert.equal(executiveReturn.airportFixedCostsGbp ?? 0, executiveQuote.airportFixedCostsGbp ?? 0);
}

const fourPassengers = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 4,
  vehicleType: EXECUTIVE_VEHICLE_TYPE,
  returnJourney: false,
});
assert.equal(fourPassengers.ok, false);
if (!fourPassengers.ok) {
  assert.equal(fourPassengers.reason, "vehicle_unsuitable");
}

const luggageSaloon = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 2,
  suitcases: 3,
  vehicleType: SALOON,
  returnJourney: false,
});
assert.equal(luggageSaloon.ok, false);

const luggageExecutive = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 2,
  suitcases: 3,
  vehicleType: EXECUTIVE_VEHICLE_TYPE,
  returnJourney: false,
});
assert.equal(luggageExecutive.ok, true);
if (luggageExecutive.ok && saloonQuote.ok) {
  assert.equal(
    luggageExecutive.journeyFareGbp ?? luggageExecutive.amount,
    (saloonQuote.journeyFareGbp ?? saloonQuote.amount) + 20,
  );
}

const fourSuitcases = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 2,
  suitcases: 4,
  vehicleType: EXECUTIVE_VEHICLE_TYPE,
  returnJourney: false,
});
assert.equal(fourSuitcases.ok, false);
if (!fourSuitcases.ok) {
  assert.equal(fourSuitcases.reason, "vehicle_unsuitable");
}

const voluntaryEstate = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 2,
  suitcases: 1,
  vehicleType: ESTATE,
  returnJourney: false,
});
assert.equal(voluntaryEstate.ok, true);
if (voluntaryEstate.ok && saloonQuote.ok) {
  assert.equal(voluntaryEstate.vehicleType, ESTATE);
  assert.equal(
    voluntaryEstate.journeyFareGbp ?? voluntaryEstate.amount,
    (saloonQuote.journeyFareGbp ?? saloonQuote.amount) + 6,
  );
}

const pricedExecutive = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 2,
  suitcases: 1,
  vehicleType: EXECUTIVE_VEHICLE_TYPE,
  returnJourney: false,
  pricing: {
    ...defaultOwnerPricingSettings(),
    executive: { upliftGbp: 25 },
  },
});
assert.equal(pricedExecutive.ok, true);
if (pricedExecutive.ok && saloonQuote.ok) {
  assert.equal(
    pricedExecutive.journeyFareGbp ?? pricedExecutive.amount,
    (saloonQuote.journeyFareGbp ?? saloonQuote.amount) + 25,
  );
  assert.equal(pricedExecutive.airportFixedCostsGbp ?? 0, saloonQuote.airportFixedCostsGbp ?? 0);
}

const categories = fs.readFileSync(
  path.join(import.meta.dirname, "../src/components/QuoteVehicleCategories.tsx"),
  "utf8",
);
assert.match(categories, /More comfort & extra space/);
assert.match(categories, /Select \$\{option\.title\}/);
assert.doesNotMatch(categories, /Upgrade to Estate/);
assert.doesNotMatch(categories, /Upgrade to Executive/);
assert.match(categories, /Recommended for your luggage/);
assert.match(categories, /More comfort/);
assert.match(categories, /Premium travel experience/);
assert.match(categories, /"Premium"/);
assert.match(categories, /EXECUTIVE_PASSENGER_LIMIT_SHORT/);
assert.match(categories, /EXECUTIVE_LUGGAGE_UNAVAILABLE_MESSAGE/);
const executiveSource = fs.readFileSync(
  path.join(import.meta.dirname, "../shared/executive-service.ts"),
  "utf8",
);
assert.match(executiveSource, /Maximum 3 passengers/);
assert.match(executiveSource, /Maximum 3 large suitcases/);
assert.match(executiveSource, /EXECUTIVE_MAX_SUITCASES = 3/);
assert.match(categories, /md:grid-cols-3/);
assert.match(categories, /data-vehicle-expanded=/);
assert.match(categories, /aria-pressed=\{isSelected\}/);
assert.match(categories, /quote-saloon\.webp/);
assert.match(categories, /quote-standard-saloon\.webp/);
assert.match(categories, /STANDARD_SALOON_IMAGE: string \| null = null|image: STANDARD_SALOON_IMAGE/);
assert.match(categories, /id: "minibus"/);
assert.match(categories, /MINIBUS_CUSTOMER_NAME/);
assert.match(categories, /quote-minibus\.webp/);
assert.match(categories, /option\.vehicle === MINIBUS_VEHICLE \|\| option\.vehicle === automatic/);
assert.doesNotMatch(categories, /\+£6/);
assert.doesNotMatch(categories, /\+£20/);
assert.doesNotMatch(categories, /Toyota|Corolla/);
assert.equal(fs.readFileSync(path.join(import.meta.dirname, "../src/lib/vehicle-artwork.ts"), "utf8").includes("STANDARD_SALOON_IMAGE: string | null = null"), true);

console.log("executive service checks passed");
