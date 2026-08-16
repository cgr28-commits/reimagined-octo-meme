/**
 * Geographic autocomplete allow-list: Northern Ireland + Republic of Ireland only.
 * Run: npx tsx scripts/check-ni-roi-address-filter.ts
 */

import assert from "node:assert/strict";
import {
  isAllowedAutocompleteLabel,
  isGreatBritainMainlandText,
  isNorthernIrelandText,
  isRepublicOfIrelandText,
} from "../shared/address-validation";

function expectAllowed(label: string, airportCode = "A2A") {
  assert.equal(
    isAllowedAutocompleteLabel(label, airportCode),
    true,
    `Expected ALLOWED: ${label}`,
  );
  console.log(`OK  allow  ${label}`);
}

function expectBlocked(label: string, airportCode = "A2A") {
  assert.equal(
    isAllowedAutocompleteLabel(label, airportCode),
    false,
    `Expected BLOCKED: ${label}`,
  );
  assert.equal(isGreatBritainMainlandText(label) || !isNorthernIrelandText(label) && !isRepublicOfIrelandText(label) || isGreatBritainMainlandText(label), true);
  console.log(`OK  block  ${label}`);
}

console.log("=== Must show (NI / ROI) ===");
expectAllowed("Donegall Square North, Belfast BT1 5GB");
expectAllowed("Main Street, Newtownabbey BT36 7FU");
expectAllowed("Guildhall Square, Derry BT48 6BJ");
expectAllowed("Guildhall Square, Londonderry BT48 6BJ");
expectAllowed("Grafton Street, Dublin, Ireland");
expectAllowed("Dublin Airport, Co. Dublin, Ireland");
expectAllowed("Patrick Street, Cork, Ireland");
expectAllowed("Cork");
expectAllowed("Belfast");
expectAllowed("Newtownabbey");
expectAllowed("Titanic Belfast, Olympic Way, Belfast");
expectAllowed("1 Olympic Way, Belfast BT3 9EP, UK");

console.log("\n=== Must NOT show (England / Scotland / Wales) ===");
expectBlocked("Oxford Street, London, England");
expectBlocked("10 Downing Street, London SW1A 2AA");
expectBlocked("Piccadilly Gardens, Manchester");
expectBlocked("Buchanan Street, Glasgow, Scotland");
expectBlocked("Princes Street, Edinburgh, UK");
expectBlocked("Cardiff Bay, Cardiff, Wales");
expectBlocked("Liverpool Lime Street, Liverpool");
expectBlocked("Newcastle upon Tyne, England");
expectBlocked("M1 1AE, Manchester");

console.log("\n=== BFS mode blocks ROI + mainland ===");
assert.equal(isAllowedAutocompleteLabel("Grafton Street, Dublin", "BFS"), false);
assert.equal(isAllowedAutocompleteLabel("Oxford Street, London", "BFS"), false);
assert.equal(isAllowedAutocompleteLabel("High Street, Belfast BT1", "BFS"), true);
console.log("OK  BFS mode NI-only");

console.log("\nAll NI/ROI address filter checks passed.");
