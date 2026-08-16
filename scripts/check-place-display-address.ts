/**
 * Smoke checks for business/place name preservation in display addresses.
 * Run: npx tsx scripts/check-place-display-address.ts
 */

import assert from "node:assert/strict";
import {
  buildDisplayAddress,
  placeDisplayText,
  selectedPlaceFromParts,
} from "../src/lib/selected-place";

function check(
  label: string,
  placeName: string | null,
  formatted: string,
  expected: string,
) {
  const display = buildDisplayAddress(placeName, formatted);
  assert.equal(display, expected, label);
  console.log(`OK  ${label}`);
  console.log(`    → ${display}`);
}

// Named businesses / venues — keep name + postal address
check(
  "Titanic Belfast",
  "Titanic Belfast",
  "1 Olympic Way, Belfast BT3 9EP, UK",
  "Titanic Belfast, 1 Olympic Way, Belfast BT3 9EP, UK",
);

check(
  "The Merchant Hotel Belfast",
  "The Merchant Hotel",
  "16 Skipper St, Belfast BT1 2DZ, UK",
  "The Merchant Hotel, 16 Skipper St, Belfast BT1 2DZ, UK",
);

check(
  "Belfast City Hospital",
  "Belfast City Hospital",
  "51 Lisburn Rd, Belfast BT9 7AB, UK",
  "Belfast City Hospital, 51 Lisburn Rd, Belfast BT9 7AB, UK",
);

// Airport — name already in formatted address → no duplication
check(
  "Belfast International Airport (name already in formatted)",
  "Belfast International Airport",
  "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK",
  "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK",
);

// Residential — no extra label
check(
  "Normal residential address",
  null,
  "42 Belmont Road, Belfast BT4 2AN, UK",
  "42 Belmont Road, Belfast BT4 2AN, UK",
);

check(
  "Postcode-selected residential (no place name)",
  null,
  "7 Abbey Street, Bangor BT20 4JB, UK",
  "7 Abbey Street, Bangor BT20 4JB, UK",
);

// Structured SelectedPlace → visible input uses displayAddress
const titanic = selectedPlaceFromParts({
  placeId: "ChIJ_titanic_test",
  formattedAddress: "1 Olympic Way, Belfast BT3 9EP, UK",
  placeName: "Titanic Belfast",
  lat: 54.608,
  lng: -5.91,
  postalCode: "BT3 9EP",
});
assert.equal(
  placeDisplayText(titanic),
  "Titanic Belfast, 1 Olympic Way, Belfast BT3 9EP, UK",
);
assert.equal(titanic.formattedAddress, "1 Olympic Way, Belfast BT3 9EP, UK");
assert.equal(titanic.placeName, "Titanic Belfast");
assert.equal(titanic.lat, 54.608);
assert.equal(titanic.lng, -5.91);
console.log("OK  SelectedPlace retains placeName, displayAddress, lat/lng, placeId");

const residential = selectedPlaceFromParts({
  placeId: "ChIJ_house_test",
  formattedAddress: "42 Belmont Road, Belfast BT4 2AN, UK",
  placeName: null,
  lat: 54.6,
  lng: -5.85,
  postalCode: "BT4 2AN",
});
assert.equal(placeDisplayText(residential), "42 Belmont Road, Belfast BT4 2AN, UK");
assert.equal(residential.placeName, null);
console.log("OK  Residential SelectedPlace stays clean");

console.log("\nAll place-display checks passed.");
