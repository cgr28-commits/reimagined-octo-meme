/**
 * Executive is Saloon + the dashboard upgrade (default £20), capped at 3 passengers
 * and 3 large suitcases. Estate default is +£6.
 * Airport access and Express charges are included in the Executive upgrade.
 */
import assert from "node:assert/strict";
import { calculateUniversalJourneyFareGbp } from "../shared/universal-distance-pricing";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_EXECUTIVE_UPLIFT_GBP,
  EXECUTIVE_MAX_SUITCASES,
  EXECUTIVE_VEHICLE_TYPE,
  SALOON_MAX_SUITCASES,
  estateCapacityAllows,
  executiveAvailableForParty,
  executivePreferenceFields,
  formatExecutivePreferenceLines,
  isPremiumExecutiveVehicle,
  publicVehicleEligibilityMessage,
  saloonCapacityAllows,
} from "../shared/executive-service";
import { defaultOwnerPricingSettings, normalizeOwnerPricingSettings, ownerPricingEngineOptions } from "../shared/owner-pricing-config";
import {
  EXPRESS_DROP_OFF_FEES_GBP,
  applyExecutiveIncludedAirportAccess,
  composeFareWithExpressDropOff,
  expressAccessChargeAddedOnTop,
  formatAirportAccessOptionCustomerLine,
  formatAirportAccessOptionCustomerLines,
  formatAirportAccessOptionOwnerLine,
  formatAirportAccessOptionOwnerLines,
  resolveExpressDropOff,
} from "../shared/express-drop-off";
import {
  customerAirportFixedCostsForVehicle,
  resolveJourneyAirportFees,
} from "../shared/airport-fixed-costs";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
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
assert.equal(SALOON_MAX_SUITCASES, 3);
assert.equal(saloonCapacityAllows(2, 1), true);
assert.equal(saloonCapacityAllows(2, 2), true);
assert.equal(saloonCapacityAllows(4, 3), true);
assert.equal(saloonCapacityAllows(2, 4), false);
assert.equal(saloonCapacityAllows(4, 4), false);
assert.equal(estateCapacityAllows(4, 4), true);
assert.equal(estateCapacityAllows(2, 3), true);
assert.equal(publicVehicleEligibilityMessage(SALOON, 2, 1), null);
assert.equal(publicVehicleEligibilityMessage(SALOON, 2, 2), null);
assert.equal(publicVehicleEligibilityMessage(SALOON, 4, 3), null);
assert.equal(publicVehicleEligibilityMessage(SALOON, 2, 4), "Saloon is not suitable for your luggage.");
assert.equal(publicVehicleEligibilityMessage(ESTATE, 2, 4), null);
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
assert.equal(luggageSaloon.ok, true);

const oneSuitcaseSaloon = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 2,
  suitcases: 1,
  vehicleType: SALOON,
  returnJourney: false,
});
assert.equal(oneSuitcaseSaloon.ok, true);

const twoSuitcaseSaloon = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 2,
  suitcases: 2,
  vehicleType: SALOON,
  returnJourney: false,
});
assert.equal(twoSuitcaseSaloon.ok, true);

const fourSuitcaseSaloon = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 2,
  suitcases: 4,
  vehicleType: SALOON,
  returnJourney: false,
});
assert.equal(fourSuitcaseSaloon.ok, false);
if (!fourSuitcaseSaloon.ok) {
  assert.equal(fourSuitcaseSaloon.reason, "vehicle_unsuitable");
}

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

const fourSuitcaseEstate = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 2,
  suitcases: 4,
  vehicleType: ESTATE,
  returnJourney: false,
});
assert.equal(fourSuitcaseEstate.ok, true);
if (fourSuitcaseEstate.ok) {
  assert.equal(fourSuitcaseEstate.vehicleType, ESTATE);
}
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

const ownerUpgrades = normalizeOwnerPricingSettings({
  ...defaultOwnerPricingSettings(),
  estate: { upliftGbp: 8 },
  executive: { upliftGbp: 25 },
});
const upgradeEngine = ownerPricingEngineOptions(ownerUpgrades);
assert.equal(upgradeEngine.estatePremiumGbp, 8);
assert.equal(upgradeEngine.executivePremiumGbp, 25);
const exampleSaloon = calculateUniversalJourneyFareGbp(0, SALOON, {
  ...upgradeEngine,
  saloonFareGbp: 47,
});
const exampleEstate = calculateUniversalJourneyFareGbp(0, ESTATE, {
  ...upgradeEngine,
  saloonFareGbp: 47,
});
const exampleExecutive = calculateUniversalJourneyFareGbp(0, EXECUTIVE_VEHICLE_TYPE, {
  ...upgradeEngine,
  saloonFareGbp: 47,
});
assert.equal(exampleSaloon.journeyFareGbp, 47);
assert.equal(exampleEstate.journeyFareGbp, 55);
assert.equal(exampleExecutive.journeyFareGbp, 72);
assert.equal(exampleEstate.vehicleAdjustmentGbp, 8);
assert.equal(exampleExecutive.vehicleAdjustmentGbp, 25);

const upgradedSaloon = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 2,
  vehicleType: SALOON,
  returnJourney: false,
  pricing: ownerUpgrades,
});
const upgradedEstate = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 2,
  vehicleType: ESTATE,
  returnJourney: false,
  pricing: ownerUpgrades,
});
const upgradedExecutive = calculateAuthoritativeWebsiteQuote({
  ...quoteBase,
  passengers: 2,
  vehicleType: EXECUTIVE_VEHICLE_TYPE,
  returnJourney: false,
  pricing: ownerUpgrades,
});
assert.equal(upgradedSaloon.ok && upgradedEstate.ok && upgradedExecutive.ok, true);
if (upgradedSaloon.ok && upgradedEstate.ok && upgradedExecutive.ok) {
  const saloonFare = upgradedSaloon.journeyFareGbp ?? upgradedSaloon.amount;
  const estateFare = upgradedEstate.journeyFareGbp ?? upgradedEstate.amount;
  const executiveFare = upgradedExecutive.journeyFareGbp ?? upgradedExecutive.amount;
  assert.equal(estateFare, saloonFare + 8);
  assert.equal(executiveFare, saloonFare + 25);
  assert.equal(upgradedEstate.airportFixedCostsGbp ?? 0, upgradedSaloon.airportFixedCostsGbp ?? 0);
  assert.equal(upgradedExecutive.airportFixedCostsGbp ?? 0, upgradedSaloon.airportFixedCostsGbp ?? 0);
  const saloonExpress = composeFareWithExpressDropOff({
    transferFareGbp: saloonFare,
    expressDropOffFeeGbp: EXPRESS_DROP_OFF_FEES_GBP.BFS,
  });
  const estateExpress = composeFareWithExpressDropOff({
    transferFareGbp: estateFare,
    expressDropOffFeeGbp: EXPRESS_DROP_OFF_FEES_GBP.BFS,
  });
  const executiveDropOff = applyExecutiveIncludedAirportAccess(
    resolveExpressDropOff({ airportCode: "BFS", fromAirport: false, selected: false }),
    EXECUTIVE_VEHICLE_TYPE,
  );
  const executiveExpress = composeFareWithExpressDropOff({
    transferFareGbp: executiveFare,
    expressDropOffFeeGbp: executiveDropOff.feeGbp,
  });
  assert.equal(saloonExpress.expressDropOffFeeGbp, 5);
  assert.equal(estateExpress.expressDropOffFeeGbp, 5);
  assert.equal(executiveDropOff.includedInVehicleFare, true);
  assert.equal(executiveDropOff.feeGbp, 0);
  assert.equal(executiveDropOff.selected, true);
  assert.equal(executiveDropOff.freeAlternativeAvailable, false);
  assert.equal(executiveDropOff.legs[0]?.service, "drop-off");
  assert.equal(executiveExpress.expressDropOffFeeGbp, 0);
  assert.equal(estateExpress.totalGbp, saloonFare + 8 + 5);
  assert.equal(executiveExpress.totalGbp, executiveFare);
  assert.equal(executiveExpress.totalGbp, saloonFare + 25);
  assert.notEqual(executiveExpress.totalGbp, saloonFare + 25 + 5);
}

const pickupIncluded = applyExecutiveIncludedAirportAccess(
  resolveExpressDropOff({ airportCode: "BFS", fromAirport: true, selected: false }),
  EXECUTIVE_VEHICLE_TYPE,
);
assert.equal(pickupIncluded.legs[0]?.service, "pick-up");
assert.equal(pickupIncluded.selected, true);
assert.equal(pickupIncluded.feeGbp, 0);
assert.equal(pickupIncluded.freeAlternativeAvailable, false);
assert.equal(
  formatAirportAccessOptionCustomerLine({
    expressDropOffSelected: true,
    expressDropOffFee: 0,
    expressDropOffAirport: "BFS",
    fromAirport: true,
  }),
  "Airport access option: Express Pick-Up — included",
);
assert.equal(
  formatAirportAccessOptionOwnerLine({
    expressDropOffSelected: true,
    expressDropOffFee: 0,
    expressDropOffAirport: "BFS",
    fromAirport: false,
  }),
  "AIRPORT ACCESS: EXPRESS — INCLUDED",
);
assert.deepEqual(
  formatAirportAccessOptionCustomerLines({
    expressDropOffSelected: true,
    expressDropOffFee: 0,
    expressDropOffAirport: "BFS",
    fromAirport: true,
  }),
  ["Airport access option: Express Pick-Up — included"],
);
assert.deepEqual(
  formatAirportAccessOptionOwnerLines({
    expressDropOffSelected: true,
    expressDropOffFee: 0,
    expressDropOffAirport: "BHD",
    fromAirport: false,
    returnJourney: true,
    outboundExpressDropOffSelected: true,
    returnExpressDropOffSelected: true,
  }),
  [
    "OUTBOUND AIRPORT ACCESS: EXPRESS — INCLUDED",
    "RETURN AIRPORT ACCESS: EXPRESS — INCLUDED",
  ],
);
assert.equal(expressAccessChargeAddedOnTop(0, true), false);
assert.equal(expressAccessChargeAddedOnTop(0, false), true);
assert.equal(expressAccessChargeAddedOnTop(5, true), true);
assert.equal(
  formatAirportAccessOptionCustomerLines({
    expressDropOffSelected: true,
    expressDropOffFee: 5,
    expressDropOffAirport: "BFS",
    fromAirport: false,
  })[0],
  "Airport access option: Express Drop-Off — £5",
);

const saloonChoice = applyExecutiveIncludedAirportAccess(
  resolveExpressDropOff({ airportCode: "BFS", fromAirport: false, selected: false }),
  SALOON,
);
assert.equal(saloonChoice.includedInVehicleFare, false);
assert.equal(saloonChoice.feeGbp, 0);
assert.equal(saloonChoice.selected, false);
assert.equal(saloonChoice.freeAlternativeAvailable, true);

const returnIncluded = applyExecutiveIncludedAirportAccess(
  resolveExpressDropOff({
    airportCode: "BHD",
    fromAirport: false,
    returnJourney: true,
    selected: false,
  }),
  EXECUTIVE_VEHICLE_TYPE,
);
assert.equal(returnIncluded.legs.length, 2);
assert.equal(returnIncluded.feeGbp, 0);
assert.equal(returnIncluded.outboundFeeGbp, 0);
assert.equal(returnIncluded.returnFeeGbp, 0);
assert.ok(returnIncluded.legs.every((leg) => leg.selected && leg.chargedFeeGbp === 0));
if (executiveQuote.ok && executiveReturn.ok) {
  const returnTotal = composeFareWithExpressDropOff({
    transferFareGbp: executiveReturn.journeyFareGbp ?? executiveReturn.amount,
    expressDropOffFeeGbp: returnIncluded.feeGbp,
  });
  const undiscounted = (executiveQuote.journeyFareGbp ?? executiveQuote.amount) * 2;
  assert.ok(
    Math.abs(
      returnTotal.totalGbp - undiscounted * (1 - RETURN_JOURNEY_DISCOUNT_RATE),
    ) < 0.02,
  );
  assert.equal(returnTotal.expressDropOffFeeGbp, 0);
  assert.notEqual(returnTotal.totalGbp, returnTotal.transferFareGbp + EXPRESS_DROP_OFF_FEES_GBP.BHD * 2);
}

const exampleSaloonFare = 45;
const exampleUpgrade = 20;
const exampleExecutiveTotal = exampleSaloonFare + exampleUpgrade;
const exampleBreakdown = composeWebsiteFareBreakdown({
  journeyFareBeforeAirportAccessGbp: exampleExecutiveTotal,
  airportFixedCostsGbp: 0,
  nightWeekendSurchargeGbp: 0,
  airportAccessChargeGbp: 0,
  returnJourney: false,
});
assert.equal(exampleBreakdown.finalAmountPayableGbp, 65);
assert.notEqual(exampleBreakdown.finalAmountPayableGbp, 70);

const dubPickupLines = resolveJourneyAirportFees({
  isAirportToAirport: false,
  airportCode: "DUB",
  fromAirport: true,
  returnJourney: false,
}).lines;
assert.equal(customerAirportFixedCostsForVehicle(dubPickupLines, SALOON), 9);
assert.equal(customerAirportFixedCostsForVehicle(dubPickupLines, EXECUTIVE_VEHICLE_TYPE), 4);
const dubExecutive = calculateAuthoritativeWebsiteQuote({
  pickupAddress: "Dublin Airport",
  dropoffAddress: "Belfast City Hall, Belfast BT1 5GS",
  airportCode: "DUB",
  fromAirport: true,
  passengers: 2,
  suitcases: 1,
  routeMetrics: metrics,
  outboundDate: "2026-12-01",
  outboundTime: "10:00",
  returnJourney: false,
  vehicleType: EXECUTIVE_VEHICLE_TYPE,
});
const dubSaloon = calculateAuthoritativeWebsiteQuote({
  pickupAddress: "Dublin Airport",
  dropoffAddress: "Belfast City Hall, Belfast BT1 5GS",
  airportCode: "DUB",
  fromAirport: true,
  passengers: 2,
  suitcases: 1,
  routeMetrics: metrics,
  outboundDate: "2026-12-01",
  outboundTime: "10:00",
  returnJourney: false,
  vehicleType: SALOON,
});
assert.equal(dubExecutive.ok && dubSaloon.ok, true);
if (dubExecutive.ok && dubSaloon.ok) {
  assert.equal(dubSaloon.airportFixedCostsGbp, 9);
  assert.equal(dubExecutive.airportFixedCostsGbp, 4);
  assert.equal(
    dubExecutive.amount,
    (dubExecutive.journeyFareGbp ?? 0) + 4,
  );
  assert.equal(
    dubExecutive.amount,
    (dubSaloon.journeyFareGbp ?? 0) + 20 + 4,
  );
  assert.notEqual(dubExecutive.amount, (dubSaloon.journeyFareGbp ?? 0) + 20 + 9);
}

const paymentSourceEarly = fs.readFileSync(
  path.join(import.meta.dirname, "../workers/addresses/src/index.ts"),
  "utf8",
);
assert.match(paymentSourceEarly, /applyExecutiveIncludedAirportAccess\(/);
assert.match(paymentSourceEarly, /customerAirportFixedCostsForVehicle\(/);
assert.match(
  fs.readFileSync(path.join(import.meta.dirname, "../src/components/QuoteCard.tsx"), "utf8"),
  /data-executive-airport-access-included/,
);
assert.match(
  fs.readFileSync(path.join(import.meta.dirname, "../src/components/QuoteCard.tsx"), "utf8"),
  /includedInVehicleFare/,
);

const categories = fs.readFileSync(
  path.join(import.meta.dirname, "../src/components/QuoteVehicleCategories.tsx"),
  "utf8",
);
assert.match(categories, /Spacious, comfortable private airport travel/);
assert.match(categories, /Spacious, comfortable interior/);
assert.match(categories, /Extra luggage capacity & versatility/);
assert.match(categories, /Premium travel experience/);
assert.match(categories, /Extra luggage space/);
assert.match(categories, /More room for larger bags/);
assert.match(categories, /Flexible luggage capacity/);
assert.match(categories, /Higher-spec vehicle/);
assert.match(categories, /Airport pickup & drop-off charges included/);
assert.match(categories, /Express terminal drop-off included when applicable/);
assert.doesNotMatch(categories, /Premium vehicle/);
assert.match(categories, /Executive includes/);
assert.match(categories, /data-executive-includes/);
assert.match(categories, /Quiet Journey/);
assert.match(categories, /No preference/);
assert.match(categories, /Cooler/);
assert.match(categories, /Warmer/);
assert.match(categories, /md:grid-cols-3/);
assert.match(categories, /md:items-start/);
assert.equal(categories.match(/quietJourney=\{quietJourney\}/g)?.length, 2);
assert.equal(categories.match(/climatePreference=\{climatePreference\}/g)?.length, 2);
assert.match(categories, /data-executive-desktop-extras/);
assert.match(categories, /data-executive-mobile-details/);
assert.match(categories, /View details ›/);
assert.match(categories, /Airport charges \+ premium extras included/);
assert.match(categories, /Personalise your Executive journey \(optional\)/);
assert.match(categories, /Not sure which vehicle to choose\?/);
assert.match(categories, /md:hidden/);
assert.match(categories, /data-quote-booking-section/);
assert.match(categories, /Complimentary bottled water/);
assert.match(categories, /Phone charging available/);
assert.match(categories, /Quiet Journey option/);
assert.match(categories, /Climate preference/);
assert.match(categories, /Premium comfort/);
assert.doesNotMatch(categories, /Luggage assistance/);
assert.match(categories, /Comfortable and efficient/);
assert.doesNotMatch(categories, /Extra legroom/);
assert.doesNotMatch(categories, /More relaxed journey/);
assert.doesNotMatch(categories, /Great value/);
assert.doesNotMatch(categories, /Ideal for most airport journeys/);
assert.doesNotMatch(categories, /Extra comfort for your journey/);
assert.doesNotMatch(categories, /Recommended for extra space/);
assert.doesNotMatch(categories, /Ideal for families and extra luggage/);
assert.match(categories, /lockedToMinibus \?/);
assert.match(categories, /includeMinibus && minibusOption/);
assert.match(categories, /data-minibus-required/);
assert.match(categories, /data-standard-vehicle-choice/);
assert.doesNotMatch(categories, /7-Seater|7 Seater Minibus is an upgrade/);
assert.match(categories, /Select \$\{option\.title\}/);
assert.doesNotMatch(categories, /Upgrade to Estate/);
assert.doesNotMatch(categories, /Upgrade to Executive/);
assert.match(categories, /Not sure which to choose/);
assert.match(categories, /All options provide a spacious, comfortable private airport transfer\. Choose Estate for extra luggage capacity, or Executive for a premium travel experience\./);
assert.match(categories, /Up to \{EXECUTIVE_MAX_SUITCASES\} large suitcases/);
assert.match(categories, /EXECUTIVE_PASSENGER_LIMIT_SHORT/);
assert.match(categories, /EXECUTIVE_LUGGAGE_UNAVAILABLE_MESSAGE/);
const executiveSource = fs.readFileSync(
  path.join(import.meta.dirname, "../shared/executive-service.ts"),
  "utf8",
);
assert.match(executiveSource, /Maximum 3 passengers/);
assert.match(executiveSource, /Maximum 3 large suitcases/);
assert.match(executiveSource, /EXECUTIVE_MAX_SUITCASES = 3/);
assert.match(executiveSource, /SALOON_MAX_SUITCASES = 3/);
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
assert.doesNotMatch(categories, /Toyota|Corolla|Camry/);
const paymentSource = fs.readFileSync(
  path.join(import.meta.dirname, "../workers/addresses/src/index.ts"),
  "utf8",
);
assert.match(
  paymentSource,
  /publicVehicleEligibilityMessage\(vehicleRaw, partyPassengers, partySuitcases\)/,
);
assert.match(paymentSource, /calculateAuthoritativeWebsiteQuote\(\{[\s\S]*?\n\s*pricing,/);
const pricingCopy = fs.readFileSync(
  path.join(import.meta.dirname, "../src/lib/pricing-config.json"),
  "utf8",
);
assert.doesNotMatch(pricingCopy, /Saloon \+ £10/);
assert.doesNotMatch(pricingCopy, /\+£6 vs Saloon/);
assert.match(pricingCopy, /Owner Pricing Estate upgrade/);
assert.match(pricingCopy, /Owner Pricing Executive upgrade/);
const artwork = fs.readFileSync(path.join(import.meta.dirname, "../src/lib/vehicle-artwork.ts"), "utf8");
assert.match(artwork, /quote-standard-saloon\.webp/);
assert.equal(
  fs.existsSync(path.join(import.meta.dirname, "../public/images/vehicles/quote-standard-saloon.webp")),
  true,
);
assert.doesNotMatch(artwork, /STANDARD_SALOON_IMAGE: string \| null = null;/);

console.log("executive service checks passed");
