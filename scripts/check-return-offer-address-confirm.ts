/**
 * Return Journey Offer — confirmed address hydration after a valid token.
 * Run: npm run check:return-offer-address
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildReturnOfferConfirmedPlaces,
  buildReturnOfferPublicSnapshot,
  isConfirmedReturnOfferPlace,
  normalizeReturnOfferPlace,
  returnOfferPlaceFromServedAirport,
  returnOfferPlacesReadyForQuote,
  type ReturnOfferPlaceSnapshot,
} from "../shared/return-offer";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import {
  isPlaceSelected,
  isQuoteReadyPlace,
  selectedPlaceFromReturnOffer,
} from "../src/lib/selected-place";

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
  streetNumber: "12",
  route: "Ballyduff Road",
  locality: "Newtownabbey",
};

const textOnly = normalizeReturnOfferPlace({
  placeId: "",
  formattedAddress: "12 Ballyduff Road, Newtownabbey",
  lat: 54.6872,
  lng: -5.9521,
});

check("1. Valid Return Offer opens with both required addresses already confirmed", () => {
  const outboundHomeToAirport = buildReturnOfferPublicSnapshot({
    direction: "local_to_airport",
    airportCode: "BFS",
    airportName: "Belfast International Airport",
    reversedPickupLabel: "Belfast International Airport",
    reversedDropoffLabel: localPlace.formattedAddress,
    reversedDropoffPlace: localPlace,
  });
  assert.equal(isConfirmedReturnOfferPlace(outboundHomeToAirport.pickupPlace), true);
  assert.equal(isConfirmedReturnOfferPlace(outboundHomeToAirport.dropoffPlace), true);
  assert.equal(returnOfferPlacesReadyForQuote(outboundHomeToAirport), true);
  assert.ok(isQuoteReadyPlace(selectedPlaceFromReturnOffer(outboundHomeToAirport.pickupPlace)));
  assert.ok(isQuoteReadyPlace(selectedPlaceFromReturnOffer(outboundHomeToAirport.dropoffPlace)));

  const labelsOnly = buildReturnOfferPublicSnapshot({
    direction: "local_to_airport",
    airportCode: "BFS",
    airportName: "Belfast International Airport",
    reversedPickupLabel: "Belfast International Airport",
    reversedDropoffLabel: "12 Ballyduff Road, Newtownabbey",
  });
  assert.equal(isConfirmedReturnOfferPlace(labelsOnly.pickupPlace), true);
  assert.equal(
    isConfirmedReturnOfferPlace(labelsOnly.dropoffPlace),
    false,
    "labels alone must not confirm the local address",
  );
  assert.equal(textOnly, undefined);
});

check("2. Customer can continue without re-selecting the pre-filled address", () => {
  const client = read("src/app/book/ReturnOfferBookClient.tsx");
  const card = read("src/components/QuoteCard.tsx");
  assert.match(client, /selectedPlaceFromReturnOffer\(quote\.pickupPlace\)/);
  assert.match(client, /selectedPlaceFromReturnOffer\(quote\.dropoffPlace\)/);
  assert.match(client, /initialPickupPlace=\{confirmedPickup\}/);
  assert.match(client, /initialDropoffPlace=\{confirmedDropoff\}/);
  assert.match(card, /confirmedInitialPickup/);
  assert.match(card, /confirmedInitialDropoff/);
  assert.match(card, /isQuoteReadyPlace\(initialPickupPlace\)/);
  assert.match(card, /isQuoteReadyPlace\(initialDropoffPlace\)/);
  assert.match(
    card,
    /confirmedInitialPickup\s*\n\s*\? confirmedInitialPickup/,
  );
  assert.match(
    card,
    /showJourneyModeFields=\{[\s\S]*isPlaceSelected\(pickupPlace\)[\s\S]*isPlaceSelected\(dropoffPlace\)/,
  );
});

check("3. Editing a pre-filled address clears its confirmed state", () => {
  const card = read("src/components/QuoteCard.tsx");
  const pickupChange = card.slice(
    card.indexOf("function handlePickupChange"),
    card.indexOf("function handleDropoffChange"),
  );
  const dropoffChange = card.slice(
    card.indexOf("function handleDropoffChange"),
    card.indexOf("function handlePickupPlaceSelect"),
  );
  assert.match(pickupChange, /setPickupPlace\(emptySelectedPlace\(\)\)/);
  assert.match(pickupChange, /clearConfirmedPickupPlace\(\)/);
  assert.match(dropoffChange, /setDropoffPlace\(emptySelectedPlace\(\)\)/);
  assert.match(dropoffChange, /clearConfirmedDropoffPlace\(\)/);
});

check("4. Normal non-offer bookings still require autocomplete selection", () => {
  const card = read("src/components/QuoteCard.tsx");
  const progressive = read("src/components/QuoteProgressiveRoute.tsx");
  assert.match(progressive, /requireSuggestion/);
  assert.match(card, /pickupConfirmedPlace=\{isQuoteReadyPlace\(pickupPlace\) \? pickupPlace : null\}/);
  assert.doesNotMatch(
    card,
    /if \(returnOfferToken\)[\s\S]{0,80}setPickupPlace\(/,
  );
  assert.match(
    card,
    /initialDirection === "to-airport"\s*\n\s*\? initialAddressHint/,
  );
  const hintInit = card.slice(
    card.indexOf("const [pickupPlace, setPickupPlace]"),
    card.indexOf("const [dropoffPlace, setDropoffPlace]"),
  );
  assert.match(hintInit, /confirmedInitialPickup/);
  assert.doesNotMatch(hintInit, /initialAddressHint/);
});

check("5. Airport → Local and Local → Airport reversed journeys both work", () => {
  const homeToAirportReturn = buildReturnOfferConfirmedPlaces({
    direction: "local_to_airport",
    airportCode: "BFS",
    localPlace,
    localAddressLabel: localPlace.formattedAddress,
  });
  assert.equal(homeToAirportReturn.pickupPlace?.placeId, returnOfferPlaceFromServedAirport("BFS")?.placeId);
  assert.equal(homeToAirportReturn.dropoffPlace?.placeId, localPlace.placeId);
  assert.equal(returnOfferPlacesReadyForQuote(homeToAirportReturn), true);

  const airportToHomeReturn = buildReturnOfferConfirmedPlaces({
    direction: "airport_to_local",
    airportCode: "BHD",
    localPlace,
    localAddressLabel: localPlace.formattedAddress,
  });
  assert.equal(airportToHomeReturn.pickupPlace?.placeId, localPlace.placeId);
  assert.equal(airportToHomeReturn.dropoffPlace?.placeId, returnOfferPlaceFromServedAirport("BHD")?.placeId);
  assert.equal(returnOfferPlacesReadyForQuote(airportToHomeReturn), true);

  const snapshot = buildReturnOfferPublicSnapshot({
    direction: "airport_to_local",
    airportCode: "BHD",
    airportName: "Belfast City Airport",
    reversedPickupLabel: localPlace.formattedAddress,
    reversedDropoffLabel: "George Best Belfast City Airport",
    reversedPickupPlace: localPlace,
  });
  assert.equal(snapshot.localAddressLabel, localPlace.formattedAddress);
  assert.ok(isPlaceSelected(selectedPlaceFromReturnOffer(snapshot.pickupPlace)));
  assert.ok(isPlaceSelected(selectedPlaceFromReturnOffer(snapshot.dropoffPlace)));
});

check("6. Existing 5% fare calculation is unchanged", () => {
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: 62,
    airportFixedCostsGbp: 9,
    airportAccessChargeGbp: 5,
    returnOfferDiscountRate: 0.05,
  });
    assert.equal(breakdown.returnOfferSavingGbp, 3.1);
    assert.equal(breakdown.journeyFareBeforePromotionsGbp, 62);
    assert.equal(breakdown.finalAmountPayableGbp, 72.9);
  assert.equal(breakdown.airportFixedCostsGbp, 9);
  assert.equal(breakdown.airportAccessChargeGbp, 5);
});

check("7. Airport/Express charges remain undiscounted", () => {
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
  assert.notEqual(breakdown.returnOfferSavingGbp, (40 + 8 + 5) * 0.05);
});

check("Worker lookup hydrates confirmed places only after a valid token", () => {
  const handlers = read("workers/addresses/src/return-offer-handlers.ts");
  const api = read("src/lib/return-offer-api.ts");
  const book = read("src/app/book/ReturnOfferBookClient.tsx");
  assert.match(handlers, /enrichReturnOfferSnapshotPlaces/);
  assert.match(handlers, /resolvePlaceFromAddressLabel/);
  assert.match(handlers, /evaluateReturnOfferAccess/);
  assert.match(api, /\/return-offers\/by-token/);
  assert.doesNotMatch(book, /searchParams\.get\([\"']pickup/);
  assert.doesNotMatch(book, /searchParams\.get\([\"']address/);
});

console.log("\nReturn offer address-confirmation checks passed.");
