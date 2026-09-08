/**
 * Autocomplete quality helpers: weak primary results must still allow one
 * street fallback, without restoring parallel Places fan-out.
 *
 * Run: npx tsx scripts/check-address-autocomplete-quality.ts
 */
import assert from "node:assert/strict";
import {
  areGoogleAutocompleteResultsStrong,
  extractTypedLocalityHint,
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

const glenManor = [
  suggestion("7 Glen Manor Road", "Newtownabbey BT36 7FU", "ChIJGlenManor"),
];

// Partial prefixes with only Dublin Autocomplete hits are weak once "Manor" is typed.
assert.equal(areGoogleAutocompleteResultsStrong("7 G", dublin7Gl), true);
assert.equal(areGoogleAutocompleteResultsStrong("7 Gl", dublin7Gl), true);
assert.equal(
  areGoogleAutocompleteResultsStrong("7 Glen", dublin7Gl),
  true,
  "Glen-prefixed Dublin streets still cover the Glen token",
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

// One close street-line match is strong enough; a lone vague hit is not.
assert.equal(
  areGoogleAutocompleteResultsStrong("7 Glen Manor", glenManor),
  true,
  "Autocomplete already returned Glen Manor — skip a second Places call",
);
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

console.log("check-address-autocomplete-quality: ok");
