/**
 * Night & Weekend Surcharge (10%) — public / personal / quick-quote parity.
 * Return discount remains exactly 5%. SumUp stays Worker-authoritative.
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
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";

const SALOON = SALOON_VEHICLE;
const cityHall = "Belfast City Hall, Belfast BT1 5GS";
const cityBfsMetrics = { distanceKm: 14 / 0.621371, durationMinutes: 25 };
const root = path.resolve(import.meta.dirname, "..");

assert.equal(PRICING_CONFIG.airportTripPremiumRate, 0.1);
assert.equal(AIRPORT_TRIP_PREMIUM_RATE, 0.1);
assert.equal(PRICING_CONFIG.addressToAddressTripPremiumRate, 0.1);
assert.equal(PRICING_CONFIG.operational.weekendAndBankHoliday.premiumRate ?? 0, 0);
console.log("OK  Config: airport + A2A Night & Weekend Surcharge 10%");

const engineWeekend = applyTripPremium(
  100,
  { outboundDate: "2026-08-22", outboundTime: "10:00", returnJourney: false },
  AIRPORT_TRIP_PREMIUM_RATE,
);
assert.equal(engineWeekend.premiumApplied, true);
assert.equal(engineWeekend.premiumAmount, 10);
assert.equal(engineWeekend.total, 110);
const engineWeekday = applyTripPremium(
  100,
  { outboundDate: "2026-08-19", outboundTime: "10:00", returnJourney: false },
  AIRPORT_TRIP_PREMIUM_RATE,
);
assert.equal(engineWeekday.premiumApplied, false);
assert.equal(engineWeekday.total, 100);
console.log("OK  Engine: £100 weekday = £100; Saturday = £110");

const weekday = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-08-19",
  outboundTime: "10:00",
}, cityBfsMetrics);
const saturday = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-08-22",
  outboundTime: "10:00",
}, cityBfsMetrics);
const sunday = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-08-23",
  outboundTime: "10:00",
}, cityBfsMetrics);
const bankHoliday = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-05-04",
  outboundTime: "10:00",
}, cityBfsMetrics);
const noSchedule = calculateQuote(cityHall, "BFS", SALOON, false, {}, cityBfsMetrics);

assert.ok(weekday && saturday && sunday && bankHoliday && noSchedule);
assert.equal(weekday.premiumApplied, false);
assert.equal(saturday.premiumApplied, true);
assert.equal(sunday.premiumApplied, true);
assert.equal(bankHoliday.premiumApplied, false);
assert.equal(noSchedule.premiumApplied, false);
assert.equal(weekday.amount, 44);
assert.equal(saturday.amount, 48.4);
assert.equal(sunday.amount, 48.4);
assert.equal(bankHoliday.amount, weekday.amount);
assert.equal(noSchedule.amount, weekday.amount);
console.log(
  `OK  1–4. BFS City Hall weekday £${weekday.amount}; Sat/Sun £${saturday.amount}; BH daytime £${bankHoliday.amount}`,
);

const fridayAfternoon = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-08-21",
  outboundTime: "14:00",
}, cityBfsMetrics);
const saturdayAfternoon = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-08-22",
  outboundTime: "15:00",
}, cityBfsMetrics);
assert.ok(fridayAfternoon && saturdayAfternoon);
assert.equal(fridayAfternoon.premiumApplied, false);
assert.equal(saturdayAfternoon.premiumApplied, true);
assert.equal(saturdayAfternoon.amount, 48.4);
assert.equal(fridayAfternoon.amount, 44);
console.log(
  `OK  Public Live Quote: Friday 14:00 £${fridayAfternoon.amount}; Saturday 15:00 £${saturdayAfternoon.amount}`,
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
  routeMetrics: cityBfsMetrics,
  schedule: { outboundDate: "2026-08-22", outboundTime: "10:00", returnJourney: false },
});
assert.ok(ownerAirportWeekend);
assert.equal(ownerAirportWeekend!.amount, saturday.amount);
assert.equal(ownerAirportWeekend!.premiumApplied, true);

const ownerAirportWeekday = calculateWebsiteOneWayFare({
  pickupAddress: cityHall,
  dropoffAddress: "Belfast International Airport",
  pickupPlace: cityPlace,
  dropoffPlace: bfsPlace,
  vehicleType: SALOON,
  routeMetrics: cityBfsMetrics,
  schedule: { outboundDate: "2026-08-19", outboundTime: "10:00", returnJourney: false },
});
assert.ok(ownerAirportWeekday);
assert.equal(ownerAirportWeekday!.amount, weekday.amount);
assert.equal(ownerAirportWeekday!.premiumApplied, false);

const personalFriday = calculateWebsiteOneWayFare({
  pickupAddress: cityHall,
  dropoffAddress: "Belfast International Airport",
  pickupPlace: cityPlace,
  dropoffPlace: bfsPlace,
  vehicleType: SALOON,
  routeMetrics: cityBfsMetrics,
  schedule: { outboundDate: "2026-08-21", outboundTime: "14:00", returnJourney: false },
});
const personalSaturday = calculateWebsiteOneWayFare({
  pickupAddress: cityHall,
  dropoffAddress: "Belfast International Airport",
  pickupPlace: cityPlace,
  dropoffPlace: bfsPlace,
  vehicleType: SALOON,
  routeMetrics: cityBfsMetrics,
  schedule: { outboundDate: "2026-08-22", outboundTime: "15:00", returnJourney: false },
});
assert.ok(personalFriday && personalSaturday);
assert.equal(personalFriday!.premiumApplied, false);
assert.equal(personalSaturday!.premiumApplied, true);
assert.equal(personalSaturday!.amount, saturdayAfternoon.amount);
assert.equal(personalFriday!.amount, fridayAfternoon.amount);
console.log(
  `OK  Personal Quote (website-fare): Friday 14:00 £${personalFriday!.amount}; Saturday 15:00 £${personalSaturday!.amount}`,
);

const quickQuoteFriday = calculateAuthoritativeWebsiteQuote({
  airportCode: "BFS",
  fromAirport: false,
  pickupAddress: cityHall,
  dropoffAddress: "Belfast International Airport",
  returnJourney: false,
  outboundDate: "2026-08-21",
  outboundTime: "14:00",
  passengers: 2,
  suitcases: 1,
  routeMetrics: cityBfsMetrics,
});
const quickQuoteSaturday = calculateAuthoritativeWebsiteQuote({
  airportCode: "BFS",
  fromAirport: false,
  pickupAddress: cityHall,
  dropoffAddress: "Belfast International Airport",
  returnJourney: false,
  outboundDate: "2026-08-22",
  outboundTime: "15:00",
  passengers: 2,
  suitcases: 1,
  routeMetrics: cityBfsMetrics,
});
assert.equal(quickQuoteFriday.ok, true);
assert.equal(quickQuoteSaturday.ok, true);
if (quickQuoteFriday.ok && quickQuoteSaturday.ok) {
  assert.equal(quickQuoteFriday.premiumApplied, false);
  assert.equal(quickQuoteSaturday.premiumApplied, true);
  assert.equal(quickQuoteSaturday.amount, saturdayAfternoon.amount);
  assert.equal(quickQuoteFriday.amount, fridayAfternoon.amount);
  console.log(
    `OK  Driver Quick Quote (quote-service): Friday 14:00 £${quickQuoteFriday.amount}; Saturday 15:00 £${quickQuoteSaturday.amount}`,
  );
}

const standardWebsiteAmount = ownerAirportWeekend!.amount;
assert.equal(standardWebsiteAmount, saturday.amount);
console.log(
  `OK  5–6. Owner calculator matches public; Saturday standardWebsiteAmount £${standardWebsiteAmount}`,
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
assert.equal(a2aWeekend.premiumApplied, true);
assert.equal(
  a2aWeekend.amount,
  Math.round(a2aWeekday.amount * 1.1 * 100) / 100,
);
console.log(
  `OK  7. A2A weekday £${a2aWeekday.amount}; weekend £${a2aWeekend.amount} (+10%)`,
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
assert.match(hero, /5% off when you book a return/);
assert.match(hero, /Secure card booking where eligible/);
console.log("OK  Homepage benefits include return saving");

console.log("\nAll airport Night & Weekend Surcharge parity checks passed.");
