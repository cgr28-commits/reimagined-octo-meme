/**
 * Knockagh Terrace / manual premises lookup.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/check-manual-address.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  endpointAllowsAutomaticFare,
  isUnverifiedManualPlaceId,
  parseManualServiceAddress,
  providerRecordMatchesTypedAddress,
  selectMatchingPremises,
  typedStreetTokensCovered,
  unverifiedManualPlaceId,
} from "../shared/manual-address";
import { resolveRoutePointWithPlaceId } from "../shared/route-metrics-resolver";

async function main() {
const knockagh =
  "7 Knockagh Terrace, Upper Road, Greenisland, BT38 8RN";
const knockaghAlt =
  "7 Knockagh Terrace, Greenisland, Carrickfergus, BT38 8RN";

const upper = parseManualServiceAddress(knockagh);
assert.ok(upper);
assert.equal(upper.houseNumber, "7");
assert.equal(upper.street, "Knockagh Terrace");
assert.equal(upper.dependentStreet, "Upper Road");
assert.equal(upper.town, "Greenisland");
assert.equal(upper.postcode, "BT38 8RN");
assert.match(upper.formatted, /Upper Road/);
assert.match(upper.formatted, /Knockagh Terrace/);
assert.match(upper.formatted, /BT38 8RN/);

const alt = parseManualServiceAddress(knockaghAlt);
assert.ok(alt);
assert.equal(alt.houseNumber, "7");
assert.equal(alt.street, "Knockagh Terrace");
assert.equal(alt.locality, "Greenisland");
assert.equal(alt.town, "Carrickfergus");
assert.equal(alt.postcode, "BT38 8RN");
assert.match(alt.formatted, /Greenisland/);
assert.match(alt.formatted, /Carrickfergus/);

assert.equal(parseManualServiceAddress("BT38 8RN"), null);
assert.equal(parseManualServiceAddress("7 Knockagh Terrace"), null);
assert.equal(parseManualServiceAddress("Knockagh Terrace"), null);
assert.equal(parseManualServiceAddress("Knockagh Terrace, Carrickfergus"), null);
assert.equal(parseManualServiceAddress("Belfast International Airport"), null);

const belfast = parseManualServiceAddress("12 High Street, Belfast, BT1 1AA");
assert.ok(belfast);
assert.equal(belfast.houseNumber, "12");
assert.equal(belfast.street, "High Street");
assert.equal(belfast.town, "Belfast");
assert.equal(belfast.postcode, "BT1 1AA");

assert.equal(typedStreetTokensCovered("7 Knockagh Terrace", "7 Upper Road, Greenisland"), false);
assert.equal(
  typedStreetTokensCovered(knockagh, "7 Knockagh Terrace, Upper Road, Greenisland, BT38 8RN"),
  true,
);

const premises = [
  ...Array.from({ length: 12 }, (_, index) => ({
    label: `${index + 1} Other Street, Carrickfergus, BT38 8RN`,
    mainText: `${index + 1} Other Street`,
  })),
  {
    label: "7 Knockagh Terrace, Upper Road, Greenisland, Carrickfergus, BT38 8RN",
    mainText: "7 Knockagh Terrace",
  },
];
const matched = selectMatchingPremises(knockaghAlt, premises, 8);
assert.equal(matched.length, 1);
assert.match(matched[0]?.label ?? "", /Knockagh Terrace/);

const postcodeList = selectMatchingPremises("BT38 8RN", premises, 8);
assert.ok(postcodeList.length > 8, "a postcode list must not stop at 8 and hide later doors");
assert.ok(postcodeList.some((item) => /Knockagh Terrace/.test(item.label)));

assert.equal(
  providerRecordMatchesTypedAddress(knockagh, {
    formattedAddress: "7 Upper Road, Greenisland, BT38 8RN",
    streetNumber: "7",
    route: "Upper Road",
    postcode: "BT38 8RN",
  }),
  false,
);
assert.equal(
  providerRecordMatchesTypedAddress(knockagh, {
    formattedAddress: "7 Knockagh Terrace, Upper Road, Greenisland, Carrickfergus, BT38 8RN",
    streetNumber: "7",
    route: "Knockagh Terrace",
    postcode: "BT38 8RN",
  }),
  true,
);
assert.equal(
  providerRecordMatchesTypedAddress(knockagh, {
    formattedAddress: "Knockagh Terrace, Greenisland, BT38 8RN",
    streetNumber: null,
    route: "Knockagh Terrace",
    postcode: "BT38 8RN",
  }),
  false,
  "a street centroid without the typed door is not a verified premises",
);

const unverifiedId = unverifiedManualPlaceId(knockagh);
assert.equal(isUnverifiedManualPlaceId(unverifiedId), true);
assert.equal(endpointAllowsAutomaticFare(unverifiedId, knockagh), false);
assert.equal(endpointAllowsAutomaticFare("", knockagh), false);
assert.equal(endpointAllowsAutomaticFare("ChIJreal", knockagh), true);
assert.equal(endpointAllowsAutomaticFare("", "Belfast International Airport"), true);

let geocodeCalls = 0;
const blocked = await resolveRoutePointWithPlaceId({
  address: knockagh,
  placeId: unverifiedId,
  geocode: async () => {
    geocodeCalls += 1;
    return { lat: 54.702759, lng: -5.880643 };
  },
});
assert.equal(blocked.point, null);
assert.equal(geocodeCalls, 0);

const blockedWithoutId = await resolveRoutePointWithPlaceId({
  address: knockaghAlt,
  placeId: "",
  geocode: async () => {
    geocodeCalls += 1;
    return { lat: 54.702759, lng: -5.880643 };
  },
});
assert.equal(blockedWithoutId.point, null);
assert.equal(geocodeCalls, 0);

const root = join(import.meta.dirname, "..");
const worker = readFileSync(join(root, "workers/addresses/src/index.ts"), "utf8");
const purePostcode = worker.slice(worker.indexOf("const isPureNiPostcode"));
const getAddressPremises = purePostcode.indexOf("searchGetAddress(env.GETADDRESS_API_KEY, query, airportCode)");
const askForNumber = purePostcode.indexOf("needsHouseNumber: true");
assert.ok(getAddressPremises > 0 && getAddressPremises < askForNumber);

const quote = readFileSync(join(root, "workers/addresses/src/quote-handlers.ts"), "utf8");
const payment = worker;
assert.match(quote, /address_unverified/);
assert.match(payment, /address_unverified/);
assert.match(readFileSync(join(root, "src/components/AddressInput.tsx"), "utf8"), /data-use-typed-address/);
assert.match(
  readFileSync(join(root, "src/components/ManualAddressQuoteNotice.tsx"), "utf8"),
  /manualAddressQuoteWhatsAppUrl/,
);

console.log("check-manual-address: ok");
}

void main();
