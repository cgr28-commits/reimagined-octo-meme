/**
 * Belfast airport address lookup: NI preferred, ROI allowed, GB mainland blocked.
 *
 * Run: npx tsx scripts/check-belfast-airport-island-lookup.ts
 */
import assert from "node:assert/strict";
import {
  airportLookupAllowsRepublicOfIreland,
  isAddressAllowedForAirport,
  isAllowedAutocompleteLabel,
  isAllowedCoordinates,
} from "../shared/address-validation";
import {
  getPlacesLocationBiasForTests,
  getPlacesLocationRestrictionForTests,
  getPlacesRegionCodesForTests,
} from "../shared/google-places";

function expectAllow(label: string, code: string) {
  assert.equal(isAllowedAutocompleteLabel(label, code), true, `allow [${code}] ${label}`);
}

function expectBlock(label: string, code: string) {
  assert.equal(isAllowedAutocompleteLabel(label, code), false, `block [${code}] ${label}`);
}

for (const code of ["BFS", "BHD"] as const) {
  assert.equal(airportLookupAllowsRepublicOfIreland(code), true);
  assert.deepEqual(getPlacesRegionCodesForTests(code), ["gb", "ie"]);

  const bias = getPlacesLocationBiasForTests(code) as {
    circle?: { radius?: number; center?: { latitude?: number; longitude?: number } };
    rectangle?: unknown;
  };
  assert.ok(bias?.circle, `${code} Autocomplete must use a Belfast ranking circle`);
  assert.equal(bias.circle?.radius, 50_000);
  assert.ok(!bias.rectangle, `${code} Autocomplete must not use a hard rectangle fence`);

  const restriction = getPlacesLocationRestrictionForTests(code) as {
    rectangle?: { low?: { latitude?: number }; high?: { latitude?: number } };
  };
  assert.ok(restriction.rectangle, `${code} Text Search may use an island rectangle`);
  assert.ok(
    (restriction.rectangle?.low?.latitude ?? 99) <= 51.5,
    `${code} Text Search fence must include ROI, not NI-only 54°N`,
  );
}

assert.equal(airportLookupAllowsRepublicOfIreland("A2A"), true);
assert.equal(airportLookupAllowsRepublicOfIreland("DUB"), true);
assert.equal(airportLookupAllowsRepublicOfIreland("LDY"), false);

const niLabels = [
  "7 Glen Manor Road, Newtownabbey BT36 7FU",
  "7 Glen Manor, Newtownabbey",
  "High Street, Belfast BT1",
];
const roiLabels = [
  "Grafton Street, Dublin, Ireland",
  "Letterkenny, Co. Donegal, Ireland",
  "Clanbrassil Street, Dundalk, Co. Louth",
];
const mainlandLabels = [
  "Oxford Street, London, England",
  "Buchanan Street, Glasgow, Scotland",
  "Cardiff Bay, Cardiff, Wales",
];

for (const code of ["BFS", "BHD", "DUB", "A2A"] as const) {
  for (const label of niLabels) expectAllow(label, code);
  for (const label of roiLabels) expectAllow(label, code);
  for (const label of mainlandLabels) expectBlock(label, code);
}

assert.equal(
  isAddressAllowedForAirport("BFS", {
    country: "Ireland",
    county: "Donegal",
    town: "Letterkenny",
    displayName: "Letterkenny, Co. Donegal, Ireland",
  }),
  true,
);
assert.equal(
  isAddressAllowedForAirport("BHD", {
    country: "Ireland",
    city: "Dundalk",
    displayName: "Clanbrassil Street, Dundalk",
  }),
  true,
);
assert.equal(
  isAddressAllowedForAirport("BFS", {
    state: "England",
    country: "United Kingdom",
    displayName: "Oxford Street, London",
    lat: 51.51,
    lng: -0.13,
  }),
  false,
);

assert.equal(isAllowedCoordinates("BFS", 54.68, -5.91), true, "Newtownabbey");
assert.equal(isAllowedCoordinates("BFS", 53.35, -6.26), true, "Dublin");
assert.equal(isAllowedCoordinates("BHD", 55.03, -7.65), true, "Letterkenny / Donegal");
assert.equal(isAllowedCoordinates("BFS", 54.0, -6.4), true, "Dundalk area");
assert.equal(isAllowedCoordinates("BFS", 51.51, -0.13), false, "London");
assert.equal(isAllowedCoordinates("BFS", 55.86, -4.25), false, "Glasgow");

console.log("check-belfast-airport-island-lookup: ok");
