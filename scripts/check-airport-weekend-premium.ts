/**
 * No weekend / Bank Holiday trip surcharge (rates at 0).
 * Return discount remains exactly 5%.
 * Run: npx tsx scripts/check-airport-weekend-premium.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { getWebsiteReturnJourneyFare } from "../shared/return-journey-discount";
import { resolvePersonalQuoteCheckoutAmount } from "../shared/personal-quote";
import {
  applyTripPremium,
  AIRPORT_TRIP_PREMIUM_RATE,
  getReturnJourneyFare,
} from "../src/lib/point-to-point-premium";
import { PRICING_CONFIG } from "../src/lib/pricing-config";
import { calculatePointToPointQuote, calculateQuote } from "../src/lib/quote";
import { emptySelectedPlace, type SelectedPlace } from "../src/lib/selected-place";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";
import { calculateWebsiteOneWayFare } from "../src/lib/website-fare";

const SALOON = SALOON_VEHICLE;
const cityHall = "Belfast City Hall, Belfast BT1 5GS";
const root = path.resolve(import.meta.dirname, "..");

assert.equal(PRICING_CONFIG.airportTripPremiumRate, 0);
assert.equal(AIRPORT_TRIP_PREMIUM_RATE, 0);
assert.equal(PRICING_CONFIG.addressToAddressTripPremiumRate, 0);
assert.equal(PRICING_CONFIG.operational.weekendAndBankHoliday.premiumRate ?? 0, 0);
console.log("OK  Config: airport + A2A trip premium rates are 0 (no weekend/BH surcharge)");

const engineWeekend = applyTripPremium(
  100,
  { outboundDate: "2026-08-22", outboundTime: "10:00", returnJourney: false },
  AIRPORT_TRIP_PREMIUM_RATE,
);
assert.equal(engineWeekend.premiumApplied, false);
assert.equal(engineWeekend.premiumAmount, 0);
assert.equal(engineWeekend.total, 100);
const engineWeekday = applyTripPremium(
  100,
  { outboundDate: "2026-08-19", outboundTime: "10:00", returnJourney: false },
  AIRPORT_TRIP_PREMIUM_RATE,
);
assert.equal(engineWeekday.premiumApplied, false);
assert.equal(engineWeekday.total, 100);
console.log("OK  Engine: £100 weekday = £100 weekend (no surcharge)");

const weekday = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-08-19",
  outboundTime: "10:00",
});
const saturday = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-08-22",
  outboundTime: "10:00",
});
const sunday = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-08-23",
  outboundTime: "10:00",
});
const bankHoliday = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-05-04",
  outboundTime: "10:00",
});
const noSchedule = calculateQuote(cityHall, "BFS", SALOON, false, {});

assert.ok(weekday && saturday && sunday && bankHoliday && noSchedule);
assert.equal(weekday.premiumApplied, false);
assert.equal(saturday.premiumApplied, false);
assert.equal(sunday.premiumApplied, false);
assert.equal(bankHoliday.premiumApplied, false);
assert.equal(noSchedule.premiumApplied, false);
assert.equal(saturday.amount, weekday.amount);
assert.equal(sunday.amount, weekday.amount);
assert.equal(bankHoliday.amount, weekday.amount);
assert.equal(noSchedule.amount, weekday.amount);
console.log(
  `OK  1–4. BFS City Hall weekday/Sat/Sun/BH/no-date all £${weekday.amount}`,
);

const bfsPlace: SelectedPlace = {
  ...emptySelectedPlace(),
  placeId: "ChIJy4dKsjJVYEgRntaoTC4U5gw",
  formattedAddress: "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK",
  displayAddress: "Belfast International Airport, Aldergrove",
  placeName: "Belfast International Airport",
  lat: 54.6575,
  lng: -6.2158,
  countryCode: "GB",
  postalCode: "BT29 4AB",
};
const cityPlace: SelectedPlace = {
  ...emptySelectedPlace(),
  placeId: "city-hall-test",
  formattedAddress: cityHall,
  displayAddress: cityHall,
  placeName: "Belfast City Hall",
  lat: 54.5964,
  lng: -5.9301,
  countryCode: "GB",
  postalCode: "BT1 5GS",
};

const ownerAirportWeekend = calculateWebsiteOneWayFare({
  pickupAddress: cityHall,
  dropoffAddress: "Belfast International Airport",
  pickupPlace: cityPlace,
  dropoffPlace: bfsPlace,
  vehicleType: SALOON,
  routeMetrics: null,
  schedule: { outboundDate: "2026-08-22", outboundTime: "10:00", returnJourney: false },
});
assert.ok(ownerAirportWeekend);
assert.equal(ownerAirportWeekend!.amount, saturday.amount);
assert.equal(ownerAirportWeekend!.premiumApplied, false);

const ownerAirportWeekday = calculateWebsiteOneWayFare({
  pickupAddress: cityHall,
  dropoffAddress: "Belfast International Airport",
  pickupPlace: cityPlace,
  dropoffPlace: bfsPlace,
  vehicleType: SALOON,
  routeMetrics: null,
  schedule: { outboundDate: "2026-08-19", outboundTime: "10:00", returnJourney: false },
});
assert.ok(ownerAirportWeekday);
assert.equal(ownerAirportWeekday!.amount, weekday.amount);
assert.equal(ownerAirportWeekday!.premiumApplied, false);

const standardWebsiteAmount = ownerAirportWeekend!.amount;
assert.equal(standardWebsiteAmount, saturday.amount);
console.log(
  `OK  5–6. Owner calculator matches public; standardWebsiteAmount £${standardWebsiteAmount}`,
);

const a2aMetrics = { distanceKm: 28, durationMinutes: 40 };
const a2aPickup = "12 Botanic Avenue, Belfast BT7 1JG";
const a2aDropoff = "45 Main Street, Bangor BT20 5AF";
const a2aWeekday = calculatePointToPointQuote(
  a2aPickup,
  a2aDropoff,
  SALOON,
  false,
  { outboundDate: "2026-08-19", outboundTime: "10:00", returnJourney: false },
  a2aMetrics,
);
const a2aWeekend = calculatePointToPointQuote(
  a2aPickup,
  a2aDropoff,
  SALOON,
  false,
  { outboundDate: "2026-08-22", outboundTime: "10:00", returnJourney: false },
  a2aMetrics,
);
assert.ok(a2aWeekday && a2aWeekend);
assert.equal(a2aWeekday.premiumApplied, false);
assert.equal(a2aWeekend.premiumApplied, false);
assert.equal(a2aWeekend.amount, a2aWeekday.amount);
console.log(
  `OK  7. A2A weekday = weekend £${a2aWeekday.amount} (no surcharge)`,
);

assert.equal(getReturnJourneyFare(100), 190);
assert.equal(getWebsiteReturnJourneyFare(100), 190);
assert.equal(
  resolvePersonalQuoteCheckoutAmount({
    agreedAmount: standardWebsiteAmount,
    standardWebsiteAmount,
    returnJourney: true,
  }),
  getWebsiteReturnJourneyFare(standardWebsiteAmount),
);
assert.equal(
  resolvePersonalQuoteCheckoutAmount({
    agreedAmount: standardWebsiteAmount - 10,
    standardWebsiteAmount,
    returnJourney: true,
  }),
  Math.round((standardWebsiteAmount - 10) * 2 * 100) / 100,
);
console.log("OK  8–9. Return discount remains exactly 5%");

const payment = fs.readFileSync(path.join(root, "workers/addresses/src/index.ts"), "utf8");
assert.match(payment, /never use client standardWebsiteAmount for SumUp amount/);
assert.match(payment, /amount = resolved\.amount/);
console.log("OK  10. SumUp remains Worker/KV-authoritative");

const hero = fs.readFileSync(path.join(root, "src/components/HeroSlideshow.tsx"), "utf8");
assert.match(hero, /Save 5% when you book a return/);
assert.match(hero, /Secure online booking/);
console.log("OK  Homepage benefits include return saving");

console.log("\nAll airport weekend premium (disabled) checks passed.");
