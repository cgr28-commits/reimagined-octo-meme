/**
 * Tests for address-to-address journey detection and ROI fixed-quote gating.
 * Run: npx tsx scripts/check-a2a-roi-journeys.ts
 */

import assert from "node:assert/strict";
import {
  detectAirportCodeFromPlace,
  detectJourneyKind,
  isOutOfAreaPickup,
  isPlaceSelected,
  isRepublicOfIrelandJourney,
  isStandardInstantPickup,
  needsManualQuoteApproval,
  placesEqual,
  quickSelectToPlace,
  type SelectedPlace,
} from "../src/lib/selected-place";
import {
  isAddressAllowedForAirport,
  isAllowedAutocompleteLabel,
  isAllowedCoordinates,
} from "../shared/address-validation";

let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

function place( partial: Partial<SelectedPlace> & Pick<SelectedPlace, "formattedAddress">): SelectedPlace {
  return {
    placeId: partial.placeId ?? `test:${partial.formattedAddress.slice(0, 12)}`,
    formattedAddress: partial.formattedAddress,
    lat: partial.lat ?? null,
    lng: partial.lng ?? null,
    countryCode: partial.countryCode ?? null,
    postalCode: partial.postalCode ?? null,
  };
}

const belfastHome = place({
  placeId: "belfast-home",
  formattedAddress: "10 Donegall Square North, Belfast BT1 5GB, UK",
  countryCode: "GB",
  postalCode: "BT1 5GB",
  lat: 54.5973,
  lng: -5.9301,
});

const bangorHome = place({
  placeId: "bangor-home",
  formattedAddress: "12 Main Street, Bangor BT20 5AF, Northern Ireland",
  countryCode: "GB",
  postalCode: "BT20 5AF",
});

const newryPickup = place({
  placeId: "newry-home",
  formattedAddress: "12 Hill Street, Newry BT34 1AR, Northern Ireland",
  countryCode: "GB",
  postalCode: "BT34 1AR",
  lat: 54.175,
  lng: -6.34,
});

const derryCityPickup = place({
  placeId: "derry-home",
  formattedAddress: "1 Guildhall Square, Derry BT48 6BJ, Northern Ireland",
  countryCode: "GB",
  postalCode: "BT48 6BJ",
  lat: 54.997,
  lng: -7.321,
});

const dublinCity = place({
  placeId: "dublin-city",
  formattedAddress: "1 Grafton Street, Dublin, D02 HX96, Ireland",
  countryCode: "IE",
  postalCode: "D02 HX96",
  lat: 53.342,
  lng: -6.26,
});

const corkCity = place({
  placeId: "cork-city",
  formattedAddress: "Patrick Street, Cork, T12, Ireland",
  countryCode: "IE",
  postalCode: "T12",
  lat: 51.8985,
  lng: -8.4756,
});

const bfs = quickSelectToPlace("BFS");
const bhd = quickSelectToPlace("BHD");
const dub = quickSelectToPlace("DUB");

assert.ok(bfs && bhd && dub);

check("Belfast address to Dublin city is ROI fixed-quote", () => {
  assert.equal(detectJourneyKind(belfastHome, dublinCity), "address-to-address");
  assert.equal(isRepublicOfIrelandJourney(belfastHome, dublinCity), true);
});

check("Belfast address to Cork is ROI fixed-quote", () => {
  assert.equal(detectJourneyKind(belfastHome, corkCity), "address-to-address");
  assert.equal(isRepublicOfIrelandJourney(belfastHome, corkCity), true);
});

check("Dublin city to Belfast is ROI fixed-quote", () => {
  assert.equal(detectJourneyKind(dublinCity, belfastHome), "address-to-address");
  assert.equal(isRepublicOfIrelandJourney(dublinCity, belfastHome), true);
});

check("BFS airport to Belfast address is airport-to-address, not ROI", () => {
  assert.equal(detectAirportCodeFromPlace(bfs!), "BFS");
  assert.equal(detectJourneyKind(bfs!, belfastHome), "airport-to-address");
  assert.equal(isRepublicOfIrelandJourney(bfs!, belfastHome), false);
});

check("Belfast address to BHD is address-to-airport, not ROI", () => {
  assert.equal(detectAirportCodeFromPlace(bhd!), "BHD");
  assert.equal(detectJourneyKind(belfastHome, bhd!), "address-to-airport");
  assert.equal(isRepublicOfIrelandJourney(belfastHome, bhd!), false);
});

check("Two ordinary NI addresses are A2A and not ROI", () => {
  assert.equal(detectJourneyKind(belfastHome, bangorHome), "address-to-address");
  assert.equal(isRepublicOfIrelandJourney(belfastHome, bangorHome), false);
});

check("Invalid manually typed address (no placeId) is not selected", () => {
  const typed = place({
    placeId: "",
    formattedAddress: "some random street I typed",
    countryCode: null,
  });
  assert.equal(isPlaceSelected(typed), false);
});

check("Same pickup and destination are equal", () => {
  assert.equal(placesEqual(belfastHome, { ...belfastHome }), true);
  assert.equal(placesEqual(belfastHome, bangorHome), false);
});

check("Dublin Airport keeps instant quote (not ROI fixed-quote)", () => {
  assert.equal(detectAirportCodeFromPlace(dub!), "DUB");
  assert.equal(isRepublicOfIrelandJourney(belfastHome, dub!), false);
  assert.equal(isRepublicOfIrelandJourney(dub!, belfastHome), false);
  assert.equal(detectJourneyKind(belfastHome, dub!), "address-to-airport");
  assert.equal(needsManualQuoteApproval(belfastHome, dub!), false);
  assert.equal(needsManualQuoteApproval(dub!, belfastHome), false);
});

check("Dublin city still uses ROI fixed-quote", () => {
  assert.equal(isRepublicOfIrelandJourney(belfastHome, dublinCity), true);
  assert.equal(needsManualQuoteApproval(belfastHome, dublinCity), true);
});

check("Greater Belfast address is a standard instant pickup", () => {
  assert.equal(isStandardInstantPickup(belfastHome), true);
  assert.equal(isStandardInstantPickup(bangorHome), true);
  assert.equal(isOutOfAreaPickup(belfastHome), false);
});

check("BFS, BHD and DUB airports are standard instant pickups", () => {
  assert.equal(isStandardInstantPickup(bfs!), true);
  assert.equal(isStandardInstantPickup(bhd!), true);
  assert.equal(isStandardInstantPickup(dub!), true);
});

check("Out-of-area pickup (Newry) needs manual approval — no auto price", () => {
  assert.equal(isOutOfAreaPickup(newryPickup), true);
  assert.equal(isStandardInstantPickup(newryPickup), false);
  assert.equal(needsManualQuoteApproval(newryPickup, bangorHome), true);
  assert.equal(needsManualQuoteApproval(newryPickup, dublinCity), true);
});

check("Out-of-area pickup (Derry city) needs manual approval", () => {
  assert.equal(isOutOfAreaPickup(derryCityPickup), true);
  assert.equal(needsManualQuoteApproval(derryCityPickup, belfastHome), true);
});

check("Bangor to Cork is ROI manual quote (standard Greater Belfast pickup)", () => {
  assert.equal(isOutOfAreaPickup(bangorHome), false);
  assert.equal(isRepublicOfIrelandJourney(bangorHome, corkCity), true);
  assert.equal(needsManualQuoteApproval(bangorHome, corkCity), true);
});

check("Belfast to Bangor keeps instant quote (NI A2A, standard pickup)", () => {
  assert.equal(needsManualQuoteApproval(belfastHome, bangorHome), false);
});

check("A2A Places mode allows NI and ROI labels", () => {
  assert.equal(isAllowedAutocompleteLabel("10 High Street, Belfast BT1", "A2A"), true);
  assert.equal(isAllowedAutocompleteLabel("Grafton Street, Dublin, Ireland", "A2A"), true);
  assert.equal(isAllowedAutocompleteLabel("Oxford Street, London, England", "A2A"), false);
});

check("A2A Places mode allows IE coordinates", () => {
  assert.equal(isAllowedCoordinates("A2A", 53.35, -6.26), true);
  assert.equal(isAllowedCoordinates("A2A", 54.6, -5.93), true);
  assert.equal(isAllowedCoordinates("BFS", 53.35, -6.26), false);
});

check("A2A address parts allow ROI", () => {
  assert.equal(
    isAddressAllowedForAirport("A2A", {
      postcode: "D02 HX96",
      country: "Ireland",
      city: "Dublin",
      displayName: "1 Grafton Street, Dublin",
    }),
    true,
  );
  assert.equal(
    isAddressAllowedForAirport("A2A", {
      postcode: "BT1 5GB",
      state: "Northern Ireland",
      city: "Belfast",
    }),
    true,
  );
  assert.equal(
    isAddressAllowedForAirport("BFS", {
      postcode: "D02 HX96",
      country: "Ireland",
      city: "Dublin",
    }),
    false,
  );
});

check("SERVICE_FLAGS.addressToAddress is enabled", async () => {
  const { SERVICE_FLAGS } = await import("../src/lib/data");
  assert.equal(SERVICE_FLAGS.addressToAddress, true);
});

console.log(`\n${passed} checks passed`);
