/**
 * Night & Weekend Surcharge (10%) — journey fare only, per-leg on returns.
 * Run: npx tsx scripts/check-night-weekend-surcharge.ts
 */
import { composeWebsiteFareBreakdown as composeForCustomerCheck, customerFacingFareBreakdown } from "../shared/website-fare-breakdown";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import {
  NIGHT_WEEKEND_SURCHARGE_EXPLANATION,
  NIGHT_WEEKEND_SURCHARGE_LABEL,
  NIGHT_WEEKEND_SURCHARGE_RATE,
} from "../shared/night-weekend-surcharge";
import { getAirportLegFixedCostGbp } from "../shared/airport-fixed-costs";
import {
  calculateUniversalEstateJourneyFareGbp,
  UNIVERSAL_ESTATE_PREMIUM_GBP,
} from "../shared/universal-distance-pricing";
import { RETURN_JOURNEY_DISCOUNT_RATE } from "../shared/return-journey-discount";
import { SERVED_AIRPORTS } from "../shared/served-airports";
import {
  applyReturnJourneyDiscount,
  applyTripPremium,
  AIRPORT_TRIP_PREMIUM_RATE,
  isTripPremiumDateTime,
  TRIP_PREMIUM_RATE,
} from "../src/lib/point-to-point-premium";
import { PRICING_CONFIG } from "../src/lib/pricing-config";
import {
  calculateAirportToAirportQuote,
  calculatePointToPointQuote,
  calculateQuote,
} from "../src/lib/quote";
import { ESTATE_VEHICLE, SALOON_VEHICLE } from "../src/lib/vehicle-selection";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { formatGbpAmount, roundCustomerPayableGbp, roundGbp } from "../shared/gbp";

const root = path.resolve(import.meta.dirname, "..");
const cityHall = "Belfast City Hall, Belfast BT1 5GS";
const cityBfsMetrics = { distanceKm: 14 / 0.621371, durationMinutes: 25 };
const SALOON = SALOON_VEHICLE;
const ESTATE = ESTATE_VEHICLE;

function quote(
  schedule: { outboundDate: string; outboundTime: string; returnDate?: string; returnTime?: string },
  options: {
    returnJourney?: boolean;
    vehicle?: typeof SALOON | typeof ESTATE;
    fromAirport?: boolean;
    airport?: string;
  } = {},
) {
  return calculateQuote(
    cityHall,
    options.airport ?? "BFS",
    options.vehicle ?? SALOON,
    Boolean(options.returnJourney),
    { ...schedule, returnJourney: Boolean(options.returnJourney) },
    cityBfsMetrics,
    Boolean(options.fromAirport),
  );
}

console.log("=== Config ===");
assert.equal(NIGHT_WEEKEND_SURCHARGE_RATE, 0.1);
assert.equal(PRICING_CONFIG.airportTripPremiumRate, 0.1);
assert.equal(PRICING_CONFIG.addressToAddressTripPremiumRate, 0.1);
assert.equal(AIRPORT_TRIP_PREMIUM_RATE, 0.1);
assert.equal(TRIP_PREMIUM_RATE, 0.1);
console.log("OK  10% Night & Weekend Surcharge rates");

console.log("\n=== Window boundaries (Europe/London) ===");
const windows: Array<[string, string, boolean, string]> = [
  ["2026-08-24", "05:59", true, "Monday 05:59"],
  ["2026-08-24", "06:00", false, "Monday 06:00"],
  ["2026-08-19", "21:59", false, "Wednesday 21:59"],
  ["2026-08-19", "22:00", true, "Wednesday 22:00"],
  ["2026-08-19", "23:59", true, "Wednesday 23:59"],
  ["2026-08-22", "00:00", true, "Saturday 00:00"],
  ["2026-08-22", "12:00", true, "Saturday 12:00"],
  ["2026-08-22", "23:59", true, "Saturday 23:59"],
  ["2026-08-23", "00:00", true, "Sunday 00:00"],
  ["2026-08-23", "12:00", true, "Sunday 12:00"],
  ["2026-08-23", "23:59", true, "Sunday 23:59"],
  ["2026-08-24", "00:00", true, "Monday 00:00"],
  ["2026-08-24", "10:00", false, "Monday 10:00"],
  ["2026-05-04", "10:00", false, "BH Monday 10:00 (daytime, no extra)"],
];
for (const [date, time, expected, label] of windows) {
  assert.equal(isTripPremiumDateTime(date, time), expected, label);
}
console.log("OK  weekday night / weekend / Monday morning boundaries");

const weekday = quote({ outboundDate: "2026-08-19", outboundTime: "10:00" });
assert.ok(weekday);
const weekdayFare = weekday.amount;
assert.equal(weekdayFare, 45);
assert.equal(weekday.premiumApplied, false);
assert.equal(weekday.nightWeekendSurchargeGbp, 0);
console.log(`OK  weekday daytime Saloon £${formatGbpAmount(weekdayFare)}`);

console.log("\n=== One-way Saloon / Estate ===");
const night = quote({ outboundDate: "2026-08-19", outboundTime: "22:00" });
assert.ok(night);
assert.equal(night.premiumApplied, true);
assert.equal(night.nightWeekendSurchargeGbp, roundGbp(weekdayFare * 0.1));
assert.equal(night.amount, roundGbp(weekdayFare * 1.1));
assert.equal(night.amount, 49.5);
console.log(
  `OK  weekday night Saloon £${formatGbpAmount(night.amount)} (base £${weekdayFare} + 10%)`,
);

const saturday = quote({ outboundDate: "2026-08-22", outboundTime: "12:00" });
const sunday = quote({ outboundDate: "2026-08-23", outboundTime: "12:00" });
assert.ok(saturday && sunday);
assert.equal(saturday.amount, 49.5);
assert.equal(sunday.amount, 49.5);
console.log(
  `OK  Saturday £${formatGbpAmount(saturday.amount)}; Sunday £${formatGbpAmount(sunday.amount)}`,
);

const estateDay = quote(
  { outboundDate: "2026-08-19", outboundTime: "10:00" },
  { vehicle: ESTATE },
);
const estateNight = quote(
  { outboundDate: "2026-08-19", outboundTime: "22:00" },
  { vehicle: ESTATE },
);
assert.ok(estateDay && estateNight);
assert.equal(estateDay.amount, calculateUniversalEstateJourneyFareGbp(weekdayFare));
assert.equal(estateDay.amount, weekdayFare + UNIVERSAL_ESTATE_PREMIUM_GBP);
assert.equal(estateNight.amount, roundGbp(estateDay.amount * 1.1));
assert.equal(roundGbp(estateNight.amount - estateDay.amount), roundGbp(estateDay.amount * 0.1));
console.log(
  `OK  Estate £${estateDay.amount} = Saloon £${weekdayFare} + £${UNIVERSAL_ESTATE_PREMIUM_GBP} before surcharge; night £${estateNight.amount}`,
);

console.log("\n=== Airport pickup vs drop-off (BFS, no fixed costs) ===");
const dropoff = quote({ outboundDate: "2026-08-19", outboundTime: "22:00" }, { fromAirport: false });
const pickup = quote({ outboundDate: "2026-08-19", outboundTime: "22:00" }, { fromAirport: true });
assert.ok(dropoff && pickup);
assert.equal(dropoff.amount, pickup.amount);
assert.equal(dropoff.airportFixedCostsGbp, 0);
console.log("OK  BFS pickup = drop-off; no fixed costs in the 10%");

console.log("\n=== A–E. Weekday one-way boundaries ===");
const wednesday2159 = quote({ outboundDate: "2026-08-19", outboundTime: "21:59" });
const thursday0559 = quote({ outboundDate: "2026-08-20", outboundTime: "05:59" });
const thursday0600 = quote({ outboundDate: "2026-08-20", outboundTime: "06:00" });
assert.ok(wednesday2159 && thursday0559 && thursday0600);
assert.equal(wednesday2159.amount, 45, "E. Weekday 21:59 — no surcharge");
assert.equal(wednesday2159.nightWeekendSurchargeGbp, 0);
assert.equal(thursday0559.amount, 49.5, "C. Weekday 05:59 — surcharge");
assert.equal(thursday0559.nightWeekendSurchargeGbp, 4.5);
assert.equal(thursday0600.amount, 45, "D. Weekday 06:00 — no surcharge");
assert.equal(thursday0600.nightWeekendSurchargeGbp, 0);
console.log("OK  A weekday day / B 22:00 / C 05:59 / D 06:00 / E 21:59");

console.log("\n=== H–K. Return: 5% on BASE fares, then +10% of original base per qualifying leg ===");
assert.equal(RETURN_JOURNEY_DISCOUNT_RATE, 0.05);
const returnNeitherExpected = roundGbp(weekdayFare * 2 * 0.95); // 85.50
const returnOneExpected = roundGbp(returnNeitherExpected + weekdayFare * 0.1); // 90.00
const returnBothExpected = roundGbp(returnNeitherExpected + weekdayFare * 0.2); // 94.50
assert.equal(returnNeitherExpected, 85.5);
assert.equal(returnOneExpected, 90);
assert.equal(returnBothExpected, 94.5);
assert.notEqual(returnOneExpected, 87.78, "5% must not include the Night & Weekend Surcharge");
assert.notEqual(returnBothExpected, 91.96, "5% must not include both surcharges");

const returnNeither = quote(
  {
    outboundDate: "2026-08-21",
    outboundTime: "14:00",
    returnDate: "2026-08-25",
    returnTime: "10:00",
  },
  { returnJourney: true },
);
assert.ok(returnNeither);
assert.equal(returnNeither.premiumApplied, false);
assert.equal(returnNeither.amount, returnNeitherExpected);
assert.equal(returnNeither.amount, 85.5);
console.log(`OK  H. return neither leg £${returnNeither.amount} (5% off 2×£${weekdayFare})`);

const returnOutboundOnly = quote(
  {
    outboundDate: "2026-08-21",
    outboundTime: "23:00",
    returnDate: "2026-08-25",
    returnTime: "10:00",
  },
  { returnJourney: true },
);
assert.ok(returnOutboundOnly);
assert.equal(returnOutboundOnly.nightWeekendSurchargeGbp, roundGbp(weekdayFare * 0.1));
assert.equal(returnOutboundOnly.amount, returnOneExpected);
assert.equal(returnOutboundOnly.amount, 90);
assert.notEqual(returnOutboundOnly.amount, 87.78);
console.log(`OK  I. return outbound-only: 5% of £90 then +£4.50 = £${returnOutboundOnly.amount}`);

const returnReturnOnly = quote(
  {
    outboundDate: "2026-08-21",
    outboundTime: "14:00",
    returnDate: "2026-08-25",
    returnTime: "23:00",
  },
  { returnJourney: true },
);
assert.ok(returnReturnOnly);
assert.equal(returnReturnOnly.nightWeekendSurchargeGbp, 4.5);
assert.equal(returnReturnOnly.amount, 90);
console.log(
  `OK  J. Friday 14:00 + Tuesday 23:00 = £${returnReturnOnly.amount} (5% of base, then +£4.50)`,
);

const returnSundayOnly = quote(
  {
    outboundDate: "2026-08-21",
    outboundTime: "14:00",
    returnDate: "2026-08-23",
    returnTime: "15:00",
  },
  { returnJourney: true },
);
assert.ok(returnSundayOnly);
assert.equal(returnSundayOnly.amount, 90);
assert.equal(returnSundayOnly.nightWeekendSurchargeGbp, 4.5);
console.log(`OK  J. Friday 14:00 + Sunday 15:00 = £${returnSundayOnly.amount}`);

const returnBoth = quote(
  {
    outboundDate: "2026-08-22",
    outboundTime: "10:00",
    returnDate: "2026-08-23",
    returnTime: "10:00",
  },
  { returnJourney: true },
);
assert.ok(returnBoth);
assert.equal(returnBoth.nightWeekendSurchargeGbp, 9);
assert.equal(returnBoth.amount, returnBothExpected);
assert.equal(returnBoth.amount, 94.5);
assert.notEqual(returnBoth.amount, 91.96);
console.log(`OK  K. return both legs £${returnBoth.amount} (5% of £90 then +£9.00)`);

console.log("\n=== Fixed costs excluded ===");
const dubFixedPickup = getAirportLegFixedCostGbp("DUB", true);
assert.ok(dubFixedPickup > 0);
const dubWeekday = calculateQuote(
  cityHall,
  "DUB",
  SALOON,
  false,
  { outboundDate: "2026-08-19", outboundTime: "10:00" },
  cityBfsMetrics,
  true,
);
const dubNight = calculateQuote(
  cityHall,
  "DUB",
  SALOON,
  false,
  { outboundDate: "2026-08-19", outboundTime: "22:00" },
  cityBfsMetrics,
  true,
);
assert.ok(dubWeekday && dubNight);
assert.equal(dubWeekday.airportFixedCostsGbp, dubFixedPickup);
assert.equal(dubNight.airportFixedCostsGbp, dubFixedPickup);
assert.equal(
  dubNight.nightWeekendSurchargeGbp,
  roundGbp((dubWeekday.journeyFareGbp ?? 0) * 0.1),
);
assert.equal(
  dubNight.amount,
  roundGbp((dubWeekday.journeyFareGbp ?? 0) * 1.1 + dubFixedPickup),
);
const breakdown = composeWebsiteFareBreakdown({
  journeyFareBeforeAirportAccessGbp: dubNight.journeyFareGbp ?? 0,
  airportFixedCostsGbp: dubNight.airportFixedCostsGbp,
  nightWeekendSurchargeGbp: dubNight.nightWeekendSurchargeGbp,
  airportAccessChargeGbp: 5,
});
assert.equal(breakdown.nightWeekendSurchargeGbp, dubNight.nightWeekendSurchargeGbp);
assert.equal(
  breakdown.finalAmountPayableGbp,
  roundCustomerPayableGbp((dubNight.journeyFareGbp ?? 0) + dubFixedPickup + 5),
);
assert.equal(
  breakdown.nightWeekendSurchargeGbp,
  roundGbp((dubWeekday.journeyFareGbp ?? 0) * 0.1),
);
assert.notEqual(
  breakdown.nightWeekendSurchargeGbp,
  roundGbp(((dubWeekday.journeyFareGbp ?? 0) + dubFixedPickup + 5) * 0.1),
);
console.log(
  `OK  DUB pickup fixed £${dubFixedPickup} not in 10%; Express +£5 also excluded`,
);

console.log("\n=== 15. Authoritative £100 base + £5 discount + £10 + £6 = £111 (not £110.50) ===");
const specEngine = applyTripPremium(
  50,
  {
    outboundDate: "2026-08-22",
    outboundTime: "10:00",
    returnDate: "2026-08-23",
    returnTime: "10:00",
    returnJourney: true,
  },
  0.1,
);
assert.equal(specEngine.premiumAmount, 10);
assert.equal(specEngine.total, 105);
assert.notEqual(specEngine.total, 104.5);
const specBreakdown = composeWebsiteFareBreakdown({
  journeyFareBeforeAirportAccessGbp: specEngine.total,
  nightWeekendSurchargeGbp: specEngine.premiumAmount,
  airportFixedCostsGbp: 6,
  returnJourney: true,
});
assert.equal(specBreakdown.originalEligibleJourneyPriceGbp, 100);
assert.equal(specBreakdown.returnJourneySavingGbp, 5);
assert.equal(specBreakdown.nightWeekendSurchargeGbp, 10);
assert.equal(specBreakdown.airportFixedCostsGbp, 6);
assert.equal(specBreakdown.finalAmountPayableGbp, 111);
assert.notEqual(specBreakdown.finalAmountPayableGbp, 110.5);
assert.equal(roundGbp(applyReturnJourneyDiscount(100) + 10 + 6), 111);
assert.notEqual(
  specEngine.premiumAmount,
  roundGbp(applyReturnJourneyDiscount(50) * 0.1 * 2),
  "10% must use the original £50 base, not the post-5% £47.50",
);
console.log("OK  £100 base − £5 + £10 surcharge + £6 fixed = £111 (not £110.50)");

console.log("\n=== N. Express excluded from both percentages ===");
const specExpress = composeWebsiteFareBreakdown({
  journeyFareBeforeAirportAccessGbp: specEngine.total,
  nightWeekendSurchargeGbp: specEngine.premiumAmount,
  airportFixedCostsGbp: 6,
  airportAccessChargeGbp: 5,
  returnJourney: true,
});
assert.equal(specExpress.returnJourneySavingGbp, 5);
assert.equal(specExpress.airportAccessChargeGbp, 5);
assert.equal(specExpress.finalAmountPayableGbp, 116);
assert.equal(
  specExpress.finalAmountPayableGbp,
  roundGbp(specBreakdown.finalAmountPayableGbp + 5),
);
console.log("OK  Express +£5 added after both percentages; neither alters it");

console.log("\n=== P. Airport-to-airport surcharge applied once ===");
const bfsAirport = SERVED_AIRPORTS.find((item) => item.code === "BFS");
const bhdAirport = SERVED_AIRPORTS.find((item) => item.code === "BHD");
assert.ok(bfsAirport && bhdAirport);
const a2aMetrics = { distanceKm: 17 / 0.621371, durationMinutes: 32 };
const a2aUnderlying = calculatePointToPointQuote(
  bfsAirport.formattedAddress,
  bhdAirport.formattedAddress,
  SALOON,
  false,
  {},
  a2aMetrics,
);
const a2aWeekday = calculateAirportToAirportQuote(
  "BFS",
  "BHD",
  bfsAirport.formattedAddress,
  bhdAirport.formattedAddress,
  SALOON,
  false,
  { outboundDate: "2026-08-19", outboundTime: "10:00" },
  a2aMetrics,
);
const a2aSaturday = calculateAirportToAirportQuote(
  "BFS",
  "BHD",
  bfsAirport.formattedAddress,
  bhdAirport.formattedAddress,
  SALOON,
  false,
  { outboundDate: "2026-08-22", outboundTime: "10:00" },
  a2aMetrics,
);
assert.ok(a2aUnderlying && a2aWeekday && a2aSaturday);
const a2aFixed = 0; // Belfast access is optional after vehicle selection.
assert.equal(a2aWeekday.nightWeekendSurchargeGbp, 0);
assert.equal(a2aWeekday.amount, roundGbp(a2aUnderlying.amount + a2aFixed));
assert.equal(a2aSaturday.nightWeekendSurchargeGbp, roundGbp(a2aUnderlying.amount * 0.1));
assert.equal(
  a2aSaturday.amount,
  roundGbp(a2aUnderlying.amount * 1.1 + a2aFixed),
);
assert.notEqual(
  a2aSaturday.amount,
  roundGbp(a2aUnderlying.amount * 1.21 + a2aFixed),
  "A2A must not apply the 10% twice",
);
const a2aReturnBoth = calculateAirportToAirportQuote(
  "BFS",
  "BHD",
  bfsAirport.formattedAddress,
  bhdAirport.formattedAddress,
  SALOON,
  true,
  {
    outboundDate: "2026-08-22",
    outboundTime: "10:00",
    returnDate: "2026-08-23",
    returnTime: "10:00",
  },
  a2aMetrics,
);
assert.ok(a2aReturnBoth);
const a2aReturnQualifying = roundGbp(a2aUnderlying.amount * 1.1 * 2);
assert.equal(a2aReturnBoth.nightWeekendSurchargeGbp, roundGbp(a2aUnderlying.amount * 0.2));
assert.equal(
  a2aReturnBoth.journeyFareGbp,
  roundGbp(applyReturnJourneyDiscount(a2aUnderlying.amount * 2) + a2aUnderlying.amount * 0.2),
);
assert.notEqual(
  a2aReturnBoth.journeyFareGbp,
  roundGbp(a2aReturnQualifying * 0.95),
  "A2A return 5% must not include the surcharge",
);
console.log(
  `OK  P. BFS→BHD Saturday surcharge once (£${a2aSaturday.nightWeekendSurchargeGbp}); return 5% on base only`,
);

console.log("\n=== Engine + Q/R Worker/server + SumUp authority ===");
const engine = applyTripPremium(
  100,
  {
    outboundDate: "2026-08-21",
    outboundTime: "14:00",
    returnDate: "2026-08-23",
    returnTime: "15:00",
    returnJourney: true,
  },
  0.1,
);
assert.equal(engine.returnDiscountApplied, true);
assert.equal(engine.premiumAmount, 10);
assert.equal(engine.total, 200);
assert.notEqual(engine.total, 199.5);
const live = calculateAuthoritativeWebsiteQuote({
  airportCode: "BFS",
  fromAirport: false,
  pickupAddress: cityHall,
  dropoffAddress: "Belfast International Airport",
  returnJourney: false,
  outboundDate: "2026-08-22",
  outboundTime: "12:00",
  passengers: 2,
  suitcases: 1,
  routeMetrics: cityBfsMetrics,
});
assert.equal(live.ok, true);
if (live.ok) {
  assert.equal(live.amount, 49.5);
  assert.equal(live.premiumApplied, true);
  assert.equal(live.nightWeekendSurchargeGbp, 4.5);
}
const liveReturn = calculateAuthoritativeWebsiteQuote({
  airportCode: "BFS",
  fromAirport: false,
  pickupAddress: cityHall,
  dropoffAddress: "Belfast International Airport",
  returnJourney: true,
  outboundDate: "2026-08-21",
  outboundTime: "23:00",
  returnDate: "2026-08-25",
  returnTime: "10:00",
  passengers: 2,
  suitcases: 1,
  routeMetrics: cityBfsMetrics,
});
assert.equal(liveReturn.ok, true);
if (liveReturn.ok) {
  assert.equal(liveReturn.amount, returnOutboundOnly.amount);
  assert.equal(liveReturn.nightWeekendSurchargeGbp, returnOutboundOnly.nightWeekendSurchargeGbp);
  const checkout = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: liveReturn.journeyFareGbp ?? liveReturn.amount,
    nightWeekendSurchargeGbp: liveReturn.nightWeekendSurchargeGbp,
    airportFixedCostsGbp: liveReturn.airportFixedCostsGbp ?? 0,
    returnJourney: true,
  });
  assert.equal(
    checkout.finalAmountPayableGbp,
    roundCustomerPayableGbp(liveReturn.amount),
  );
  assert.equal(checkout.returnJourneySavingGbp, 4.5);
  assert.equal(checkout.originalEligibleJourneyPriceGbp, 90);
}
const paymentSrc = fs.readFileSync(
  path.join(root, "workers/addresses/src/index.ts"),
  "utf8",
);
// Optional Meet & Greet is added after the discounted fare and time premium.
// Keep verifying the server total and accepted-price guard used for SumUp.
assert.match(paymentSrc, /const optionalMeetGreetFee = legacyAccess \|\| airportContext\.airportCode === "DUB" \? optionalMeetGreet\.feeGbp : 0/);
assert.match(paymentSrc, /const serverFinalAmountGbp = Math\.round\(\(breakdown\.finalAmountPayableGbp \+ optionalMeetGreetFee\) \* 100\) \/ 100/);
assert.match(paymentSrc, /if \(!checkoutAmountsMatch\(acceptedFinalRaw, serverFinalAmountGbp\)\)/);
assert.match(paymentSrc, /resolveSumUpChargeAmountGbp\(\s*acceptedFinalRaw,\s*serverFinalAmountGbp/);
assert.match(paymentSrc, /never use client standardWebsiteAmount for SumUp amount/);
console.log("OK  Q/R engine, quote-service and SumUp use 5% on base then +surcharge");

console.log("\n=== Europe/London DST wall-clock ===");
assert.equal(isTripPremiumDateTime("2026-03-29", "01:00"), true, "BST-start Sunday");
assert.equal(isTripPremiumDateTime("2026-03-30", "05:59"), true, "Monday after spring-forward 05:59");
assert.equal(isTripPremiumDateTime("2026-03-30", "06:00"), false, "Monday after spring-forward 06:00");
assert.equal(isTripPremiumDateTime("2026-10-25", "01:00"), true, "GMT-start Sunday");
console.log("OK  DST Sundays + Monday night window use wall-clock Europe/London");

console.log("\n=== Customer-facing copy ===");
assert.equal(NIGHT_WEEKEND_SURCHARGE_LABEL, "Night & Weekend Surcharge (10%)");
assert.match(
  NIGHT_WEEKEND_SURCHARGE_EXPLANATION,
  /10% surcharge applies to journeys booked for pickup between 10pm and 6am Monday–Friday, and all day Saturday and Sunday/,
);
const fareTrust = fs.readFileSync(path.join(root, "src/components/QuoteFareTrust.tsx"), "utf8");
// Customers never see the surcharge as its own line: it is folded into the journey fare.
assert.match(fareTrust, /customerFacingFareBreakdown,/);
assert.match(fareTrust, /const breakdown = customerFacingFareBreakdown\(rawBreakdown\);[\s\S]*const breakdown = customerFacingFareBreakdown\(rawBreakdown\);/);
const promo = fs.readFileSync(path.join(root, "shared/website-promo-pricing.ts"), "utf8");
assert.match(promo, /Evening \/ Night \/ Weekend surcharge/);
assert.match(promo, /5% Return Booking Discount/);
const bookingMsg = fs.readFileSync(path.join(root, "src/lib/booking-message.ts"), "utf8");
assert.doesNotMatch(bookingMsg, /surcharge applied/i, "Customer WhatsApp message never names the surcharge");
assert.match(bookingMsg, /5% Return Booking Discount applied/);
const fareTrustSrc = fareTrust;
assert.match(fareTrustSrc, /5% Return Booking Discount/);
assert.doesNotMatch(cardQuoteResultsReady(), /quoteResultsReady \? null : null/);
const sharedNames = [
  "night-weekend-surcharge.ts",
  "quote-display-gate.ts",
  "website-fare-breakdown.ts",
  "website-promo-pricing.ts",
  "booking-notifications.ts",
];
for (const name of sharedNames) {
  const workerCopy = fs.readFileSync(path.join(root, "workers/addresses/shared", name), "utf8");
  const rootCopy = fs.readFileSync(path.join(root, "shared", name), "utf8");
  assert.equal(workerCopy, rootCopy, `${name} must match between root/shared and Worker`);
}
console.log("OK  quote / email / WhatsApp / worker-shared copy");

function cardQuoteResultsReady(): string {
  return fs.readFileSync(path.join(root, "src/components/QuoteCard.tsx"), "utf8");
}

console.log("\nAll Night & Weekend Surcharge checks passed.");

console.log("\n=== Customer breakdown folds surcharge into the journey fare ===");
{
  for (const returnJourney of [false, true]) {
    const raw = composeForCustomerCheck({
      journeyFareBeforeAirportAccessGbp: 144,
      nightWeekendSurchargeGbp: 14,
      airportFixedCostsGbp: 0,
      airportAccessChargeGbp: 0,
      returnJourney,
    });
    const shown = customerFacingFareBreakdown(raw);
    assert.equal(shown.nightWeekendSurchargeGbp, 0, "No surcharge line for customers");
    const journey = returnJourney ? shown.originalEligibleJourneyPriceGbp : shown.journeyFareBeforePromotionsGbp;
    const rowsTotal = Math.round((journey - shown.returnJourneySavingGbp + shown.airportFixedCostsGbp) * 100) / 100;
    assert.equal(rowsTotal, raw.transferFareAfterPromotionsGbp, `Rows still add up (${returnJourney ? "return" : "one way"})`);
    assert.equal(shown.finalAmountPayableGbp, raw.finalAmountPayableGbp, "Price unchanged");
  }
  console.log("OK  surcharge hidden; rows add up; price unchanged");
}
