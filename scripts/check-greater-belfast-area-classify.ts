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
import { calculateQuote } from "../src/lib/quote";
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

/**
 * Exact regression: 18 Collingwood Avenue, Belfast, BT7 1QT → Dublin Airport.
 * Fixture mirrors a realistic Google Places (New) details payload + Worker/OSRM
 * route metrics (not placeholder coords). Expected: inside Greater Belfast,
 * automatic fixed price, normal booking (not manual / out-of-area).
 */
check("8. 18 Collingwood Avenue BT7 1QT → DUB: inside area, automatic fixed fare", () => {
  // Realistic Places API (New) place details shape → SelectedPlace fields.
  const googlePlacesDetailsFixture = {
    id: "ChIJCollingwoodAveBT71QT",
    formattedAddress: "18 Collingwood Avenue, Belfast BT7 1QT, UK",
    location: { latitude: 54.5833206, longitude: -5.9244653 },
    displayName: { text: "18 Collingwood Avenue" },
    addressComponents: [
      { longText: "18", shortText: "18", types: ["street_number"] },
      { longText: "Collingwood Avenue", shortText: "Collingwood Ave", types: ["route"] },
      { longText: "Belfast", shortText: "Belfast", types: ["postal_town", "locality"] },
      {
        longText: "County Antrim",
        shortText: "County Antrim",
        types: ["administrative_area_level_2"],
      },
      {
        longText: "Northern Ireland",
        shortText: "Northern Ireland",
        types: ["administrative_area_level_1"],
      },
      { longText: "BT7 1QT", shortText: "BT7 1QT", types: ["postal_code"] },
      { longText: "United Kingdom", shortText: "GB", types: ["country"] },
    ],
  };

  const streetNumber = googlePlacesDetailsFixture.addressComponents.find((c) =>
    c.types.includes("street_number"),
  )!.longText;
  const route = googlePlacesDetailsFixture.addressComponents.find((c) =>
    c.types.includes("route"),
  )!.longText;
  const postalCode = googlePlacesDetailsFixture.addressComponents.find((c) =>
    c.types.includes("postal_code"),
  )!.longText;
  const locality = googlePlacesDetailsFixture.addressComponents.find((c) =>
    c.types.includes("postal_town"),
  )!.longText;
  const administrativeArea = googlePlacesDetailsFixture.addressComponents.find((c) =>
    c.types.includes("administrative_area_level_2"),
  )!.longText;
  const countryCode = googlePlacesDetailsFixture.addressComponents.find((c) =>
    c.types.includes("country"),
  )!.shortText;

  assert.equal(postalCode, "BT7 1QT");
  assert.equal(googlePlacesDetailsFixture.location.latitude, 54.5833206);
  assert.equal(googlePlacesDetailsFixture.location.longitude, -5.9244653);

  const collingwood = place({
    placeId: googlePlacesDetailsFixture.id,
    formattedAddress: googlePlacesDetailsFixture.formattedAddress,
    placeName: googlePlacesDetailsFixture.displayName.text,
    lat: googlePlacesDetailsFixture.location.latitude,
    lng: googlePlacesDetailsFixture.location.longitude,
    streetNumber,
    route,
    postalCode,
    locality,
    administrativeArea,
    countryCode,
  });

  // Worker/OSRM-shaped metrics for Collingwood Ave → Dublin Airport
  // (project-osrm.org driving: ~159.3 km / ~6793 s).
  const workerRouteMetrics = {
    distanceKm: 159.2679,
    durationMinutes: 6793.4 / 60,
    source: "worker" as const,
  };

  assert.equal(isWithinGreaterBelfastGeofence(collingwood.lat!, collingwood.lng!), true);
  assert.equal(classifyPickupArea(collingwood).inside, true);
  assert.equal(classifyPickupArea(collingwood).incomplete, false);
  assert.ok(
    classifyPickupArea(collingwood).reason === "geofence" ||
      classifyPickupArea(collingwood).reason === "postcode",
  );
  assert.equal(isStandardInstantPickup(collingwood), true);
  assert.equal(isOutOfAreaPickup(collingwood), false);
  assert.equal(needsManualQuoteApproval(collingwood, dub), false);

  const fare = calculateQuote(
    collingwood.formattedAddress,
    "DUB",
    "Standard Saloon (1–4 passengers)",
    false,
    {},
    {
      distanceKm: workerRouteMetrics.distanceKm,
      durationMinutes: workerRouteMetrics.durationMinutes,
    },
    false,
  );
  assert.ok(fare, "Collingwood → DUB must return an automatic fixed fare");
  assert.ok(fare.amount > 0, "fixed fare must be a positive GBP amount");
});

console.log("\nAll Greater Belfast area-classification checks passed.");
console.log(
  `Boundary: lat ${GREATER_BELFAST_GEOFENCE.minLat}…${GREATER_BELFAST_GEOFENCE.maxLat}, ` +
    `lng ${GREATER_BELFAST_GEOFENCE.minLng}…${GREATER_BELFAST_GEOFENCE.maxLng}`,
);
