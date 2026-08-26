/**
 * Robust NI autocomplete: Donaghadee / missing-town labels + structured parts.
 * Run: npx tsx scripts/check-ni-autocomplete-donaghadee.ts
 */
import assert from "node:assert/strict";
import {
  isAllowedAutocompleteLabel,
  isAddressAllowedForAirport,
  isGreatBritainMainlandText,
  isNorthernIrelandAddressParts,
  isNorthernIrelandText,
  isProvisionalServiceAreaAutocompleteLabel,
} from "../shared/address-validation";

function expectAllow(label: string, code = "BFS") {
  assert.equal(isAllowedAutocompleteLabel(label, code), true, `allow: ${label}`);
  console.log(`OK  allow  [${code}] ${label}`);
}

function expectBlock(label: string, code = "BFS") {
  assert.equal(isAllowedAutocompleteLabel(label, code), false, `block: ${label}`);
  console.log(`OK  block  [${code}] ${label}`);
}

console.log("=== Required NI towns / Donaghadee labels ===");
for (const label of [
  "Clifton Cove, Donaghadee, BT21 0RG",
  "Clifton Cove, Donaghadee",
  "Clifton Cove, Donaghadee, UK",
  "Donaghadee",
  "Bangor",
  "Newtownards",
  "Belfast",
  "Holywood",
  "Carrickfergus",
  "Ballymena",
  "Portrush",
  "Derry",
  "Londonderry",
  "Derry/Londonderry",
]) {
  expectAllow(label, "BFS");
  expectAllow(label, "A2A");
}

console.log("\n=== England / Scotland / Wales still blocked ===");
for (const label of [
  "Oxford Street, London, England",
  "10 Downing Street, London SW1A 2AA",
  "Buchanan Street, Glasgow, Scotland",
  "Princes Street, Edinburgh, UK",
  "Cardiff Bay, Cardiff, Wales",
  "Museum Gardens, York",
  "York YO1 7HH",
  "123 York Street",
]) {
  expectBlock(label, "BFS");
  expectBlock(label, "A2A");
}

console.log("\n=== Provisional soft-pass (no town whitelist required) ===");
assert.equal(isNorthernIrelandText("Clifton Cove, UnknownNiHamlet, UK"), false);
assert.equal(isProvisionalServiceAreaAutocompleteLabel("Clifton Cove, UnknownNiHamlet, UK", "BFS"), true);
assert.equal(isAllowedAutocompleteLabel("Clifton Cove, UnknownNiHamlet, UK", "BFS"), true);
assert.equal(isProvisionalServiceAreaAutocompleteLabel("123 York Street", "BFS"), false);
console.log("OK  provisional UK multi-part labels pass; bare street stays blocked");

console.log("\n=== Place Details: coords + components (primary signal) ===");
assert.equal(
  isNorthernIrelandAddressParts({
    country: "United Kingdom",
    displayName: "Clifton Cove, Donaghadee, UK",
    lat: 54.641,
    lng: -5.535,
  }),
  true,
);
assert.equal(
  isAddressAllowedForAirport("BFS", {
    country: "United Kingdom",
    displayName: "Clifton Cove, SomeUnlistedLocality, UK",
    lat: 54.641,
    lng: -5.535,
  }),
  true,
);
assert.equal(
  isAddressAllowedForAirport("BFS", {
    state: "Northern Ireland",
    country: "United Kingdom",
    displayName: "Clifton Cove, Donaghadee",
  }),
  true,
);
assert.equal(
  isAddressAllowedForAirport("BFS", {
    postcode: "BT21 0RG",
    displayName: "Clifton Cove, Donaghadee",
  }),
  true,
);
assert.equal(
  isAddressAllowedForAirport("BFS", {
    state: "England",
    country: "United Kingdom",
    displayName: "High Street, Leeds",
    lat: 53.8,
    lng: -1.5,
  }),
  false,
);
assert.equal(
  isNorthernIrelandAddressParts({
    country: "United Kingdom",
    displayName: "Somewhere, UK",
    lat: 53.8,
    lng: -1.5,
  }),
  false,
);
console.log("OK  NI bbox coords / state / BT postcode accept; England rejected");

assert.equal(isGreatBritainMainlandText("Clifton Cove, Donaghadee, UK"), false);
assert.equal(isGreatBritainMainlandText("Donaghadee"), false);

console.log("\nAll Donaghadee / robust NI autocomplete checks passed.");
