/**
 * Executive fare = Saloon journey fare × owner multiplier, nearest penny.
 * Airport pickup barrier/parking and Meet & Greet are included, not added again.
 * Run: npx tsx scripts/check-executive-multiplier.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getAirportLegFixedCostGbp } from "../shared/airport-fixed-costs";
import {
  DEFAULT_EXECUTIVE_MULTIPLIER,
  EXECUTIVE_AIRPORT_PICKUP_INCLUDED,
} from "../shared/executive-vehicle";
import { roundGbp } from "../shared/gbp";
import { quoteAirportAccessCharges } from "../shared/meet-greet";
import { resolveExpressDropOff } from "../shared/express-drop-off";
import {
  defaultOwnerPricingSettings,
  normalizeOwnerPricingSettings,
  validateOwnerPricingInput,
} from "../shared/owner-pricing-config";
import {
  UNIVERSAL_ESTATE_PREMIUM_GBP,
  calculateUniversalJourneyFareGbp,
} from "../shared/universal-distance-pricing";
import { EXECUTIVE_RESOURCE_UNAVAILABLE_MESSAGE } from "../shared/availability-resource";
import {
  EXECUTIVE_CUSTOMER_DESCRIPTION,
  EXECUTIVE_CUSTOMER_NAME,
} from "../shared/vehicle-display";
import { decideCustomerSmartAvailabilityGate } from "../shared/customer-smart-availability";
import { evaluateSmartAvailability, occupiedJobsFromPaidBooking } from "../shared/smart-conflict";
import { DEFAULT_SMART_OPS_CONFIG } from "../shared/smart-ops-config";
import { isInstantPayVehicle, isVehicleEnquiryOnly } from "../src/lib/data";
import { calculateQuote } from "../src/lib/quote";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { buildCustomerConfirmationEmail } from "../shared/booking-notifications";
import { canonicalVehicleType, vehicleShortLabel } from "../src/lib/vehicle-selection";

const EXECUTIVE = "Executive Saloon (1–4 passengers)";
const SALOON = "Standard Saloon (1–4 passengers)";

assert.equal(DEFAULT_EXECUTIVE_MULTIPLIER, 1.5);
assert.equal(UNIVERSAL_ESTATE_PREMIUM_GBP, 6);
assert.equal(isVehicleEnquiryOnly(EXECUTIVE), false);
assert.equal(isInstantPayVehicle(EXECUTIVE), true);
assert.equal(canonicalVehicleType("Executive Saloon (1–4 passengers)"), EXECUTIVE);
assert.equal(vehicleShortLabel(EXECUTIVE), EXECUTIVE_CUSTOMER_NAME);
assert.equal(EXECUTIVE_CUSTOMER_NAME, "Executive — Mercedes-Benz C-Class or similar");
assert.equal(EXECUTIVE_CUSTOMER_DESCRIPTION, "Premium executive vehicle");
assert.match(EXECUTIVE_CUSTOMER_NAME, /or similar/);
assert.equal(canonicalVehicleType("estate car"), "Estate Car (1–4 passengers)");
assert.notEqual(canonicalVehicleType(EXECUTIVE), SALOON);
assert.match(EXECUTIVE_AIRPORT_PICKUP_INCLUDED, /Meet & Greet/);
assert.match(EXECUTIVE_AIRPORT_PICKUP_INCLUDED, /personalised name board/);
assert.match(EXECUTIVE_AIRPORT_PICKUP_INCLUDED, /luggage assistance/);
assert.match(EXECUTIVE_AIRPORT_PICKUP_INCLUDED, /barrier and parking/);
assert.match(EXECUTIVE_AIRPORT_PICKUP_INCLUDED, /bottled water/);
assert.match(EXECUTIVE_AIRPORT_PICKUP_INCLUDED, /phone charging/);

for (const multiplier of [1.4, 1.5, 1.75, 2]) {
  const priced = calculateUniversalJourneyFareGbp(0, EXECUTIVE, {
    saloonFareGbp: 44,
    executiveMultiplier: multiplier,
  });
  assert.equal(priced.saloonGbp, 44);
  assert.equal(priced.journeyFareGbp, roundGbp(44 * multiplier), `×${multiplier}`);
  assert.notEqual(priced.journeyFareGbp, roundGbp((44 + 6) * multiplier));
}

const minimumRetired = calculateUniversalJourneyFareGbp(0, EXECUTIVE, {
  saloonFareGbp: 29,
  executiveMultiplier: 1.4,
  executiveMinimumGbp: 105,
});
assert.equal(minimumRetired.journeyFareGbp, roundGbp(29 * 1.4));
assert.ok(minimumRetired.journeyFareGbp < 105);

const saloon = calculateUniversalJourneyFareGbp(14, SALOON);
const estate = calculateUniversalJourneyFareGbp(14, "Estate Car (1–4 passengers)");
const minibus = calculateUniversalJourneyFareGbp(14, "Minibus (5–7 passengers)");
assert.equal(estate.journeyFareGbp, saloon.journeyFareGbp + 6);
assert.equal(minibus.journeyFareGbp, roundGbp(estate.journeyFareGbp * 1.55));

const stored = defaultOwnerPricingSettings() as unknown as Record<string, unknown>;
delete stored.executive;
const kept = normalizeOwnerPricingSettings({
  ...stored,
  saloon: { ...defaultOwnerPricingSettings().saloon, minimumFareGbp: 31 },
});
assert.equal(kept.saloon.minimumFareGbp, 31);
assert.equal(kept.executive.multiplier, 1.5);
assert.equal(kept.minibus.multiplier, 1.55);

const saved = validateOwnerPricingInput({
  ...defaultOwnerPricingSettings(),
  executive: { multiplier: 1.75 },
});
assert.equal(saved.ok, true);
if (saved.ok) {
  assert.equal(saved.settings.executive.multiplier, 1.75);
  const fare = calculateUniversalJourneyFareGbp(0, EXECUTIVE, {
    saloonFareGbp: 44,
    executiveMultiplier: saved.settings.executive.multiplier,
  });
  assert.equal(fare.journeyFareGbp, 77);
}

const rejected = validateOwnerPricingInput({
  ...defaultOwnerPricingSettings(),
  executive: { multiplier: 4 },
});
assert.equal(rejected.ok, false);

const dubPickup = getAirportLegFixedCostGbp("DUB", true, { pickupAccessIncluded: true });
const dubPickupNormal = getAirportLegFixedCostGbp("DUB", true);
assert.equal(dubPickupNormal, 9);
assert.equal(dubPickup, 4);
const dubDrop = getAirportLegFixedCostGbp("DUB", false, { pickupAccessIncluded: true });
assert.equal(dubDrop, getAirportLegFixedCostGbp("DUB", false));

const route = { distanceKm: 22, durationMinutes: 30 };
const executiveQuote = calculateQuote(
  "Belfast City Hall",
  "DUB",
  EXECUTIVE,
  false,
  { outboundDate: "2026-10-14", outboundTime: "10:00" },
  route,
  true,
);
const saloonQuote = calculateQuote(
  "Belfast City Hall",
  "DUB",
  SALOON,
  false,
  { outboundDate: "2026-10-14", outboundTime: "10:00" },
  route,
  true,
);
assert.ok(executiveQuote && saloonQuote);
assert.equal(executiveQuote.airportFixedCostsGbp, 4);
assert.equal(saloonQuote.airportFixedCostsGbp, 9);
assert.equal(
  executiveQuote.journeyFareGbp,
  roundGbp(saloonQuote.journeyFareGbp * DEFAULT_EXECUTIVE_MULTIPLIER),
);

const express = resolveExpressDropOff({
  airportCode: "BFS",
  fromAirport: true,
  selected: true,
});
const included = quoteAirportAccessCharges({
  expressLegs: express.legs,
  airportCode: "BFS",
  fromAirport: true,
  outboundChoice: "express",
  meetGreetIncluded: true,
});
assert.equal(included.airportAccessChargeGbp, 0);
assert.equal(included.outboundAirportAccessOption, "meet-greet");
assert.equal(included.expressDropOffFee, 0);

const charged = quoteAirportAccessCharges({
  expressLegs: express.legs,
  airportCode: "BFS",
  fromAirport: true,
  outboundChoice: "meet-greet",
});
assert.equal(charged.airportAccessChargeGbp, 15);

const routeReturn = { distanceKm: 22, durationMinutes: 30 };
const returnSchedule = {
  outboundDate: "2026-10-14",
  outboundTime: "10:00",
  returnDate: "2026-10-16",
  returnTime: "10:00",
};
const execOne = calculateQuote("Belfast City Hall", "BFS", EXECUTIVE, false, returnSchedule, routeReturn, true);
const saloonOne = calculateQuote("Belfast City Hall", "BFS", SALOON, false, returnSchedule, routeReturn, true);
assert.ok(execOne && saloonOne);
assert.equal(execOne.airportFixedCostsGbp, 0);
assert.equal(execOne.journeyFareGbp, roundGbp(saloonOne.journeyFareGbp * 1.5));
const execReturn = calculateQuote("Belfast City Hall", "BFS", EXECUTIVE, true, returnSchedule, routeReturn, true);
const saloonReturn = calculateQuote("Belfast City Hall", "BFS", SALOON, true, returnSchedule, routeReturn, true);
assert.ok(execReturn && saloonReturn);
assert.equal(execReturn.journeyFareGbp, roundGbp(execOne.journeyFareGbp * 2 * 0.95));
assert.equal(saloonReturn.journeyFareGbp, roundGbp(saloonOne.journeyFareGbp * 2 * 0.95));
assert.equal(execReturn.airportFixedCostsGbp, 0);

const serverPricing = defaultOwnerPricingSettings();
serverPricing.executive.multiplier = 2;
const serverQuote = calculateAuthoritativeWebsiteQuote({
  airportCode: "BFS",
  fromAirport: true,
  pickupAddress: "Belfast International Airport",
  dropoffAddress: "Belfast City Hall",
  returnJourney: false,
  outboundDate: "2026-10-14",
  outboundTime: "10:00",
  passengers: 2,
  suitcases: 1,
  routeMetrics: routeReturn,
  vehicleType: EXECUTIVE,
  pricing: serverPricing,
});
assert.equal(serverQuote.ok, true);
if (serverQuote.ok) {
  assert.equal(serverQuote.vehicleType, EXECUTIVE);
  assert.equal(serverQuote.journeyFareGbp, roundGbp(saloonOne.journeyFareGbp * 2));
  assert.notEqual(serverQuote.journeyFareGbp, roundGbp(saloonOne.journeyFareGbp * 1.5));
}
const executiveOff = {
  ...defaultOwnerPricingSettings(),
  executive: { ...defaultOwnerPricingSettings().executive, publicEnabled: false },
};
const refused = calculateAuthoritativeWebsiteQuote({
  airportCode: "BFS",
  fromAirport: true,
  pickupAddress: "Belfast International Airport",
  dropoffAddress: "Belfast City Hall",
  returnJourney: false,
  passengers: 2,
  suitcases: 1,
  routeMetrics: routeReturn,
  vehicleType: EXECUTIVE,
  pricing: executiveOff,
});
assert.equal(refused.ok, false);
if (!refused.ok) assert.equal(refused.reason, "vehicle_unavailable");

const occupied = occupiedJobsFromPaidBooking({
  id: "exec-conflict",
  customerName: "Alex",
  customerEmail: "alex@example.com",
  mobileNumber: "07700900111",
  pickupLabel: "Belfast City Centre",
  dropoffLabel: "Belfast International Airport",
  tripDate: "2026-10-05",
  tripTime: "10:00",
  returnJourney: false,
  passengers: 2,
  suitcases: 1,
  vehicle: EXECUTIVE,
  routeDurationMinutes: 120,
} as never);
const conflict = evaluateSmartAvailability({
  requested: {
    pickupLabel: "Belfast City Centre",
    dropoffLabel: "Belfast International Airport",
    pickup: { lat: 54.5964, lng: -5.9302 },
    dropoff: { lat: 54.6575, lng: -6.2158 },
    tripDate: "2026-10-05",
    tripTime: "11:00",
    durationMinutes: 60,
    routeDurationMinutes: 60,
    vehicle: EXECUTIVE,
  },
  occupied,
  config: DEFAULT_SMART_OPS_CONFIG,
  searchAlternatives: false,
});
assert.equal(conflict.available, false);
const saloonClear = evaluateSmartAvailability({
  requested: {
    pickupLabel: "Belfast City Centre",
    dropoffLabel: "Belfast International Airport",
    pickup: { lat: 54.5964, lng: -5.9302 },
    dropoff: { lat: 54.6575, lng: -6.2158 },
    tripDate: "2026-10-05",
    tripTime: "11:00",
    durationMinutes: 60,
    routeDurationMinutes: 60,
    vehicle: SALOON,
  },
  occupied,
  config: DEFAULT_SMART_OPS_CONFIG,
  searchAlternatives: false,
});
assert.equal(saloonClear.available, true);
const insideNotice = decideCustomerSmartAvailabilityGate({
  enforce: true,
  booking: {
    pickupLabel: "Belfast City Centre",
    dropoffLabel: "Belfast International Airport",
    tripDate: "2026-10-05",
    tripTime: "11:00",
    vehicle: EXECUTIVE,
    routeDurationMinutes: 60,
    pickupLat: 54.5964,
    pickupLng: -5.9302,
    dropoffLat: 54.6575,
    dropoffLng: -6.2158,
  },
  occupied,
  config: DEFAULT_SMART_OPS_CONFIG,
  offerAlternatives: false,
  now: new Date("2026-10-05T09:00:00+01:00"),
  noticeHours: 12,
});
assert.equal(insideNotice.blocked, true);
assert.equal(insideNotice.customerMessage, EXECUTIVE_RESOURCE_UNAVAILABLE_MESSAGE);

const panel = readFileSync("src/components/OwnerPricingPanel.tsx", "utf8");
assert.match(panel, /data-executive-multiplier/);
assert.match(panel, /Saloon fare ×/);
assert.match(panel, /data-executive-availability/);
assert.match(panel, /resource: "executive"/);
const shortNotice = readFileSync("src/components/OwnerShortNoticePanel.tsx", "utf8");
assert.match(shortNotice, /period\.resource !== "executive"/);
const api = readFileSync("src/lib/short-notice-api.ts", "utf8");
assert.match(api, /input\.resource === "executive"/);
const quoteCard = readFileSync("src/components/QuoteCard.tsx", "utf8");
assert.match(quoteCard, /data-executive-included/);
assert.match(quoteCard, /EXECUTIVE_AIRPORT_PICKUP_INCLUDED/);
assert.match(quoteCard, /setChooseExecutive\(next === EXECUTIVE_VEHICLE\)/);
const categories = readFileSync("src/components/QuoteVehicleCategories.tsx", "utf8");
assert.match(categories, /EXECUTIVE_CUSTOMER_NAME/);
assert.match(categories, /EXECUTIVE_CUSTOMER_DESCRIPTION/);
assert.match(categories, /image: SALOON_IMAGE/);
assert.doesNotMatch(categories, /quote-executive/);
const terms = readFileSync("src/lib/terms.ts", "utf8");
assert.match(terms, /Mercedes-Benz C-Class or similar/);
assert.doesNotMatch(terms, /Executive saloon transfers are available on enquiry/);
const confirmation = buildCustomerConfirmationEmail({
  customerName: "Alex",
  customerEmail: "alex@example.com",
  mobileNumber: "07700900000",
  tripLabel: "Belfast to Belfast International",
  pickupLabel: "Belfast",
  dropoffLabel: "Belfast International Airport",
  returnJourney: false,
  tripDate: "2026-10-20",
  tripTime: "10:00",
  passengers: 2,
  suitcases: 1,
  vehicle: EXECUTIVE,
  amountPaid: "£66.00",
  isAirportTrip: true,
  isFromAirport: false,
} as never);
assert.match(confirmation.text, /Executive — Mercedes-Benz C-Class or similar/);
assert.match(confirmation.text, /Premium executive vehicle/);
assert.doesNotMatch(confirmation.text, /Service: SALOON/);
assert.match(confirmation.html, /Executive — Mercedes-Benz C-Class or similar/);
const handlers = readFileSync("workers/addresses/src/quote-handlers.ts", "utf8");
const payment = readFileSync("workers/addresses/src/index.ts", "utf8");
assert.doesNotMatch(handlers, /body\.executiveMultiplier/);
assert.doesNotMatch(payment, /body\.executiveMultiplier/);
assert.match(payment, /canonicalVehicleType/);
assert.match(payment, /availabilityResource !== "executive"/);

console.log("check-executive-multiplier: ok");
