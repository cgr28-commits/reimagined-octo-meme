/**
 * Airport weekend / Bank Holiday trip premium (airportTripPremiumRate).
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

assert.equal(PRICING_CONFIG.airportTripPremiumRate, 0.05);
assert.equal(AIRPORT_TRIP_PREMIUM_RATE, 0.05);
assert.equal(PRICING_CONFIG.addressToAddressTripPremiumRate, 0.05);
console.log("OK  Config: airport + A2A trip premium rates are 5%");

// Engine-level: £100 one-way → £105 before website roundFare.
const enginePremium = applyTripPremium(
  100,
  { outboundDate: "2026-08-22", outboundTime: "10:00", returnJourney: false },
  AIRPORT_TRIP_PREMIUM_RATE,
);
assert.equal(enginePremium.premiumApplied, true);
assert.equal(enginePremium.premiumAmount, 5);
assert.equal(enginePremium.total, 105);
const engineWeekday = applyTripPremium(
  100,
  { outboundDate: "2026-08-19", outboundTime: "10:00", returnJourney: false },
  AIRPORT_TRIP_PREMIUM_RATE,
);
assert.equal(engineWeekday.premiumApplied, false);
assert.equal(engineWeekday.total, 100);
console.log("OK  Engine: £100 weekday → £100; Sat → £105 (before roundFare)");

const weekday = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-08-19", // Wednesday
  outboundTime: "10:00",
});
const saturday = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-08-22", // Saturday
  outboundTime: "10:00",
});
const sunday = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-08-23", // Sunday
  outboundTime: "10:00",
});
const bankHoliday = calculateQuote(cityHall, "BFS", SALOON, false, {
  outboundDate: "2026-05-04", // NI May Day
  outboundTime: "10:00",
});

assert.ok(weekday && saturday && sunday && bankHoliday);
assert.equal(weekday.premiumApplied, false, "1. Airport weekday — no premium");
assert.equal(saturday.premiumApplied, true, "2. Airport Saturday — premium");
assert.equal(sunday.premiumApplied, true, "3. Airport Sunday — premium");
assert.equal(bankHoliday.premiumApplied, true, "4. Airport Bank Holiday — premium");
assert.ok(saturday.amount > weekday.amount);
assert.ok(sunday.amount > weekday.amount);
assert.ok(bankHoliday.amount > weekday.amount);
assert.equal(saturday.amount, sunday.amount);
assert.equal(saturday.amount, bankHoliday.amount);
console.log(
  `OK  1–4. BFS City Hall weekday £${weekday.amount}; Sat/Sun/BH £${saturday.amount}`,
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
assert.equal(ownerAirportWeekend!.premiumApplied, true);

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

// 7. A2A 5% premium still works.
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
assert.notEqual(a2aWeekend.amount, a2aWeekday.amount);
console.log(
  `OK  7. A2A premium still works (weekday £${a2aWeekday.amount} → Sat £${a2aWeekend.amount})`,
);

// 8–9. Personal Quote return rules + public return discount unchanged.
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
console.log("OK  8–9. PQ return rules + public return discount unchanged");

// 10. SumUp remains server-authoritative.
const payment = fs.readFileSync(path.join(root, "workers/addresses/src/index.ts"), "utf8");
assert.match(payment, /never use client standardWebsiteAmount for SumUp amount/);
assert.match(payment, /amount = resolved\.amount/);
console.log("OK  10. SumUp remains Worker/KV-authoritative");

const websiteFareSrc = fs.readFileSync(path.join(root, "src/lib/website-fare.ts"), "utf8");
assert.doesNotMatch(websiteFareSrc, /0\.05/);
const panel = fs.readFileSync(
  path.join(root, "src/components/OwnerPersonalQuotesPanel.tsx"),
  "utf8",
);
assert.doesNotMatch(panel, /airportTripPremiumRate|0\.05/);
console.log("OK  No hard-coded airport premium rate in Owner / website-fare UI path");

console.log("\nAll airport weekend premium checks passed.");
