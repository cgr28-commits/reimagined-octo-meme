/**
 * Dublin Airport vs Dublin city + BFS→Enniskillen corridor regressions.
 * Run: npx tsx scripts/check-dublin-enniskillen-corridors.ts
 */

import assert from "node:assert/strict";
import { PRICING_CONFIG } from "../src/lib/pricing-config";
import {
  calculateDublinCityBeyondAirportQuote,
  calculateQuote,
} from "../src/lib/quote";
import {
  detectAirportCodeFromPlace,
  isDublinCityCorridorJourney,
  isDublinCityNotAirportPlace,
  isRepublicOfIrelandJourney,
  isWithinDublinAirportGeofence,
  needsManualQuoteApproval,
  selectedPlaceFromParts,
  type SelectedPlace,
} from "../src/lib/selected-place";

const SALOON = "Standard Saloon (1–4 passengers)" as const;
const ESTATE = "Estate Car (1–4 passengers)" as const;
const hall = "Belfast City Hall, Belfast BT1 5GS";
const enni = "South West Acute Hospital, Enniskillen BT74 6DN";

function place(partial: Partial<SelectedPlace> & { formattedAddress: string; placeId: string }): SelectedPlace {
  return selectedPlaceFromParts({
    placeId: partial.placeId,
    formattedAddress: partial.formattedAddress,
    displayAddress: partial.displayAddress ?? partial.formattedAddress,
    placeName: partial.placeName ?? null,
    lat: partial.lat ?? null,
    lng: partial.lng ?? null,
    countryCode: partial.countryCode ?? null,
    postalCode: partial.postalCode ?? null,
  });
}

const belfastHome = place({
  placeId: "belfast-city-hall",
  formattedAddress: "Belfast City Hall, Belfast BT1 5GS, UK",
  placeName: "Belfast City Hall",
  lat: 54.5967,
  lng: -5.9301,
  countryCode: "GB",
  postalCode: "BT1 5GS",
});

const dubAirport = place({
  placeId: "ChIJUU1_1pJZZ0gR3vQvL7Gqj0U",
  formattedAddress: "Dublin Airport, Co. Dublin, Ireland",
  placeName: "Dublin Airport",
  lat: 53.4264,
  lng: -6.2499,
  countryCode: "IE",
});

const dublinCity = place({
  placeId: "dublin-oconnell",
  formattedAddress: "O'Connell Street Upper, Dublin, Ireland",
  placeName: "O'Connell Street",
  lat: 53.3498,
  lng: -6.2603,
  countryCode: "IE",
});

const dublinHotel = place({
  placeId: "dublin-shelbourne",
  formattedAddress: "27 St Stephen's Green, Dublin, Ireland",
  placeName: "The Shelbourne Hotel",
  lat: 53.3389,
  lng: -6.2567,
  countryCode: "IE",
});

const dublinPort = place({
  placeId: "dublin-port",
  formattedAddress: "Dublin Port, Dublin, Ireland",
  placeName: "Dublin Port",
  lat: 53.3494,
  lng: -6.2097,
  countryCode: "IE",
});

console.log("=== Dublin Airport detection (must not match Dublin city) ===");
assert.equal(detectAirportCodeFromPlace(dubAirport), "DUB");
assert.equal(isWithinDublinAirportGeofence(dubAirport), true);
assert.equal(detectAirportCodeFromPlace(dublinCity), null);
assert.equal(detectAirportCodeFromPlace(dublinHotel), null);
assert.equal(detectAirportCodeFromPlace(dublinPort), null);
assert.equal(isDublinCityNotAirportPlace(dublinCity), true);
assert.equal(isDublinCityNotAirportPlace(dublinHotel), true);
assert.equal(isDublinCityNotAirportPlace(dubAirport), false);
assert.equal(isDublinCityCorridorJourney(belfastHome, dublinCity), true);
assert.equal(isDublinCityCorridorJourney(belfastHome, dubAirport), false);
assert.equal(needsManualQuoteApproval(belfastHome, dubAirport), false);
assert.equal(needsManualQuoteApproval(belfastHome, dublinCity), true);
assert.equal(isRepublicOfIrelandJourney(belfastHome, dublinCity), true);
console.log("OK  DUB place ID / geofence / city exclusion");

console.log("\n=== Belfast City Centre ↔ Dublin Airport ===");
const toDubS = calculateQuote(hall, "DUB", SALOON, false, {}, null, false);
const toDubE = calculateQuote(hall, "DUB", ESTATE, false, {}, null, false);
assert.equal(toDubS?.amount, 234);
assert.equal(toDubE?.amount, 240);
console.log(`OK  City Hall → DUB  S £${toDubS?.amount} / E £${toDubE?.amount}`);

const fromDubS = calculateQuote(hall, "DUB", SALOON, false, {}, null, true);
const fromDubE = calculateQuote(hall, "DUB", ESTATE, false, {}, null, true);
assert.equal(fromDubS?.amount, 239);
assert.equal(fromDubE?.amount, 245);
console.log(`OK  DUB → City Hall  S £${fromDubS?.amount} / E £${fromDubE?.amount}`);

console.log("\n=== Belfast City Centre → Dublin City Centre (must exceed DUB) ===");
const cityMetrics = { distanceKm: 168.6, durationMinutes: 119.5 };
const cityS = calculateDublinCityBeyondAirportQuote(hall, SALOON, cityMetrics);
const cityE = calculateDublinCityBeyondAirportQuote(hall, ESTATE, cityMetrics);
assert.ok(cityS && cityE);
assert.ok(
  cityS.amount > 234,
  `Dublin city saloon £${cityS.amount} must be > DUB drop-off £234`,
);
assert.ok(
  cityE.amount > 240,
  `Dublin city estate £${cityE.amount} must be > DUB drop-off £240`,
);
console.log(
  `OK  City Hall → Dublin city centre  S £${cityS.amount} / E £${cityE.amount} (DUB drop-off £234/£240)`,
);

const hotelMetrics = { distanceKm: 170, durationMinutes: 122 };
const hotelS = calculateDublinCityBeyondAirportQuote(hall, SALOON, hotelMetrics);
assert.ok(hotelS && hotelS.amount > 234);
assert.notEqual(hotelS.amount, 234, "Dublin hotel must not receive flat DUB airport fare");
console.log(`OK  City Hall → Dublin hotel  S £${hotelS.amount} (not flat DUB airport)`);

console.log("\n=== BFS → Enniskillen (near OTS, not deep undercut) ===");
const bfsEnniS = calculateQuote(enni, "BFS", SALOON);
const bfsEnniE = calculateQuote(enni, "BFS", ESTATE);
assert.ok(bfsEnniS && bfsEnniE);
assert.ok(bfsEnniS.amount >= 140 && bfsEnniS.amount <= 150, `saloon £${bfsEnniS.amount}`);
assert.ok(bfsEnniE.amount >= 164 && bfsEnniE.amount <= 174, `estate £${bfsEnniE.amount}`);
console.log(
  `OK  BFS → Enniskillen/SWAH  S £${bfsEnniS.amount} / E £${bfsEnniE.amount}`,
);
console.log(
  `    surcharge £${bfsEnniS.areaSurcharge}, long-haul estate premium £${PRICING_CONFIG.airportEstatePremiumTiers?.longPremiumGbp}`,
);

console.log("\nAll Dublin / Enniskillen corridor checks passed.");
console.log(
  `\nREPORT — Belfast City Centre → Dublin City Centre test fare: Saloon £${cityS.amount}, Estate £${cityE.amount}`,
);
