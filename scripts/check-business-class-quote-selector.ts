/**
 * Business Class selector, whole-pound payable, and included terminal access.
 * Run: npx tsx scripts/check-business-class-quote-selector.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { roundCustomerPayableGbp } from "../shared/gbp";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { resolveSumUpChargeAmountGbp } from "../shared/open-website-payment-fares";
import { quoteAirportAccessCharges } from "../shared/meet-greet";
import { resolveExpressDropOff } from "../shared/express-drop-off";
import { getAirportToAirportFixedCostGbp } from "../shared/airport-fixed-costs";
import { availabilityResourceForVehicle } from "../shared/availability-resource";
import { defaultOwnerPricingSettings } from "../shared/owner-pricing-config";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { calculateQuote } from "../src/lib/quote";
import {
  ESTATE_VEHICLE,
  EXECUTIVE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  canonicalVehicleType,
  suitableVehicleTypesForParty,
  vehicleFitsParty,
} from "../src/lib/vehicle-selection";
import { UNIVERSAL_ESTATE_PREMIUM_GBP } from "../shared/universal-distance-pricing";
import { ESTATE_CUSTOMER_DESCRIPTION } from "../shared/vehicle-display";

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(`${root}/${rel}`, "utf8");
}

assert.equal(roundCustomerPayableGbp(448.49), 448);
assert.equal(roundCustomerPayableGbp(448.5), 449);
assert.equal(roundCustomerPayableGbp(448.51), 449);
assert.equal(roundCustomerPayableGbp(400), 400);

const pennies = composeWebsiteFareBreakdown({
  journeyFareBeforeAirportAccessGbp: 100.49,
  airportFixedCostsGbp: 0.4,
  airportAccessChargeGbp: 0,
  returnJourney: false,
});
assert.equal(pennies.transferFareAfterPromotionsGbp, 100.89);
assert.equal(pennies.finalAmountPayableGbp, 101);
assert.notEqual(pennies.finalAmountPayableGbp, 100);

const withAccess = composeWebsiteFareBreakdown({
  journeyFareBeforeAirportAccessGbp: 50,
  airportAccessChargeGbp: 4.5,
  returnJourney: false,
});
assert.equal(withAccess.airportAccessChargeGbp, 4.5);
assert.equal(withAccess.finalAmountPayableGbp, 55);

assert.equal(resolveSumUpChargeAmountGbp(138, 138.01), 138);
assert.equal(resolveSumUpChargeAmountGbp(448.49, 448.49), 448);
assert.equal(resolveSumUpChargeAmountGbp(100.89, 100.89), 101);

const bothOn = { publicMinibusEnabled: true, publicExecutiveEnabled: true };
const light = suitableVehicleTypesForParty(2, 1, bothOn);
assert.deepEqual(light, [SALOON_VEHICLE, ESTATE_VEHICLE, EXECUTIVE_VEHICLE, MINIBUS_VEHICLE]);

const heavy = suitableVehicleTypesForParty(2, 4, bothOn);
assert.ok(!heavy.includes(SALOON_VEHICLE));
assert.ok(!heavy.includes(EXECUTIVE_VEHICLE));
assert.ok(heavy.includes(ESTATE_VEHICLE));
assert.ok(heavy.includes(MINIBUS_VEHICLE));
assert.equal(vehicleFitsParty(EXECUTIVE_VEHICLE, 2, 4), false);
assert.equal(vehicleFitsParty(ESTATE_VEHICLE, 2, 4), true);

const group = suitableVehicleTypesForParty(6, 1, bothOn);
assert.deepEqual(group, [MINIBUS_VEHICLE]);

const noExecutive = suitableVehicleTypesForParty(2, 1, {
  publicMinibusEnabled: true,
  publicExecutiveEnabled: false,
});
assert.ok(!noExecutive.includes(EXECUTIVE_VEHICLE));

assert.equal(canonicalVehicleType("Business Class"), EXECUTIVE_VEHICLE);
assert.equal(canonicalVehicleType(EXECUTIVE_VEHICLE), EXECUTIVE_VEHICLE);
assert.equal(availabilityResourceForVehicle("Business Class"), "executive");
assert.equal(availabilityResourceForVehicle(SALOON_VEHICLE), "owner");
assert.equal(availabilityResourceForVehicle(MINIBUS_VEHICLE), "minibus");

const pricing = {
  ...defaultOwnerPricingSettings(),
  minibus: { publicEnabled: true, multiplier: 1.55 },
};
const metrics = { distanceKm: 22, durationMinutes: 25 };
function quote(vehicle: string, bags: number) {
  return calculateAuthoritativeWebsiteQuote({
    pickupAddress: "Belfast City Hall, Belfast",
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS",
    fromAirport: false,
    returnJourney: false,
    passengers: 2,
    suitcases: bags,
    routeMetrics: metrics,
    vehicleType: vehicle,
    pricing,
  });
}

const saloon = quote(SALOON_VEHICLE, 1);
const estate = quote(ESTATE_VEHICLE, 1);
const business = quote(EXECUTIVE_VEHICLE, 1);
const minibus = quote(MINIBUS_VEHICLE, 1);
assert.equal(saloon.ok && saloon.vehicleType, SALOON_VEHICLE);
assert.equal(estate.ok && estate.vehicleType, ESTATE_VEHICLE);
assert.equal(business.ok && business.vehicleType, EXECUTIVE_VEHICLE);
assert.equal(minibus.ok && minibus.vehicleType, MINIBUS_VEHICLE);
if (saloon.ok && estate.ok && business.ok) {
  const saloonFare = saloon.journeyFareGbp ?? saloon.amount;
  assert.equal((estate.journeyFareGbp ?? estate.amount) - saloonFare, UNIVERSAL_ESTATE_PREMIUM_GBP);
  assert.ok((business.journeyFareGbp ?? business.amount) > saloonFare);
}

const explicitSaloon = quote(SALOON_VEHICLE, 4);
const explicitBusiness = quote(EXECUTIVE_VEHICLE, 4);
const explicitEstate = quote(ESTATE_VEHICLE, 4);
assert.equal(explicitSaloon.ok, false);
assert.equal(explicitBusiness.ok, false);
if (!explicitSaloon.ok) assert.equal(explicitSaloon.reason, "vehicle_unavailable");
if (!explicitBusiness.ok) assert.equal(explicitBusiness.reason, "vehicle_unavailable");
assert.equal(explicitEstate.ok && explicitEstate.vehicleType, ESTATE_VEHICLE);
if (saloon.ok && explicitEstate.ok) {
  assert.equal(
    (explicitEstate.journeyFareGbp ?? explicitEstate.amount) -
      (saloon.journeyFareGbp ?? saloon.amount),
    UNIVERSAL_ESTATE_PREMIUM_GBP,
  );
}

const directSaloon = calculateQuote(
  "Belfast City Hall",
  "BFS",
  SALOON_VEHICLE,
  false,
  {},
  metrics,
);
const directEstate = calculateQuote(
  "Belfast City Hall",
  "BFS",
  ESTATE_VEHICLE,
  false,
  {},
  metrics,
);
assert.ok(directSaloon && directEstate);
assert.equal(
  (directEstate.journeyFareGbp ?? directEstate.amount) -
    (directSaloon.journeyFareGbp ?? directSaloon.amount),
  UNIVERSAL_ESTATE_PREMIUM_GBP,
);

function access(input: {
  airportCode: string;
  fromAirport: boolean;
  returnJourney?: boolean;
  choice?: "express" | "free" | "meet-greet";
  returnChoice?: "express" | "free" | "meet-greet";
  included?: boolean;
  a2a?: boolean;
}) {
  const legs = resolveExpressDropOff({
    airportCode: input.airportCode,
    fromAirport: input.fromAirport,
    returnJourney: input.returnJourney,
    selected: false,
  }).legs;
  return quoteAirportAccessCharges({
    expressLegs: legs,
    airportCode: input.airportCode,
    fromAirport: input.fromAirport,
    returnJourney: input.returnJourney,
    outboundChoice: input.choice ?? "free",
    returnChoice: input.returnChoice ?? "free",
    meetGreetIncluded: input.included,
    isAirportToAirport: input.a2a,
  });
}

const dropOff = access({ airportCode: "BFS", fromAirport: false, choice: "free" });
assert.equal(dropOff.airportAccessChargeGbp, 5);
assert.equal(dropOff.outboundAirportAccessOption, "express");

const pickup = access({ airportCode: "BHD", fromAirport: true, choice: "free" });
assert.equal(pickup.airportAccessChargeGbp, 4);

const meet = access({ airportCode: "BFS", fromAirport: true, choice: "meet-greet" });
assert.equal(meet.airportAccessChargeGbp, 5);
assert.equal(meet.meetGreetFeeGbp, 0);
assert.equal(meet.expressDropOffFee, 5);

const included = access({ airportCode: "BFS", fromAirport: true, included: true });
assert.equal(included.airportAccessChargeGbp, 5);
assert.equal(included.meetGreetFeeGbp, 0);
assert.equal(included.airportAccessOption, "meet-greet");

const optedOut = access({ airportCode: "BHD", fromAirport: false, choice: "free" });
assert.equal(optedOut.airportAccessChargeGbp, 4);

const returnLegs = access({
  airportCode: "BFS",
  fromAirport: false,
  returnJourney: true,
  choice: "free",
  returnChoice: "meet-greet",
});
assert.equal(returnLegs.outboundAirportAccessChargeGbp, 5);
assert.equal(returnLegs.returnAirportAccessChargeGbp, 5);
assert.equal(returnLegs.meetGreetFeeGbp, 0);
assert.equal(returnLegs.airportAccessChargeGbp, 10);

assert.equal(getAirportToAirportFixedCostGbp("BFS", "BHD"), 9);
const a2aAccess = access({
  airportCode: "BFS",
  fromAirport: true,
  choice: "free",
  a2a: true,
});
assert.equal(a2aAccess.expressDropOffFee, 0);

const categories = read("src/components/QuoteVehicleCategories.tsx");
const showcase = read("src/components/QuoteResultShowcase.tsx");
const card = read("src/components/QuoteCard.tsx");
assert.equal(ESTATE_CUSTOMER_DESCRIPTION, "Extra luggage space and comfort");
assert.equal(vehicleFitsParty(EXECUTIVE_VEHICLE, 4, 2), true);
assert.equal(vehicleFitsParty(EXECUTIVE_VEHICLE, 4, 4), false);
assert.match(categories, /bg-white/);
assert.match(categories, /Vehicle options/);
assert.match(categories, /1–4 passengers/);
assert.match(categories, /detail: ESTATE_CUSTOMER_DESCRIPTION/);
assert.match(categories, /detail: EXECUTIVE_CUSTOMER_DESCRIPTION/);
assert.match(categories, /border-2/);
assert.match(categories, /font-bold leading-tight text-navy/);
assert.match(categories, /font-semibold leading-tight text-navy/);
assert.match(categories, /font-medium leading-tight text-navy/);
assert.match(categories, /py-1\.5/);
assert.doesNotMatch(categories, /min-h-\[7\.75rem\]/);
assert.match(categories, /2 large suitcases \+ 2 hand luggage/);
assert.match(categories, /disabled=\{!fits\}/);
assert.match(categories, /aria-disabled/);
assert.match(categories, /data-vehicle-suitable/);
assert.match(categories, /VEHICLE_NOT_SUITABLE_CARD_MESSAGE/);
assert.match(categories, /disabled:opacity-100/);
assert.doesNotMatch(categories, /opacity-40|opacity-50/);
assert.match(categories, /enabledVehicleTypesForQuote/);
assert.doesNotMatch(categories, /Recommended/);
assert.match(categories, /bg-\[#147a2a\]/);
assert.doesNotMatch(categories, /#475569|#64748b|text-navy\/[4-7]0/);
assert.match(showcase, /text-navy/);
assert.match(showcase, /text-\[#147a2a\]/);
assert.match(showcase, /Fixed price\. No surprises\./);
assert.doesNotMatch(showcase, /#475569|#64748b|text-navy\/[4-7]0/);
assert.match(categories, /VehicleQuoteArt/);
assert.match(read("src/components/vehicle-quote-art.tsx"), /data-vehicle-art/);
assert.doesNotMatch(categories, /Recommended/);
assert.match(showcase, /Express Pickup Included|includedAirportAccessCopy|data-quote-result-airport-access/);
assert.match(read("src/components/ExpressDropOffChoice.tsx"), /includedAirportAccessCopy/);
assert.match(read("shared/express-drop-off.ts"), /Express Pickup Included|includedAirportAccessCopy/);
assert.match(categories, /Business Class|EXECUTIVE_CUSTOMER_NAME/);
assert.match(categories, /quote-business-class\.webp/);
assert.match(read("src/components/QuoteResultShowcase.tsx"), /quote-business-class\.webp/);
assert.match(read("src/components/VehiclesSection.tsx"), /quote-business-class\.webp/);
assert.match(card, /suitableVehicleTypesForParty/);
assert.match(card, /setManualVehicle\(chosen\)/);
assert.doesNotMatch(categories, /Mercedes|Lexus|Audi|C-Class/);
assert.ok(showcase.indexOf("{bookButton}") < showcase.indexOf("data-quote-result-airport-access"));
assert.match(card, /setChooseExecutive\(next === EXECUTIVE_VEHICLE\)/);
assert.match(card, /setChooseMinibus\(next === MINIBUS_VEHICLE_TYPE\)/);
assert.match(card, /terminalAccessIncluded/);
assert.match(card, /Included with Business Class/);
assert.match(card, /Meet & Greet inside arrivals/);
assert.match(card, /Updating price…/);
assert.match(card, /Express Pickup Included/);
assert.match(card, /Express Drop-Off Included/);
assert.doesNotMatch(card, /Free Pick-Up|Free Drop-Off|Free airport areas/);
assert.match(read("src/components/vehicle-quote-art.tsx"), /h-11 w-full max-w-\[9\.75rem\]/);
assert.match(read("src/components/quote-result-action.tsx"), /bg-navy-light/);
assert.match(read("src/components/QuoteCard.tsx"), /QUOTE_RESULT_ACTION_CLASS/);
assert.match(read("src/components/QuoteHelpContact.tsx"), /QUOTE_RESULT_ACTION_CLASS/);
assert.match(read("src/components/QuoteBookingHelpControls.tsx"), /QUOTE_RESULT_ACTION_CLASS/);
assert.match(read("src/components/vehicle-quote-art.tsx"), /h-\[3\.35rem\] w-\[6\.4rem\]/);
assert.match(read("src/app/globals.css"), /\.quote-result-card \.btn-primary/);
assert.match(card, /quoteVehicleRef/);
const dropoffStart = card.indexOf("BUSINESS_CLASS_DROPOFF_INCLUSIONS");
const dropoffInclusions = card.slice(dropoffStart, dropoffStart + 320);
assert.doesNotMatch(dropoffInclusions, /Meet & Greet/);
assert.match(read("workers/addresses/src/quote-handlers.ts"), /quoteRouteInflight/);
assert.match(read("workers/addresses/src/index.ts"), /Never trust body\.routeMetrics/);
assert.doesNotMatch(read("src/lib/terms.ts"), /Mercedes|Lexus|Audi|C-Class/);
assert.doesNotMatch(read("src/lib/data.ts"), /Mercedes-Benz C-Class/);
assert.doesNotMatch(read("src/components/ExpressDropOffSelector.tsx"), /Add Meet & Greet/);
assert.doesNotMatch(card, /meetGreetFeeGbp\(/);
assert.match(read("shared/meet-greet.ts"), /mandatoryTerminalFeeGbp/);

console.log("check-business-class-quote-selector: ok");
