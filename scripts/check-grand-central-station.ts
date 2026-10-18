/** Offline station classification and fare invariants. Metrics below are synthetic, not advertised route distances. */
import assert from "node:assert/strict";
import { detectAirportCodeFromPlace, detectJourneyKind, isIncompleteAddressPlace, quickSelectToPlace, type SelectedPlace } from "../src/lib/selected-place";
import { calculatePointToPointQuote, roundGbp } from "../src/lib/quote";
import { SALOON_VEHICLE, ESTATE_VEHICLE } from "../src/lib/vehicle-selection";
import { defaultOwnerPricingSettings } from "../shared/owner-pricing-config";
import { resolveJourneyAirportFees } from "../shared/airport-fixed-costs";

// Public Places lookup verified 18 October 2026. Station centroid is not a prescribed stopping point.
const station: SelectedPlace = { placeId: "ChIJ27EsMwAJYUgR555gdyj3wJE", formattedAddress: "Weavers cross, Belfast BT12 5AX, UK", displayAddress: "Belfast Grand Central Station, Weavers cross, Belfast BT12 5AX, UK", placeName: "Belfast Grand Central Station", lat: 54.5949003, lng: -5.9394709, countryCode: "GB", postalCode: "BT12 5AX", locality: "Belfast" };
const home: SelectedPlace = { placeId: "synthetic-test-address", formattedAddress: "1 Example Road, Newtownabbey BT36 7AA", lat: 54.67, lng: -5.96, countryCode: "GB", postalCode: "BT36 7AA", streetNumber: "1", route: "Example Road" };
assert.equal(detectAirportCodeFromPlace(station), null);
assert.equal(isIncompleteAddressPlace(station), false);
assert.equal(detectJourneyKind(station, home), "address-to-address");
assert.equal(detectJourneyKind(home, station), "address-to-address");
for (const code of ["BFS", "BHD", "DUB"] as const) {
  assert.equal(detectJourneyKind(station, quickSelectToPlace(code)), "address-to-airport");
  assert.equal(detectJourneyKind(quickSelectToPlace(code), station), "airport-to-address");
}
assert.equal(resolveJourneyAirportFees({ isAirportToAirport: false }).lines.length, 0);
const settings = defaultOwnerPricingSettings();
// Fallback and live configuration must use the approved £7 supplement.
assert.equal(settings.estate.upliftGbp, 7);
assert.equal(settings.returnDiscount.rate, .05);
for (const miles of [4, 8, 20, 60]) {
  const metrics = { distanceKm: miles / .621371, durationMinutes: 30 };
  for (const [a,b] of [[station,home],[home,station]]) {
    const saloon = calculatePointToPointQuote(a.formattedAddress,b.formattedAddress,SALOON_VEHICLE,false,{},metrics,null,undefined,settings)!;
    const estate = calculatePointToPointQuote(a.formattedAddress,b.formattedAddress,ESTATE_VEHICLE,false,{},metrics,null,undefined,settings)!;
    const back = calculatePointToPointQuote(a.formattedAddress,b.formattedAddress,SALOON_VEHICLE,true,{},metrics,null,undefined,settings)!;
    assert.equal(estate.amount - saloon.amount, 7);
    assert.equal(back.amount, roundGbp(saloon.amount * 2 * .95));
  }
}
console.log("PASS: station accepted as named place; both directions; BFS/BHD/DUB classification; no station airport fee; Estate +7; return discount 5% (synthetic metrics).");
