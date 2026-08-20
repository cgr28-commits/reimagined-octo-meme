/**
 * Combined regression: no weekend surcharge, 5% return discount, vehicle rule,
 * optional quote date/time, mandatory booking date/time, homepage benefit.
 * Run: npx tsx scripts/check-pricing-vehicle-quote-flow.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { RETURN_JOURNEY_DISCOUNT_RATE } from "../shared/return-journey-discount";
import { getPaymentBookingBlockers } from "../shared/paid-booking-gate";
import { buildQuoteLeadMessage } from "../shared/quote-lead";
import {
  buildSaveQuotePayloadFromLiveQuote,
} from "../src/lib/save-quote-payload";
import { calculateQuote } from "../src/lib/quote";
import { PRICING_CONFIG } from "../src/lib/pricing-config";
import { getReturnJourneyFare } from "../src/lib/point-to-point-premium";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  selectVehicleForParty,
} from "../src/lib/vehicle-selection";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";

const root = path.resolve(import.meta.dirname, "..");
let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

check("pricing rates: weekend/BH surcharge disabled; return discount exactly 5%", () => {
  assert.equal(PRICING_CONFIG.airportTripPremiumRate, 0);
  assert.equal(PRICING_CONFIG.addressToAddressTripPremiumRate, 0);
  assert.equal(RETURN_JOURNEY_DISCOUNT_RATE, 0.05);
  assert.equal(getReturnJourneyFare(100), 190);
});

check("weekday fare = weekend fare = Bank Holiday fare", () => {
  const cityHall = "Belfast City Hall, Belfast BT1 5GS";
  const weekday = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, {
    outboundDate: "2026-08-19",
    outboundTime: "10:00",
  });
  const weekend = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, {
    outboundDate: "2026-08-22",
    outboundTime: "10:00",
  });
  const bh = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, {
    outboundDate: "2026-05-04",
    outboundTime: "10:00",
  });
  const noDate = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, {});
  assert.ok(weekday && weekend && bh && noDate);
  assert.equal(weekday.amount, weekend.amount);
  assert.equal(weekday.amount, bh.amount);
  assert.equal(weekday.amount, noDate.amount);
  assert.equal(weekday.premiumApplied, false);
  assert.equal(weekend.premiumApplied, false);
  assert.equal(bh.premiumApplied, false);
});

check("vehicle selection matrix (suitcase-based Estate)", () => {
  const cases: Array<[number, number, string]> = [
    [1, 0, SALOON_VEHICLE],
    [2, 2, SALOON_VEHICLE],
    [3, 1, SALOON_VEHICLE],
    [3, 2, SALOON_VEHICLE],
    [4, 2, SALOON_VEHICLE],
    [1, 3, ESTATE_VEHICLE],
    [2, 4, ESTATE_VEHICLE],
    [3, 3, ESTATE_VEHICLE],
    [4, 4, ESTATE_VEHICLE],
    [5, 0, MINIBUS_VEHICLE],
    [6, 2, MINIBUS_VEHICLE],
    [7, 4, MINIBUS_VEHICLE],
  ];
  for (const [pax, bags, expected] of cases) {
    assert.equal(selectVehicleForParty(pax, bags), expected, `${pax}p/${bags}c`);
  }
});

check("quote can be calculated without date/time (quote-service)", () => {
  const result = calculateAuthoritativeWebsiteQuote({
    pickupAddress: "Belfast City Hall, Belfast BT1 5GS",
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS",
    fromAirport: false,
    passengers: 2,
    suitcases: 2,
    returnJourney: false,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.amount > 0);
    assert.equal(result.premiumApplied, false);
  }
});

check("quote can be saved without date/time", () => {
  const built = buildSaveQuotePayloadFromLiveQuote({
    liveQuote: {
      amount: 50,
      area: "belfast",
      areaSurcharge: 0,
      airportBase: 45,
      vehicleMultiplier: 1,
      vehicleAdjustment: 0,
      premiumApplied: false,
    },
    canPayNowOnline: true,
    isEnquiryOnly: false,
    showsRequestQuoteFlow: false,
    pickupLabel: "Belfast City Hall",
    dropoffLabel: "Belfast International Airport",
    airportCode: "BFS",
    tripDirection: "to-airport",
    isAirportTrip: true,
    journeyType: "Airport drop-off",
    tripDate: "",
    tripTime: "",
    returnJourney: false,
    passengers: 2,
    suitcases: 2,
    vehicle: SALOON_VEHICLE,
    tripLabel: "Airport drop-off",
  });
  assert.equal(built.ok, true);
  if (built.ok) {
    assert.equal(built.payload.journey.tripDate, "");
    assert.equal(built.payload.journey.tripTime, "");
  }
});

check("saved quote / emails display Not set when schedule omitted", () => {
  const emails = fs.readFileSync(path.join(root, "shared/saved-quote-emails.ts"), "utf8");
  assert.match(emails, /Not set/);
  const lead = buildQuoteLeadMessage({
    tripLabel: "Airport drop-off",
    pickupLabel: "Dungiven",
    dropoffLabel: "Belfast City Airport",
    returnJourney: false,
    passengers: 2,
    suitcases: 2,
    vehicle: SALOON_VEHICLE,
    estimatedPrice: "£154.00",
    isAirportTrip: true,
  });
  assert.match(lead, /Not set/);
});

check("booking cannot proceed to payment without date/time", () => {
  const blockers = getPaymentBookingBlockers({
    customerName: "Test Customer",
    customerEmail: "test@example.com",
    mobileNumber: "07700900000",
    tripLabel: "Airport drop-off",
    pickupLabel: "Belfast",
    dropoffLabel: "BFS",
    returnJourney: false,
    tripDate: "",
    tripTime: "",
    passengers: 2,
    suitcases: 2,
    vehicle: SALOON_VEHICLE,
    estimatedPrice: "£50.00",
    isAirportTrip: true,
  });
  assert.ok(blockers.some((b) => /date|time/i.test(b)));
});

check("entering date/time allows booking gate to pass schedule checks", () => {
  const blockers = getPaymentBookingBlockers({
    customerName: "Test Customer",
    customerEmail: "test@example.com",
    mobileNumber: "07700900000",
    tripLabel: "Airport drop-off",
    pickupLabel: "Belfast",
    dropoffLabel: "BFS",
    returnJourney: false,
    tripDate: "2026-09-01",
    tripTime: "10:00",
    passengers: 2,
    suitcases: 2,
    vehicle: SALOON_VEHICLE,
    estimatedPrice: "£50.00",
    isAirportTrip: true,
  });
  assert.ok(!blockers.some((b) => /date|time/i.test(b)));
});

check("homepage benefits include Save 5% when you book a return", () => {
  const hero = fs.readFileSync(path.join(root, "src/components/HeroSlideshow.tsx"), "utf8");
  assert.match(hero, /Get your fixed price instantly/);
  assert.match(hero, /Airport fees included where applicable/);
  assert.match(hero, /Flight monitoring/);
  assert.match(hero, /60 minutes complimentary airport waiting/);
  assert.match(hero, /Secure online booking/);
  assert.match(hero, /Save 5% when you book a return/);
});

check("public quote tool does not ask for child/car seats", () => {
  const progressive = fs.readFileSync(
    path.join(root, "src/components/QuoteProgressiveRoute.tsx"),
    "utf8",
  );
  const card = fs.readFileSync(path.join(root, "src/components/QuoteCard.tsx"), "utf8");
  assert.doesNotMatch(progressive, /Child seats|Child seat details/);
  assert.doesNotMatch(card, /onChildSeatsChange|setChildSeats/);
});

check("customer-facing copy does not claim weekend costs more", () => {
  const terms = fs.readFileSync(path.join(root, "src/lib/terms.ts"), "utf8");
  assert.doesNotMatch(terms, /Weekday, weekend and bank holiday rates may change the fare/);
  const panel = fs.readFileSync(
    path.join(root, "src/components/OwnerPersonalQuotesPanel.tsx"),
    "utf8",
  );
  assert.doesNotMatch(panel, /Bank Holiday premiums/);
});

check("shared return discount source of truth unchanged at 5%", () => {
  const rate = JSON.parse(
    fs.readFileSync(path.join(root, "shared/return-journey-discount-rate.json"), "utf8"),
  ) as { returnJourneyDiscountRate: number };
  assert.equal(rate.returnJourneyDiscountRate, 0.05);
});

console.log(`\n${passed} combined pricing/vehicle/quote-flow checks passed`);
