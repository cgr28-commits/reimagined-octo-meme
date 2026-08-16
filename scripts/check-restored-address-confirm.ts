/**
 * Restored confirmed address storage checks.
 * Run: npx tsx scripts/check-restored-address-confirm.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPlaceSelected, isQuoteReadyPlace, type SelectedPlace } from "../src/lib/selected-place";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const ready: SelectedPlace = {
  placeId: "ChIJtest123",
  formattedAddress: "10 Donegall Square North, Belfast BT1 5GB, UK",
  displayAddress: "10 Donegall Square North, Belfast BT1 5GB, UK",
  placeName: null,
  lat: 54.5973,
  lng: -5.9301,
  countryCode: "GB",
  postalCode: "BT1 5GB",
  streetNumber: "10",
  route: "Donegall Square North",
  locality: "Belfast",
};

const textOnly: SelectedPlace = {
  placeId: "",
  formattedAddress: "10 Donegall Square North, Belfast",
  displayAddress: "10 Donegall Square North, Belfast",
  placeName: null,
  lat: null,
  lng: null,
  countryCode: null,
  postalCode: null,
};

const missingCoords: SelectedPlace = {
  ...ready,
  lat: null,
  lng: null,
};

console.log("=== isQuoteReadyPlace ===");
assert.equal(isPlaceSelected(ready), true);
assert.equal(isQuoteReadyPlace(ready), true);
assert.equal(isPlaceSelected(textOnly), false);
assert.equal(isQuoteReadyPlace(textOnly), false);
assert.equal(isPlaceSelected(missingCoords), true);
assert.equal(isQuoteReadyPlace(missingCoords), false);
console.log("OK  only placeId + address + finite lat/lng is quote-ready");

console.log("\n=== Storage module API ===");
const storage = read("src/lib/address-place-storage.ts");
assert.match(storage, /PICKUP_PLACE_STORAGE_KEY/);
assert.match(storage, /DROPOFF_PLACE_STORAGE_KEY/);
assert.match(storage, /saveConfirmedPickupPlace/);
assert.match(storage, /readConfirmedPickupPlace/);
assert.match(storage, /clearConfirmedPickupPlace/);
assert.match(storage, /isQuoteReadyPlace/);
console.log("OK  pickup/dropoff place persistence helpers exist");

console.log("\n=== QuoteCard restore + clear wiring ===");
const card = read("src/components/QuoteCard.tsx");
assert.match(card, /readConfirmedPickupPlace/);
assert.match(card, /readConfirmedDropoffPlace/);
assert.match(card, /saveConfirmedPickupPlace/);
assert.match(card, /saveConfirmedDropoffPlace/);
assert.match(card, /clearConfirmedPickupPlace/);
assert.match(card, /clearConfirmedDropoffPlace/);
assert.match(card, /clearPickupAddressStorage/);
assert.match(card, /setPickupRestoredHint\(true\)/);
assert.match(card, /pickupConfirmedPlace/);
assert.match(card, /dropoffConfirmedPlace/);
console.log("OK  QuoteCard restores confirmed places and clears on edit");

console.log("\n=== AddressInput hydration + restored hint ===");
const input = read("src/components/AddressInput.tsx");
assert.match(input, /confirmedPlace/);
assert.match(input, /restoredHint/);
assert.match(input, /Using your previous address/);
assert.match(input, /selectedPlaceRef\.current = confirmedPlace/);
console.log("OK  AddressInput hydrates restored confirmation");

console.log("\n=== Progressive route passes restored props ===");
const progressive = read("src/components/QuoteProgressiveRoute.tsx");
assert.match(progressive, /pickupConfirmedPlace/);
assert.match(progressive, /pickupRestoredHint/);
assert.match(progressive, /confirmedPlace=\{pickupConfirmedPlace\}/);
assert.match(progressive, /confirmedPlace=\{dropoffConfirmedPlace\}/);
console.log("OK  progressive route wires restored confirmation for both fields");

console.log("\nAll restored-address confirmation checks passed.");
