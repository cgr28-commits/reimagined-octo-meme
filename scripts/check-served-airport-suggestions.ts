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
