/**
 * Return Journey Offer — locked airport + hidden same-order return toggle.
 * Run: npm run check:return-offer-journey-ux
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildReturnOfferConfirmedPlaces,
  buildReturnOfferPublicSnapshot,
  returnOfferPlaceFromServedAirport,
  returnOfferPlacesReadyForQuote,
  type ReturnOfferPlaceSnapshot,
} from "../shared/return-offer";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { customerAirportTitle, isCustomerAirportCode } from "../src/lib/quote-journey-intent";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

const localPlace: ReturnOfferPlaceSnapshot = {
  placeId: "ChIJ-newtownabbey-return",
  formattedAddress: "12 Ballyduff Road, Newtownabbey BT36 6QD, UK",
  displayAddress: "12 Ballyduff Road, Newtownabbey BT36 6QD, UK",
  placeName: null,
  lat: 54.6872,
  lng: -5.9521,
  postalCode: "BT36 6QD",
  countryCode: "GB",
};

function snapshotFor(airportCode: "BFS" | "BHD" | "DUB") {
  const airport = returnOfferPlaceFromServedAirport(airportCode);
  assert.ok(airport);
  return buildReturnOfferPublicSnapshot({
    direction: "local_to_airport",
    airportCode,
    airportName: customerAirportTitle(airportCode),
    reversedPickupLabel: airport.formattedAddress,
    reversedDropoffLabel: localPlace.formattedAddress,
    reversedPickupPlace: airport,
    reversedDropoffPlace: localPlace,
  });
}

check("1. BFS Return Offer always displays/selects BFS, never stale Dublin", () => {
  const snapshot = snapshotFor("BFS");
  assert.equal(snapshot.airportCode, "BFS");
  assert.equal(snapshot.pickupPlace?.placeId, returnOfferPlaceFromServedAirport("BFS")?.placeId);
  assert.notEqual(snapshot.airportCode, "DUB");
  assert.equal(customerAirportTitle("BFS"), "Belfast International Airport");
  assert.notEqual(customerAirportTitle("BFS"), customerAirportTitle("DUB"));
});

check("2. BHD Return Offer displays/selects BHD", () => {
  const snapshot = snapshotFor("BHD");
  assert.equal(snapshot.airportCode, "BHD");
  assert.equal(snapshot.pickupPlace?.placeId, returnOfferPlaceFromServedAirport("BHD")?.placeId);
  assert.equal(customerAirportTitle("BHD"), "Belfast City Airport");
});

check("3. DUB Return Offer displays/selects DUB", () => {
  const snapshot = snapshotFor("DUB");
  assert.equal(snapshot.airportCode, "DUB");
  assert.equal(snapshot.pickupPlace?.placeId, returnOfferPlaceFromServedAirport("DUB")?.placeId);
  assert.equal(customerAirportTitle("DUB"), "Dublin Airport");
});

check("4. Return Offer airport cannot be accidentally changed if locked", () => {
  const card = read("src/components/QuoteCard.tsx");
  const progressive = read("src/components/QuoteProgressiveRoute.tsx");
  const client = read("src/app/book/ReturnOfferBookClient.tsx");
  assert.match(client, /initialAirportCode=\{quote\.airportCode\}/);
  assert.match(card, /if \(returnOfferToken\) \{\s*return;\s*\}/);
  assert.match(card, /lockReturnOfferJourney=\{Boolean\(returnOfferToken\)\}/);
  assert.match(card, /if \(!returnOfferToken\) \{\s*if \(draft\.journeyIntent\)/);
  assert.match(card, /if \(!returnOfferToken\) \{\s*const draftPrefill/);
  assert.match(progressive, /lockReturnOfferJourney/);
  assert.match(progressive, /data-return-offer-airport=\{selectedAirportCode\}/);
  assert.doesNotMatch(
    progressive.slice(progressive.indexOf("lockReturnOfferJourney ?"), progressive.indexOf("Which airport?")),
    /onAirportSelect/,
  );
});

check("5. Normal booking flow still allows normal airport selection", () => {
  const progressive = read("src/components/QuoteProgressiveRoute.tsx");
  assert.match(progressive, /Which airport\?/);
  assert.match(progressive, /onAirportSelect\(airport\.code\)/);
  assert.match(progressive, /aria-label="Airport"/);
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /function applyIntentAirport/);
  assert.match(card, /selectedAirportCode=\{intentAirportCode\}/);
});

check("6. Valid Return Offer hides the One way / Return toggle", () => {
  const card = read("src/components/QuoteCard.tsx");
  const progressive = read("src/components/QuoteProgressiveRoute.tsx");
  assert.match(card, /showJourneyModeFields=\{\s*returnOfferToken\s*\?\s*false/);
  assert.match(progressive, /showJourneyModeFields && !lockReturnOfferJourney/);
  assert.match(card, /returnOfferToken \? "one-way" : null/);
  assert.match(card, /hasQuoteRoute && !returnOfferToken/);
});

check("7. Ordinary booking still shows the One way / Return toggle", () => {
  const progressive = read("src/components/QuoteProgressiveRoute.tsx");
  assert.match(progressive, /One way/);
  assert.match(progressive, /Return · 5% off/);
  assert.match(progressive, /lockReturnOfferJourney = false/);
});

check("8. Return Offer clearly shows that 5% is already applied", () => {
  const card = read("src/components/QuoteCard.tsx");
  const book = read("src/app/book/page.tsx");
  assert.match(card, /Your 5% Return Journey Offer/);
  assert.match(card, /Your 5% saving has been applied automatically/);
  assert.match(card, /no extra\s+discount option to choose/);
  assert.match(book, /Your 5% Return Journey Offer/);
  assert.match(book, /Your 5% saving has been applied automatically/);
});

check("9. Quote route, visible route and payment payload all use the same airport", () => {
  const client = read("src/app/book/ReturnOfferBookClient.tsx");
  const card = read("src/components/QuoteCard.tsx");
  assert.match(client, /initialAirportCode=\{quote\.airportCode\}/);
  assert.match(client, /initialPickupPlace=\{confirmedPickup\}/);
  assert.match(client, /initialDropoffPlace=\{confirmedDropoff\}/);
  assert.match(card, /airportCode: effectiveAirportCode/);
  assert.match(card, /selectedAirportCode=\{intentAirportCode\}/);
  assert.equal(isCustomerAirportCode("BFS"), true);
  const bfs = snapshotFor("BFS");
  assert.equal(bfs.pickupPlace?.placeId, returnOfferPlaceFromServedAirport("BFS")?.placeId);
});

check("10. Existing address-confirmation wiring remains in place", () => {
  const client = read("src/app/book/ReturnOfferBookClient.tsx");
  const card = read("src/components/QuoteCard.tsx");
  assert.match(client, /selectedPlaceFromReturnOffer/);
  assert.match(card, /confirmedInitialPickup/);
  assert.match(card, /setPickupPlace\(emptySelectedPlace\(\)\)/);
  assert.match(card, /setDropoffPlace\(emptySelectedPlace\(\)\)/);
});

check("11. Existing 5% fare calculation remains unchanged", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 62,
    airportFixedCostsGbp: 9,
    airportAccessChargeGbp: 5,
    returnOfferDiscountRate: 0.05,
  });
  assert.equal(breakdown.returnOfferSavingGbp, 3.1);
  assert.equal(breakdown.journeyFareBeforePromotionsGbp, 62);
  assert.equal(breakdown.finalAmountPayableGbp, 72.9);
});

check("12. Airport/Express charges remain undiscounted", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 40,
    airportFixedCostsGbp: 8,
    airportAccessChargeGbp: 5,
    returnOfferDiscountRate: 0.05,
  });
  assert.equal(breakdown.returnOfferSavingGbp, 2);
  assert.equal(breakdown.airportFixedCostsGbp, 8);
  assert.equal(breakdown.airportAccessChargeGbp, 5);
  assert.equal(breakdown.finalAmountPayableGbp, 51);
});

check("13. Both reversed journey directions still work", () => {
  const homeToAirport = buildReturnOfferConfirmedPlaces({
    direction: "local_to_airport",
    airportCode: "BFS",
    localPlace,
  });
  assert.equal(homeToAirport.pickupPlace?.placeId, returnOfferPlaceFromServedAirport("BFS")?.placeId);
  assert.equal(homeToAirport.dropoffPlace?.placeId, localPlace.placeId);
  assert.equal(returnOfferPlacesReadyForQuote(homeToAirport), true);

  const airportToHome = buildReturnOfferConfirmedPlaces({
    direction: "airport_to_local",
    airportCode: "BHD",
    localPlace,
  });
  assert.equal(airportToHome.pickupPlace?.placeId, localPlace.placeId);
  assert.equal(airportToHome.dropoffPlace?.placeId, returnOfferPlaceFromServedAirport("BHD")?.placeId);
  assert.equal(returnOfferPlacesReadyForQuote(airportToHome), true);
});

console.log("\nReturn offer journey UX checks passed.");
