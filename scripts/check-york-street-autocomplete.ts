/**
 * Regression: 123 York Street, Belfast BT15 1AS must be selectable.
 *
 * Root cause was GB mainland filter treating “York” in “York Street” as York, England
 * whenever the suggestion label lacked a BT postcode yet (common while typing).
 *
 * Run: npx tsx scripts/check-york-street-autocomplete.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  isAllowedAutocompleteLabel,
  isGreatBritainMainlandText,
} from "../shared/address-validation";
import {
  isPlaceSelected,
  isQuoteReadyPlace,
  selectedPlaceFromParts,
} from "../src/lib/selected-place";

const root = path.resolve(import.meta.dirname, "..");

const REGRESSION_LABELS = [
  "123 York Street, Belfast BT15 1AS",
  "123 York Street Belfast",
  "123 York St Belfast",
  "BT15 1AS",
  "123 York Street, Belfast, BT15 1AS",
  "York Street, Belfast",
  "123 York St, Belfast BT15 1AS",
] as const;

console.log("=== Filter allows York Street / BT15 variants ===");
for (const label of REGRESSION_LABELS) {
  assert.equal(
    isGreatBritainMainlandText(label),
    false,
    `must not be mainland GB: ${label}`,
  );
  assert.equal(
    isAllowedAutocompleteLabel(label, "A2A"),
    true,
    `must be allowed (A2A): ${label}`,
  );
  assert.equal(
    isAllowedAutocompleteLabel(label, "BFS"),
    true,
    `must be allowed (BFS): ${label}`,
  );
  console.log(`OK  allow  ${label}`);
}

console.log("\n=== Still blocks York (England) and bare York Street ===");
for (const label of [
  "York, England",
  "Museum Gardens, York",
  "York YO1 7HH",
  "York Street, London",
  "123 York Street",
] as const) {
  assert.equal(
    isAllowedAutocompleteLabel(label, "A2A"),
    false,
    `must stay blocked: ${label}`,
  );
  console.log(`OK  block  ${label}`);
}

console.log("\n=== SelectedPlace from York Street suggestion stays quote-ready ===");
const place = selectedPlaceFromParts({
  placeId: "ChIJccqUP1IIYUgRkIOsicoK82w",
  formattedAddress: "123 York Street, Belfast BT15 1AS, UK",
  displayAddress: "123 York Street, Belfast BT15 1AS",
  placeName: null,
  lat: 54.6075,
  lng: -5.926,
  countryCode: "GB",
  postalCode: "BT15 1AS",
  streetNumber: "123",
  route: "York Street",
  locality: "Belfast",
});
assert.equal(isPlaceSelected(place), true);
assert.equal(isQuoteReadyPlace(place), true);
assert.ok(place.placeId);
assert.ok(typeof place.lat === "number" && typeof place.lng === "number");
assert.match(place.formattedAddress, /York Street/i);
assert.match(place.postalCode ?? "", /BT15\s*1AS/i);
console.log("OK  SelectedPlace has placeId + coordinates (quote-ready)");

console.log("\n=== Source wiring: filter lives in shared validation (Worker merge uses it) ===");
const validation = fs.readFileSync(path.join(root, "shared/address-validation.ts"), "utf8");
assert.match(validation, /isNorthernIrelandText\(text\)/);
assert.match(validation, /GB_MAINLAND_AMBIGUOUS_CITY_PATTERN/);
assert.match(validation, /york\|hull\|derby\|reading/);
// City York must not sit in the unguarded mainland city list (false-positive on York Street).
assert.doesNotMatch(
  validation,
  /GB_MAINLAND_REGION_PATTERN\s*=\s*\/[^/]*\|york\|/,
);
const workerIndex = fs.readFileSync(
  path.join(root, "workers/addresses/src/index.ts"),
  "utf8",
);
assert.match(workerIndex, /isAllowedAutocompleteLabel/);
const addressInput = fs.readFileSync(
  path.join(root, "src/components/AddressInput.tsx"),
  "utf8",
);
assert.match(addressInput, /fetchSelectedPlaceDetails|fetchPlaceDetails/);
assert.match(addressInput, /requireSuggestion|handleSelect/);
console.log("OK  Autocomplete still requires suggestion selection; no free-text pricing bypass");

console.log("\nAll York Street autocomplete regression checks passed.");
