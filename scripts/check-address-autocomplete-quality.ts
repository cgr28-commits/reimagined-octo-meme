/**
 * Autocomplete quality helpers: weak primary results must still allow one
 * street fallback, without restoring parallel Places fan-out.
 *
 * Numbered queries are strong only when at least one result covers the typed
 * street tokens in order as prefixes — not merely because 3–5 numbered hits exist.
 *
 * Run: npx tsx scripts/check-address-autocomplete-quality.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  areGoogleAutocompleteResultsStrong,
  extractTypedLocalityHint,
  parseNumberedStreetQuery,
  rankAddressSuggestions,
  type AddressSuggestion,
} from "../shared/google-places";

const suggestion = (
  mainText: string,
  secondaryText = "",
  id = mainText,
): AddressSuggestion => ({
  id,
  label: secondaryText ? `${mainText}, ${secondaryText}` : mainText,
  address: secondaryText ? `${mainText}, ${secondaryText}` : mainText,
  mainText,
  secondaryText,
});

const dublin7Gl = [
  suggestion("7 Glenabbey Road", "Howth, Dublin"),
  suggestion("7 Glenageary Road", "Dún Laoghaire, Dublin"),
  suggestion("7 Glenmaroon Road", "Chapelizod, Dublin"),
  suggestion("7 Glenbeigh Road", "Dublin"),
  suggestion("7 Glenshesk Road", "Dublin"),
];

const ni7Gl = [
  suggestion("7 Glebe Road", "Newtownabbey"),
  suggestion("7 Glenavy Road", "Crumlin"),
  suggestion("7 Glenwell Road", "Newtownabbey"),
  suggestion("7 Glenariff Drive", "Ballymena"),
  suggestion("7 Glenburn Road", "Dunmurry"),
];

const glenManorLoose = [
  suggestion("7 Glenavy Road", "Crumlin"),
  suggestion("7 Gortin Drive", "Omagh"),
  suggestion("7 Glebe Road", "Newtownabbey"),
  suggestion("7 Glenwell Road", "Newtownabbey"),
  suggestion("7 Glenburn Road", "Dunmurry"),
];

const glenManor = [
  suggestion("7 Glen Manor Road", "Newtownabbey BT36 7FU", "ChIJGlenManor"),
];

const glenManorRankList = [
  suggestion("7 Glen Manor", "Bangor"),
  suggestion("7 Glen Manor Avenue", "Belfast"),
  suggestion("7 Glen Manor Road", "Newtownabbey BT36 7FU", "ChIJGlenManor"),
  suggestion("7 Glenavy Road", "Crumlin"),
];

assert.deepEqual(parseNumberedStreetQuery("7 Glen M").streetTokens, ["glen", "m"]);
assert.deepEqual(parseNumberedStreetQuery("7 Glen Manor").streetTokens, ["glen", "manor"]);
assert.equal(parseNumberedStreetQuery("7 G").streetTokens[0], "g");

// Short prefixes can stay broad when results actually begin with that prefix.
assert.equal(areGoogleAutocompleteResultsStrong("7 G", dublin7Gl), true);
assert.equal(areGoogleAutocompleteResultsStrong("7 Gl", dublin7Gl), true);
assert.equal(
  areGoogleAutocompleteResultsStrong("7 Glen", dublin7Gl),
  true,
  "Glen-prefixed Dublin streets still cover the Glen token",
);

// Extra typed tokens must not be ignored. Unrelated Glen* streets are weak.
assert.equal(
  areGoogleAutocompleteResultsStrong("7 Glen M", dublin7Gl),
  false,
  "Glenabbey / Glenageary must not make 7 Glen M strong",
);
assert.equal(
  areGoogleAutocompleteResultsStrong("7 Glen M", glenManorLoose),
  false,
  "7 Glenavy / Gortin / Glebe must not block the Glen M fallback",
);
assert.equal(
  areGoogleAutocompleteResultsStrong("7 Glen Manor", dublin7Gl),
  false,
  "Dublin Glen* streets must not block the Glen Manor street fallback",
);
assert.equal(
  areGoogleAutocompleteResultsStrong("7 Glen Manor Road", dublin7Gl),
  false,
);
assert.equal(
  areGoogleAutocompleteResultsStrong("7 Glen Manor Road, Newtownabbey", dublin7Gl),
  false,
);

// BFS-style NI Autocomplete is strong for short numbered prefixes.
assert.equal(areGoogleAutocompleteResultsStrong("7 G", ni7Gl), true);
assert.equal(areGoogleAutocompleteResultsStrong("7 Gl", ni7Gl), true);
assert.equal(areGoogleAutocompleteResultsStrong("7 Gle", ni7Gl), true);
assert.equal(areGoogleAutocompleteResultsStrong("7 Glen", ni7Gl), true);
assert.equal(
  areGoogleAutocompleteResultsStrong("7 Glen M", ni7Gl),
  false,
  "Glenavy-style hits must not count as Glen M...",
);

// One close street-line match is strong enough; a lone vague hit is not.
assert.equal(
  areGoogleAutocompleteResultsStrong("7 Glen M", [suggestion("7 Glen Manor", "Bangor")]),
  false,
  "a bare Glen Manor locality must not block the Glen M street fallback",
);
assert.equal(
  areGoogleAutocompleteResultsStrong("7 Glen M", glenManor),
  true,
  "Glen Manor Road already covers Glen + M plus a street-type continuation",
);
assert.equal(
  areGoogleAutocompleteResultsStrong("7 Glen Manor", glenManor),
  true,
  "Autocomplete already returned Glen Manor — skip a second Places call",
);
assert.equal(areGoogleAutocompleteResultsStrong("7 Glen Manor R", glenManor), true);
assert.equal(areGoogleAutocompleteResultsStrong("7 Glen Manor Road", glenManor), true);
assert.equal(
  areGoogleAutocompleteResultsStrong("7 Glen Manor Road, Newtownabbey", glenManor),
  true,
  "exact match plus typed locality is strong enough to skip Text Search",
);
assert.equal(
  areGoogleAutocompleteResultsStrong("7 Glen Manor", [suggestion("7 Glen", "Dublin")]),
  false,
  "a short/partial street hit is not a close match",
);

assert.equal(extractTypedLocalityHint("7 Glen Manor"), null);
assert.equal(extractTypedLocalityHint("7 Glen Manor Road, Newtownabbey"), "Newtownabbey");
assert.equal(areGoogleAutocompleteResultsStrong("7 Glen Manor", []), false);
assert.equal(
  areGoogleAutocompleteResultsStrong("Europa Hotel", [suggestion("Europa Hotel", "Belfast")]),
  true,
  "an exact label match is strong even when the list is short",
);
assert.equal(
  areGoogleAutocompleteResultsStrong("Eur", [suggestion("Europa Hotel", "Belfast")]),
  false,
  "a short prefix with one hotel hit stays weak; establishment fallback remains empty-only",
);

const rankedManor = rankAddressSuggestions(glenManorRankList, "7 Glen Manor", "BFS");
assert.equal(
  rankedManor[0]?.mainText,
  "7 Glen Manor Road",
  "fuller Glen Manor Road + Belfast bias must beat a bare Glen Manor locality",
);
assert.ok(
  rankedManor.findIndex((item) => item.mainText === "7 Glen Manor Road") <= 1,
  "7 Glen Manor Road, Newtownabbey must be 1st or 2nd for 7 Glen Manor",
);
assert.ok(
  rankedManor.findIndex((item) => item.mainText === "7 Glen Manor Road") <
    rankedManor.findIndex((item) => item.mainText === "7 Glen Manor"),
  "Glen Manor Road must rank above the shorter Bangor Glen Manor label",
);

const rankedGlenM = rankAddressSuggestions(
  [...glenManorLoose, ...glenManorRankList],
  "7 Glen M",
  "BFS",
);
assert.match(
  rankedGlenM[0]?.mainText ?? "",
  /Glen Manor/i,
  "7 Glen M must narrow toward Glen Manor-type results",
);
assert.ok(
  rankedGlenM.findIndex((item) => /Glenavy/i.test(item.mainText)) >
    rankedGlenM.findIndex((item) => /Glen Manor/i.test(item.mainText)),
  "typing Glen M must not keep loosely related Glenavy ahead of Glen Manor",
);

const shared = readFileSync(join(import.meta.dirname, "../shared/google-places.ts"), "utf8");
const worker = readFileSync(
  join(import.meta.dirname, "../workers/addresses/shared/google-places.ts"),
  "utf8",
);
assert.equal(shared, worker, "worker google-places copy must stay identical to shared/");

console.log("check-address-autocomplete-quality: ok");
