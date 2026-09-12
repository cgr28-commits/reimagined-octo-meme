/**
 * Dublin Airport vs Dublin city + BFS→Enniskillen corridor regressions.
 * Run: npx tsx scripts/check-dublin-enniskillen-corridors.ts
 */

import assert from "node:assert/strict";
import {
  calculateUniversalEstateJourneyFareGbp,
  calculateUniversalSaloonJourneyFareGbp,
  universalDrivingMilesFromKm,
} from "../shared/universal-distance-pricing";
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

/** Approved City Hall → DUB calibration knot (~98 road miles). */
const CITY_DUB_METRICS = { distanceKm: 98 / 0.621371, durationMinutes: 115 };
/** Representative Enniskillen / SWAH → BFS driving distance (~81 road miles). */
const ENNI_BFS_MILES = 81;
const ENNI_BFS_METRICS = {
  distanceKm: ENNI_BFS_MILES / 0.621371,
  durationMinutes: 98,
};
const DUB_DROP_FIXED = 4;
const DUB_PICK_FIXED = 9;

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
assert.equal(calculateQuote(hall, "DUB", SALOON, false, {}, null, false), null);

const expectedDubJourney = calculateUniversalSaloonJourneyFareGbp(98);
assert.equal(expectedDubJourney, 229);
const expectedDubDropS = expectedDubJourney + DUB_DROP_FIXED;
const expectedDubDropE = calculateUniversalEstateJourneyFareGbp(expectedDubJourney) + DUB_DROP_FIXED;
const expectedDubPickS = expectedDubJourney + DUB_PICK_FIXED;
const expectedDubPickE = calculateUniversalEstateJourneyFareGbp(expectedDubJourney) + DUB_PICK_FIXED;

const toDubS = calculateQuote(hall, "DUB", SALOON, false, {}, CITY_DUB_METRICS, false);
const toDubE = calculateQuote(hall, "DUB", ESTATE, false, {}, CITY_DUB_METRICS, false);
assert.ok(toDubS && toDubE);
assert.equal(toDubS.journeyFareGbp, expectedDubJourney);
assert.equal(toDubS.airportFixedCostsGbp, DUB_DROP_FIXED);
assert.equal(toDubS.amount, expectedDubDropS);
assert.equal(toDubE.amount, expectedDubDropE);
assert.equal(toDubE.amount - toDubS.amount, 6);
console.log(`OK  City Hall → DUB  S £${toDubS.amount} / E £${toDubE.amount}`);

const fromDubS = calculateQuote(hall, "DUB", SALOON, false, {}, CITY_DUB_METRICS, true);
const fromDubE = calculateQuote(hall, "DUB", ESTATE, false, {}, CITY_DUB_METRICS, true);
assert.ok(fromDubS && fromDubE);
assert.equal(fromDubS.journeyFareGbp, expectedDubJourney);
assert.equal(fromDubS.airportFixedCostsGbp, DUB_PICK_FIXED);
assert.equal(fromDubS.amount, expectedDubPickS);
assert.equal(fromDubE.amount, expectedDubPickE);
assert.equal(fromDubE.amount - fromDubS.amount, 6);
console.log(`OK  DUB → City Hall  S £${fromDubS.amount} / E £${fromDubE.amount}`);

console.log("\n=== Belfast City Centre → Dublin City Centre (must exceed DUB) ===");
const cityMetrics = { distanceKm: 168.6, durationMinutes: 119.5 };
const cityMiles = universalDrivingMilesFromKm(cityMetrics.distanceKm);
const cityJourneyFloor = calculateUniversalSaloonJourneyFareGbp(cityMiles);
const cityS = calculateDublinCityBeyondAirportQuote(hall, SALOON, cityMetrics);
const cityE = calculateDublinCityBeyondAirportQuote(hall, ESTATE, cityMetrics);
assert.ok(cityS && cityE);
assert.ok(cityS.amount >= cityJourneyFloor);
assert.ok(
  cityS.amount > toDubS.amount,
  `Dublin city saloon £${cityS.amount} must be > DUB drop-off £${toDubS.amount}`,
);
assert.ok(
  cityE.amount > toDubE.amount,
  `Dublin city estate £${cityE.amount} must be > DUB drop-off £${toDubE.amount}`,
);
assert.equal(cityE.amount - cityS.amount, 6);
console.log(
  `OK  City Hall → Dublin city centre  S £${cityS.amount} / E £${cityE.amount} (DUB drop-off £${toDubS.amount}/£${toDubE.amount})`,
);

const hotelMetrics = { distanceKm: 170, durationMinutes: 122 };
const hotelS = calculateDublinCityBeyondAirportQuote(hall, SALOON, hotelMetrics);
assert.ok(hotelS && hotelS.amount > toDubS.amount);
assert.notEqual(hotelS.amount, toDubS.amount, "Dublin hotel must not receive the DUB airport fare");
console.log(`OK  City Hall → Dublin hotel  S £${hotelS.amount} (not DUB airport fare)`);

console.log("\n=== BFS → Enniskillen (universal distance, Estate = Saloon + £6) ===");
assert.equal(calculateQuote(enni, "BFS", SALOON), null);
const expectedEnniS = calculateUniversalSaloonJourneyFareGbp(ENNI_BFS_MILES);
const expectedEnniE = calculateUniversalEstateJourneyFareGbp(expectedEnniS);
const bfsEnniS = calculateQuote(enni, "BFS", SALOON, false, {}, ENNI_BFS_METRICS);
const bfsEnniE = calculateQuote(enni, "BFS", ESTATE, false, {}, ENNI_BFS_METRICS);
assert.ok(bfsEnniS && bfsEnniE);
assert.equal(bfsEnniS.amount, expectedEnniS);
assert.equal(bfsEnniE.amount, expectedEnniE);
assert.equal(bfsEnniE.amount - bfsEnniS.amount, 6);
console.log(
  `OK  BFS → Enniskillen/SWAH  S £${bfsEnniS.amount} / E £${bfsEnniE.amount} (universal ${ENNI_BFS_MILES} mi)`,
);

console.log("\nAll Dublin / Enniskillen corridor checks passed.");
console.log(
  `\nREPORT — Belfast City Centre → Dublin City Centre test fare: Saloon £${cityS.amount}, Estate £${cityE.amount}`,
);
