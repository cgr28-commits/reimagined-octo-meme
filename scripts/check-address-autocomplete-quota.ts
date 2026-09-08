/**
 * Address autocomplete must not double-call Places from the browser when the
 * Worker is configured, and must surface quota exhaustion instead of “no match”.
 *
 * Run: npx tsx scripts/check-address-autocomplete-quota.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPlacesQuotaError, PLACES_QUOTA_ERROR_NAME } from "../shared/google-places";

const root = join(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const maps = read("src/lib/google-maps.ts");
const input = read("src/components/AddressInput.tsx");
const worker = read("workers/addresses/src/index.ts");
const places = read("shared/google-places.ts");
const card = read("src/components/QuoteCard.tsx");

assert.match(
  card,
  /journeyIntent !== "address-to-address" && intentAirportCode/,
  "To/From airport lookups must use the selected airport, not A2A",
);
assert.match(card, /PLACES_LOOKUP_A2A/);

assert.match(maps, /The Worker already calls Places/);
assert.match(maps, /unavailable: Boolean\(worker\.unavailable\)/);
const detailed = maps.slice(maps.indexOf("export async function fetchAddressPredictionsDetailed"));
assert.match(detailed, /if \(ADDRESSES_API_URL\)/);
assert.match(detailed, /if \(worker\) \{\s*return \{/);
assert.doesNotMatch(
  detailed,
  /tasks\.push\(\s*safePredictions\(\s*fetchWorkerAddressSuggestions/,
  "browser must not fan-out Worker + local Places in parallel",
);

assert.match(places, /searchGoogleAddressSuggestions/);
assert.match(places, /PLACES_QUOTA_ERROR_NAME/);
assert.match(places, /throwIfPlacesQuota/);

assert.match(worker, /searchGoogleAddressSuggestions/);
assert.match(worker, /isPlacesQuotaError/);
assert.match(worker, /unavailable: unavailable && finalSuggestions\.length === 0/);
assert.doesNotMatch(
  worker,
  /searchGoogleEstablishments\(/,
  "worker should not fire extra Places searches in parallel",
);

assert.match(input, /result\.unavailable/);
assert.match(input, /Address suggestions are unavailable right now/);
assert.match(input, /position: "fixed"/);

const quota = new Error("Google Places daily quota exceeded");
quota.name = PLACES_QUOTA_ERROR_NAME;
assert.equal(isPlacesQuotaError(quota), true);
assert.equal(isPlacesQuotaError(new Error("nope")), false);

console.log("check-address-autocomplete-quota: ok");
