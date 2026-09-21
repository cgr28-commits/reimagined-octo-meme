/**
 * Night & Weekend Surcharge (10%) — journey fare only, per-leg on returns.
 * Run: npx tsx scripts/check-night-weekend-surcharge.ts
 */

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
import { calculateUniversalEstateJourneyFareGbp } from "../shared/universal-distance-pricing";
import {
  applyTripPremium,
  AIRPORT_TRIP_PREMIUM_RATE,
  isTripPremiumDateTime,
  TRIP_PREMIUM_RATE,
} from "../src/lib/point-to-point-premium";
import { PRICING_CONFIG } from "../src/lib/pricing-config";
import { calculateQuote } from "../src/lib/quote";
import { ESTATE_VEHICLE, SALOON_VEHICLE } from "../src/lib/vehicle-selection";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { formatGbpAmount, roundGbp } from "../shared/gbp";

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
assert.equal(weekdayFare, 44);
assert.equal(weekday.premiumApplied, false);
assert.equal(weekday.nightWeekendSurchargeGbp, 0);
console.log(`OK  weekday daytime Saloon £${formatGbpAmount(weekdayFare)}`);

console.log("\n=== One-way Saloon / Estate ===");
const night = quote({ outboundDate: "2026-08-19", outboundTime: "22:00" });
assert.ok(night);
assert.equal(night.premiumApplied, true);
assert.equal(night.nightWeekendSurchargeGbp, roundGbp(weekdayFare * 0.1));
assert.equal(night.amount, roundGbp(weekdayFare * 1.1));
assert.equal(night.amount, 48.4);
console.log(
  `OK  weekday night Saloon £${formatGbpAmount(night.amount)} (base £${weekdayFare} + 10%)`,
);

const saturday = quote({ outboundDate: "2026-08-22", outboundTime: "12:00" });
const sunday = quote({ outboundDate: "2026-08-23", outboundTime: "12:00" });
assert.ok(saturday && sunday);
assert.equal(saturday.amount, 48.4);
assert.equal(sunday.amount, 48.4);
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
assert.equal(estateDay.amount, weekdayFare + 6);
assert.equal(estateNight.amount, roundGbp(estateDay.amount * 1.1));
assert.equal(estateNight.amount - estateDay.amount, roundGbp(estateDay.amount * 0.1));
console.log(
  `OK  Estate £${estateDay.amount} = Saloon £${weekdayFare} + £6 before surcharge; night £${estateNight.amount}`,
);

console.log("\n=== Airport pickup vs drop-off (BFS, no fixed costs) ===");
const dropoff = quote({ outboundDate: "2026-08-19", outboundTime: "22:00" }, { fromAirport: false });
const pickup = quote({ outboundDate: "2026-08-19", outboundTime: "22:00" }, { fromAirport: true });
assert.ok(dropoff && pickup);
assert.equal(dropoff.amount, pickup.amount);
assert.equal(dropoff.airportFixedCostsGbp, 0);
console.log("OK  BFS pickup = drop-off; no fixed costs in the 10%");

console.log("\n=== Return legs independently ===");
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
assert.equal(returnNeither.amount, roundGbp(weekdayFare * 2 * 0.95));
assert.equal(returnNeither.amount, 83.6);
console.log(`OK  return neither leg £${returnNeither.amount} (5% off 2×£${weekdayFare})`);

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
assert.equal(returnOutboundOnly.amount, roundGbp(83.6 + 4.4));
assert.equal(returnOutboundOnly.amount, 88);
console.log(`OK  return outbound-only surcharge £${returnOutboundOnly.amount}`);

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
assert.equal(returnReturnOnly.nightWeekendSurchargeGbp, 4.4);
assert.equal(returnReturnOnly.amount, 88);
console.log(
  `OK  Friday 14:00 + Tuesday 23:00 = £${returnReturnOnly.amount} (surcharge on return only)`,
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
assert.equal(returnSundayOnly.amount, 88);
assert.equal(returnSundayOnly.nightWeekendSurchargeGbp, 4.4);
console.log(`OK  Friday 14:00 + Sunday 15:00 = £${returnSundayOnly.amount}`);

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
assert.equal(returnBoth.nightWeekendSurchargeGbp, 8.8);
assert.equal(returnBoth.amount, 92.4);
console.log(`OK  return both legs £${returnBoth.amount}`);

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
  roundGbp((dubNight.journeyFareGbp ?? 0) + 5),
);
assert.equal(
  breakdown.nightWeekendSurchargeGbp,
  roundGbp((dubWeekday.journeyFareGbp ?? 0) * 0.1),
);
console.log(
  `OK  DUB pickup fixed £${dubFixedPickup} not in 10%; Express +£5 also excluded`,
);

console.log("\n=== Engine + quote-service ===");
const engine = applyTripPremium(
  100,
  { outboundDate: "2026-08-21", outboundTime: "14:00", returnDate: "2026-08-23", returnTime: "15:00", returnJourney: true },
  0.1,
);
assert.equal(engine.returnDiscountApplied, true);
assert.equal(engine.premiumAmount, 10);
assert.equal(engine.total, 200);
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
  assert.equal(live.amount, 48.4);
  assert.equal(live.premiumApplied, true);
  assert.equal(live.nightWeekendSurchargeGbp, 4.4);
}
console.log("OK  applyTripPremium per-leg; quote-service Saturday £48.40");

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
const root = path.resolve(import.meta.dirname, "..");
const fareTrust = fs.readFileSync(path.join(root, "src/components/QuoteFareTrust.tsx"), "utf8");
assert.match(fareTrust, /NIGHT_WEEKEND_SURCHARGE_EXPLANATION/);
assert.match(fareTrust, /nightWeekendSurchargeLabel/);
const promo = fs.readFileSync(path.join(root, "shared/website-promo-pricing.ts"), "utf8");
assert.match(promo, /Night & Weekend Surcharge \(10%\)/);
const bookingMsg = fs.readFileSync(path.join(root, "src/lib/booking-message.ts"), "utf8");
assert.match(bookingMsg, /Night & Weekend Surcharge \(10%\) applied/);
const workerShared = fs.readFileSync(
  path.join(root, "workers/addresses/shared/night-weekend-surcharge.ts"),
  "utf8",
);
const rootShared = fs.readFileSync(path.join(root, "shared/night-weekend-surcharge.ts"), "utf8");
assert.equal(workerShared, rootShared);
console.log("OK  quote / email / WhatsApp / worker-shared copy");

console.log("\nAll Night & Weekend Surcharge checks passed.");
