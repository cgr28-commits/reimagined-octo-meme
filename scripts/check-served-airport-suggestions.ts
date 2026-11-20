/**
 * First-class served airport autocomplete (BFS / BHD / DUB).
 * Run: npx tsx scripts/check-served-airport-suggestions.ts
 */

import assert from "node:assert/strict";
import {
  isAllowedAutocompleteLabel,
  isAllowedCoordinates,
} from "../shared/address-validation";
import {
  matchServedAirportCode,
  matchServedAirportSuggestions,
  servedAirportFromPlaceId,
  SERVED_AIRPORTS,
} from "../shared/served-airports";

function expectSuggestion(query: string, code: string) {
  const hits = matchServedAirportSuggestions(query);
  const match = hits.find((item) => {
    const airport = servedAirportFromPlaceId(item.id);
    return airport?.code === code;
  });
  assert.ok(match, `Expected ${code} suggestion for query "${query}"`);
  assert.equal(
    isAllowedAutocompleteLabel(match.label, "BFS"),
    true,
    `${code} label must pass BFS autocomplete filter`,
  );
  assert.equal(
    isAllowedAutocompleteLabel(match.label, "A2A"),
    true,
    `${code} label must pass A2A autocomplete filter`,
  );
  console.log(`OK  suggest ${code} ← "${query}"`);
}

console.log("=== Dublin Airport queries ===");
expectSuggestion("Dublin Airport", "DUB");
expectSuggestion("dublin air", "DUB");
expectSuggestion("DUB", "DUB");

console.log("\n=== Belfast airports ===");
expectSuggestion("Belfast International", "BFS");
expectSuggestion("Belfast City Airport", "BHD");
expectSuggestion("George Best", "BHD");
expectSuggestion("Belfast City", "BHD");
expectSuggestion("belfast  city air", "BHD");
expectSuggestion("Belfast George Best", "BHD");
expectSuggestion("BHD", "BHD");
expectSuggestion("Belfast Intl", "BFS");
expectSuggestion("Belfast Air", "BFS");

for (const query of ["Belfast City Hall", "Belfast City Hospital", "Belfast City Centre", "Belfast Interface Project"]) {
  assert.deepEqual(matchServedAirportSuggestions(query), [], `Unexpected airport shortcut for "${query}"`);
}
assert.deepEqual(
  matchServedAirportSuggestions("Belfast City Airport").map((item) => servedAirportFromPlaceId(item.id)?.code),
  ["BHD"],
);

console.log("\n=== Bare Dublin must not fake the airport ===");
const bareDublin = matchServedAirportSuggestions("Dublin");
assert.equal(
  bareDublin.some((item) => servedAirportFromPlaceId(item.id)?.code === "DUB"),
  false,
  "Bare 'Dublin' must not inject Dublin Airport",
);
assert.equal(matchServedAirportCode("Dublin city centre"), null);
console.log("OK  bare Dublin excluded");

console.log("\n=== Canonical coords / place details ===");
const dub = SERVED_AIRPORTS.find((a) => a.code === "DUB");
assert.ok(dub);
assert.equal(dub.countryCode, "IE");
assert.ok(isAllowedCoordinates("BFS", dub.lat, dub.lng));
assert.ok(isAllowedCoordinates("A2A", dub.lat, dub.lng));
assert.equal(servedAirportFromPlaceId(dub.placeId)?.code, "DUB");
assert.equal(matchServedAirportCode(dub.formattedAddress), "DUB");
console.log("OK  Dublin Airport catalogue + coords");

console.log("\nAll served-airport suggestion checks passed.");
