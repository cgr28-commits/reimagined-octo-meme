/**
 * Greater Belfast area classification — geofence-first, incomplete vs out-of-area.
 * Run: npx tsx scripts/check-greater-belfast-area-classify.ts
 */
import assert from "node:assert/strict";
import {
  GREATER_BELFAST_GEOFENCE,
  classifyGreaterBelfastServiceArea,
  isWithinGreaterBelfastGeofence,
} from "../shared/ldy-service-area";
import {
  INCOMPLETE_PICKUP_ADDRESS_MESSAGE,
  classifyPickupArea,
  isIncompleteAddressPlace,
  isOutOfAreaPickup,
  isStandardInstantPickup,
  needsManualQuoteApproval,
  quickSelectToPlace,
  selectedPlaceFromParts,
  type SelectedPlace,
} from "../src/lib/selected-place";

function place(
  partial: Partial<SelectedPlace> & Pick<SelectedPlace, "formattedAddress" | "placeId">,
): SelectedPlace {
  return selectedPlaceFromParts({
    placeId: partial.placeId,
    formattedAddress: partial.formattedAddress,
    displayAddress: partial.displayAddress ?? partial.formattedAddress,
    placeName: partial.placeName,
    lat: partial.lat ?? null,
    lng: partial.lng ?? null,
    countryCode: partial.countryCode ?? "GB",
    postalCode: partial.postalCode ?? null,
    streetNumber: partial.streetNumber ?? null,
    route: partial.route ?? null,
    locality: partial.locality ?? null,
    administrativeArea: partial.administrativeArea ?? null,
  });
}

function check(label: string, fn: () => void) {
  fn();
  console.log(`OK  ${label}`);
}

const dub = quickSelectToPlace("DUB")!;
const bfs = quickSelectToPlace("BFS")!;
assert.ok(dub && bfs);

check("Current geofence boundary is the existing LDY rectangle (not expanded)", () => {
  assert.equal(GREATER_BELFAST_GEOFENCE.minLat, 54.45);
  assert.equal(GREATER_BELFAST_GEOFENCE.maxLat, 54.78);
  assert.equal(GREATER_BELFAST_GEOFENCE.minLng, -6.35);
  assert.equal(GREATER_BELFAST_GEOFENCE.maxLng, -5.55);
});

check("1. Complete central Belfast address → inside area", () => {
  const central = place({
    placeId: "central-belfast",
    formattedAddress: "10 Donegall Square North, Belfast BT1 5GB, UK",
    postalCode: "BT1 5GB",
    streetNumber: "10",
    lat: 54.5973,
    lng: -5.9301,
    locality: "Belfast",
  });
  assert.equal(isStandardInstantPickup(central), true);
  assert.equal(isOutOfAreaPickup(central), false);
  assert.equal(classifyPickupArea(central).reason, "geofence");
  assert.equal(needsManualQuoteApproval(central, dub), false);
});

check("2. Complete North Belfast / Newtownabbey within boundary → inside", () => {
  const jordanstown = place({
    placeId: "jordanstown",
    formattedAddress: "2 Shore Road, Jordanstown, UK",
    streetNumber: "2",
    lat: 54.686,
    lng: -5.885,
    locality: "Jordanstown",
    // No postcode — must still be inside via geofence.
    postalCode: null,
  });
  assert.equal(isWithinGreaterBelfastGeofence(54.686, -5.885), true);
  assert.equal(isStandardInstantPickup(jordanstown), true);
  assert.equal(isOutOfAreaPickup(jordanstown), false);
  assert.equal(classifyPickupArea(jordanstown).reason, "geofence");

  const newtownabbey = place({
    placeId: "ntabbey",
    formattedAddress: "7 Glen Manor Rd, Newtownabbey BT36 1XX, UK",
    postalCode: "BT36 1XX",
    streetNumber: "7",
    lat: 54.69,
    lng: -5.93,
    locality: "Newtownabbey",
  });
  assert.equal(isStandardInstantPickup(newtownabbey), true);
  assert.equal(isOutOfAreaPickup(newtownabbey), false);
});

check("3. Belfast street without house/building → incomplete, not out-of-area", () => {
  const streetOnly = place({
    placeId: "street-only",
    formattedAddress: "Donegall Square North, Belfast BT1 5GB, UK",
    postalCode: "BT1 5GB",
    streetNumber: null,
    placeName: null,
    lat: 54.5973,
    lng: -5.9301,
  });
  assert.equal(isIncompleteAddressPlace(streetOnly), true);
  assert.equal(isOutOfAreaPickup(streetOnly), false);
  assert.equal(classifyPickupArea(streetOnly).reason, "incomplete");
  assert.equal(needsManualQuoteApproval(streetOnly, dub), false);
  assert.match(INCOMPLETE_PICKUP_ADDRESS_MESSAGE, /house number or building name/i);
});

check("4. Missing postcode but valid coordinates inside boundary → inside", () => {
  const noPostcode = place({
    placeId: "no-pc",
    formattedAddress: "18 Collingwood Ave, Belfast, UK",
    postalCode: null,
    streetNumber: "18",
    lat: 54.64,
    lng: -5.93,
    locality: "Belfast",
  });
  const area = classifyGreaterBelfastServiceArea({
    lat: noPostcode.lat,
    lng: noPostcode.lng,
    postalCode: null,
    addressText: noPostcode.formattedAddress,
  });
  assert.equal(area.inside, true);
  assert.equal(area.reason, "geofence");
  assert.equal(isStandardInstantPickup(noPostcode), true);
  assert.equal(isOutOfAreaPickup(noPostcode), false);
});

check("5. Valid coordinates outside the boundary → manual quote (out-of-area)", () => {
  const newry = place({
    placeId: "newry",
    formattedAddress: "12 Hill Street, Newry BT34 1AR, UK",
    postalCode: "BT34 1AR",
    streetNumber: "12",
    lat: 54.175,
    lng: -6.34,
  });
  assert.equal(isWithinGreaterBelfastGeofence(54.175, -6.34), false);
  assert.equal(isStandardInstantPickup(newry), false);
  assert.equal(isOutOfAreaPickup(newry), true);
  assert.equal(needsManualQuoteApproval(newry, dub), true);
  assert.equal(classifyPickupArea(newry).reason, "outside_geofence");
});

check("6. Belfast pickup to Dublin Airport — inside-area classification unaffected", () => {
  const belfast = place({
    placeId: "bfs-home",
    formattedAddress: "2 Shore Road, Jordanstown, UK",
    streetNumber: "2",
    lat: 54.686,
    lng: -5.885,
    postalCode: null,
  });
  const before = classifyPickupArea(belfast);
  assert.equal(needsManualQuoteApproval(belfast, dub), false);
  assert.equal(needsManualQuoteApproval(belfast, bfs), false);
  const after = classifyPickupArea(belfast);
  assert.equal(before.inside, true);
  assert.equal(after.inside, true);
  assert.equal(before.reason, after.reason);
  assert.equal(isOutOfAreaPickup(belfast), false);
});

check("7. Restored quote retains the same classification", () => {
  const original = place({
    placeId: "restore-me",
    formattedAddress: "5 Carnmoney Road, Newtownabbey, UK",
    streetNumber: "5",
    lat: 54.68,
    lng: -5.95,
    locality: "Newtownabbey",
    administrativeArea: "County Antrim",
    postalCode: null,
  });
  const serialized = JSON.parse(JSON.stringify(original)) as SelectedPlace;
  assert.equal(serialized.placeId, original.placeId);
  assert.equal(serialized.lat, original.lat);
  assert.equal(serialized.lng, original.lng);
  assert.equal(serialized.administrativeArea, "County Antrim");
  assert.equal(classifyPickupArea(original).inside, classifyPickupArea(serialized).inside);
  assert.equal(classifyPickupArea(original).reason, classifyPickupArea(serialized).reason);
  assert.equal(isOutOfAreaPickup(serialized), false);
});

check("Swapped lat/lng are not treated as inside the geofence", () => {
  assert.equal(isWithinGreaterBelfastGeofence(-5.93, 54.6), false);
});

console.log("\nAll Greater Belfast area-classification checks passed.");
console.log(
  `Boundary: lat ${GREATER_BELFAST_GEOFENCE.minLat}…${GREATER_BELFAST_GEOFENCE.maxLat}, ` +
    `lng ${GREATER_BELFAST_GEOFENCE.minLng}…${GREATER_BELFAST_GEOFENCE.maxLng}`,
);
