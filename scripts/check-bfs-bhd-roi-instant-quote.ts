/**
 * BFS/BHD ↔ Republic of Ireland instant quote eligibility + NI fare regression.
 *
 * Pricing formulas are NOT changed — only geographical eligibility.
 * NI fixtures lock calculateQuote amounts for representative journeys.
 *
 * Run: npx tsx scripts/check-bfs-bhd-roi-instant-quote.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isBelfastAirportRoiInstantJourney,
  isRepublicOfIrelandJourney,
  needsManualQuoteApproval,
  quickSelectToPlace,
  type SelectedPlace,
} from "../src/lib/selected-place";
import { calculateQuote } from "../src/lib/quote";
import { calculateUniversalJourneyFareGbp, universalDrivingMilesFromKm } from "../shared/universal-distance-pricing";
import { composeFareWithExpressDropOff, resolveExpressDropOff } from "../shared/express-drop-off";
import { getPaymentBookingBlockers } from "../shared/paid-booking-gate";
import { SALOON_VEHICLE, ESTATE_VEHICLE } from "../src/lib/vehicle-selection";

const root = process.cwd();
let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

function place(
  partial: Partial<SelectedPlace> & Pick<SelectedPlace, "formattedAddress">,
): SelectedPlace {
  return {
    placeId: partial.placeId ?? `test:${partial.formattedAddress.slice(0, 16)}`,
    formattedAddress: partial.formattedAddress,
    displayAddress: partial.displayAddress ?? partial.formattedAddress,
    placeName: partial.placeName ?? null,
    lat: partial.lat ?? null,
    lng: partial.lng ?? null,
    countryCode: partial.countryCode ?? null,
    postalCode: partial.postalCode ?? null,
    streetNumber: partial.streetNumber ?? "1",
    route: partial.route ?? null,
    locality: partial.locality ?? null,
    administrativeArea: partial.administrativeArea ?? null,
  };
}

function metrics(distanceKm: number, durationMinutes = 60) {
  return {
    distanceKm,
    durationMinutes,
    source: "osrm" as const,
  };
}

const bfs = quickSelectToPlace("BFS")!;
const bhd = quickSelectToPlace("BHD")!;
const dub = quickSelectToPlace("DUB")!;
const ldy = quickSelectToPlace("LDY")!;
assert.ok(bfs && bhd && dub && ldy);

const belfastCityHall = place({
  placeId: "belfast-city-hall",
  formattedAddress: "City Hall, Belfast BT1 5GS, UK",
  countryCode: "GB",
  postalCode: "BT1 5GS",
  streetNumber: null,
  placeName: "Belfast City Hall",
  lat: 54.5967,
  lng: -5.9301,
});

const derryCity = place({
  placeId: "derry-city",
  formattedAddress: "1 Guildhall Square, Derry BT48 6BJ, Northern Ireland",
  countryCode: "GB",
  postalCode: "BT48 6BJ",
  lat: 54.997,
  lng: -7.321,
});

const newry = place({
  placeId: "newry",
  formattedAddress: "12 Hill Street, Newry BT34 1AR, Northern Ireland",
  countryCode: "GB",
  postalCode: "BT34 1AR",
  lat: 54.175,
  lng: -6.34,
});

const bangor = place({
  placeId: "bangor",
  formattedAddress: "12 Main Street, Bangor BT20 5AF, Northern Ireland",
  countryCode: "GB",
  postalCode: "BT20 5AF",
  lat: 54.663,
  lng: -5.668,
});

const roiPlaces = {
  dundalk: place({
    placeId: "dundalk",
    formattedAddress: "Clanbrassil Street, Dundalk, A91, Ireland",
    countryCode: "IE",
    postalCode: "A91",
    lat: 54.003,
    lng: -6.405,
  }),
  drogheda: place({
    placeId: "drogheda",
    formattedAddress: "West Street, Drogheda, A92, Ireland",
    countryCode: "IE",
    postalCode: "A92",
    lat: 53.717,
    lng: -6.35,
  }),
  dublin: place({
    placeId: "dublin-city",
    formattedAddress: "1 Grafton Street, Dublin, D02 HX96, Ireland",
    countryCode: "IE",
    postalCode: "D02 HX96",
    lat: 53.342,
    lng: -6.26,
  }),
  letterkenny: place({
    placeId: "letterkenny",
    formattedAddress: "Main Street, Letterkenny, F92, Ireland",
    countryCode: "IE",
    postalCode: "F92",
    lat: 54.95,
    lng: -7.734,
  }),
  sligo: place({
    placeId: "sligo",
    formattedAddress: "O'Connell Street, Sligo, F91, Ireland",
    countryCode: "IE",
    postalCode: "F91",
    lat: 54.27,
    lng: -8.475,
  }),
  galway: place({
    placeId: "galway",
    formattedAddress: "Shop Street, Galway, H91, Ireland",
    countryCode: "IE",
    postalCode: "H91",
    lat: 53.274,
    lng: -9.049,
  }),
  limerick: place({
    placeId: "limerick",
    formattedAddress: "O'Connell Street, Limerick, V94, Ireland",
    countryCode: "IE",
    postalCode: "V94",
    lat: 52.664,
    lng: -8.626,
  }),
  cork: place({
    placeId: "cork",
    formattedAddress: "Patrick Street, Cork, T12, Ireland",
    countryCode: "IE",
    postalCode: "T12",
    lat: 51.8985,
    lng: -8.4756,
  }),
} as const;

console.log("=== NI fare regression fixtures (existing engine, unchanged formulas) ===\n");

/** Locked amounts from calculateQuote — must not drift after eligibility change. */
const NI_FIXTURES: Array<{
  name: string;
  address: string;
  airport: "BFS" | "BHD";
  fromAirport: boolean;
  vehicle: typeof SALOON_VEHICLE | typeof ESTATE_VEHICLE;
  distanceKm: number;
  expectedAmount: number;
  weekday?: boolean;
}> = [
  {
    name: "BFS → Belfast City Hall ~20 mi Saloon",
    address: belfastCityHall.formattedAddress,
    airport: "BFS",
    fromAirport: true,
    vehicle: SALOON_VEHICLE,
    distanceKm: 20 * 1.609344,
    expectedAmount: 59,
  },
  {
    name: "Belfast City Hall → BFS ~20 mi Estate",
    address: belfastCityHall.formattedAddress,
    airport: "BFS",
    fromAirport: false,
    vehicle: ESTATE_VEHICLE,
    distanceKm: 20 * 1.609344,
    expectedAmount: 65,
  },
  {
    name: "BHD → Belfast City Hall ~4 mi Saloon",
    address: belfastCityHall.formattedAddress,
    airport: "BHD",
    fromAirport: true,
    vehicle: SALOON_VEHICLE,
    distanceKm: 4 * 1.609344,
    expectedAmount: 30,
  },
  {
    name: "Belfast → BHD ~4 mi Estate",
    address: belfastCityHall.formattedAddress,
    airport: "BHD",
    fromAirport: false,
    vehicle: ESTATE_VEHICLE,
    distanceKm: 4 * 1.609344,
    expectedAmount: 36,
  },
  {
    name: "BFS → Derry ~70 mi Saloon weekday",
    address: derryCity.formattedAddress,
    airport: "BFS",
    fromAirport: true,
    vehicle: SALOON_VEHICLE,
    distanceKm: 70 * 1.609344,
    expectedAmount: 166,
  },
  {
    name: "BHD → Newry ~38 mi Saloon",
    address: newry.formattedAddress,
    airport: "BHD",
    fromAirport: true,
    vehicle: SALOON_VEHICLE,
    distanceKm: 38 * 1.609344,
    expectedAmount: 94,
  },
  {
    name: "Newry → BHD ~38 mi Estate",
    address: newry.formattedAddress,
    airport: "BHD",
    fromAirport: false,
    vehicle: ESTATE_VEHICLE,
    distanceKm: 38 * 1.609344,
    expectedAmount: 100,
  },
];

for (const fixture of NI_FIXTURES) {
  check(fixture.name, () => {
    const quote = calculateQuote(
      fixture.address,
      fixture.airport,
      fixture.vehicle,
      false,
      {},
      metrics(fixture.distanceKm),
      fixture.fromAirport,
    );
    assert.ok(quote, "quote must resolve");
    assert.equal(quote!.amount, fixture.expectedAmount);
  });
}

check("Estate remains +£6 vs Saloon on same miles (existing relationship)", () => {
  const miles = 25;
  const km = miles / 0.621371;
  const s = calculateQuote(belfastCityHall.formattedAddress, "BFS", SALOON_VEHICLE, false, {}, metrics(km), false)!;
  const e = calculateQuote(belfastCityHall.formattedAddress, "BFS", ESTATE_VEHICLE, false, {}, metrics(km), false)!;
  assert.equal(e.amount - s.amount, 6);
});

check("Express Drop-Off remains a separate add-on (not folded into formula)", () => {
  const journey = 50;
  const resolved = resolveExpressDropOff({
    airportCode: "BHD",
    selected: true,
  });
  assert.equal(resolved.feeGbp, 4);
  const withExpress = composeFareWithExpressDropOff({
    transferFareGbp: journey,
    expressDropOffFeeGbp: resolved.feeGbp,
  });
  assert.equal(withExpress.expressDropOffFeeGbp, 4);
  assert.equal(withExpress.totalGbp, 54);
});

check("Missing OSRM metrics → no invented fare (null)", () => {
  assert.equal(
    calculateQuote(belfastCityHall.formattedAddress, "BFS", SALOON_VEHICLE, false, {}, null, false),
    null,
  );
});

console.log("\n=== BFS/BHD ↔ ROI eligibility (instant) ===\n");

for (const [name, roi] of Object.entries(roiPlaces)) {
  check(`BFS → ${name}: instant (not manual)`, () => {
    assert.equal(isRepublicOfIrelandJourney(bfs, roi), true);
    assert.equal(isBelfastAirportRoiInstantJourney(bfs, roi), true);
    assert.equal(needsManualQuoteApproval(bfs, roi), false);
  });
  check(`${name} → BFS: instant (not manual)`, () => {
    assert.equal(isBelfastAirportRoiInstantJourney(roi, bfs), true);
    assert.equal(needsManualQuoteApproval(roi, bfs), false);
  });
  check(`BHD → ${name}: instant (not manual)`, () => {
    assert.equal(isBelfastAirportRoiInstantJourney(bhd, roi), true);
    assert.equal(needsManualQuoteApproval(bhd, roi), false);
  });
  check(`${name} → BHD: instant (not manual)`, () => {
    assert.equal(isBelfastAirportRoiInstantJourney(roi, bhd), true);
    assert.equal(needsManualQuoteApproval(roi, bhd), false);
  });
}

check("Sample ROI fares use existing universal curve (not hard-coded)", () => {
  // Representative distances only — same calculateQuote path as NI.
  const samples: Array<{ label: string; airport: "BFS" | "BHD"; km: number }> = [
    { label: "Dundalk", airport: "BFS", km: 90 },
    { label: "Dublin", airport: "BHD", km: 170 },
    { label: "Cork", airport: "BFS", km: 420 },
    { label: "Galway", airport: "BHD", km: 320 },
  ];
  for (const sample of samples) {
    const quote = calculateQuote(
      roiPlaces.dublin.formattedAddress,
      sample.airport,
      SALOON_VEHICLE,
      false,
      {},
      metrics(sample.km),
      true,
    );
    assert.ok(quote);
    const miles = universalDrivingMilesFromKm(sample.km);
    const expected = calculateUniversalJourneyFareGbp(miles, SALOON_VEHICLE).journeyFareGbp;
    assert.equal(quote!.journeyFareGbp, expected);
    console.log(`    ${sample.airport}↔${sample.label} @ ${sample.km} km → £${quote!.amount}`);
  }
});

check("Saloon/Estate relationship holds on ROI distance", () => {
  const km = 200;
  const s = calculateQuote(roiPlaces.cork.formattedAddress, "BFS", SALOON_VEHICLE, false, {}, metrics(km), true)!;
  const e = calculateQuote(roiPlaces.cork.formattedAddress, "BFS", ESTATE_VEHICLE, false, {}, metrics(km), true)!;
  assert.equal(e.amount - s.amount, 6);
});

console.log("\n=== Still blocked (must not accidentally unlock) ===\n");

check("Bangor (GB) → Cork remains manual", () => {
  assert.equal(needsManualQuoteApproval(bangor, roiPlaces.cork), true);
  assert.equal(isBelfastAirportRoiInstantJourney(bangor, roiPlaces.cork), false);
});

check("Dublin city ↔ Belfast address remains personalised A2A (no airport)", () => {
  assert.equal(needsManualQuoteApproval(belfastCityHall, roiPlaces.dublin), true);
});

check("Cork ↔ Galway (ROI↔ROI) remains manual", () => {
  assert.equal(needsManualQuoteApproval(roiPlaces.cork, roiPlaces.galway), true);
  assert.equal(isBelfastAirportRoiInstantJourney(roiPlaces.cork, roiPlaces.galway), false);
});

check("LDY ↔ Cork remains manual (not BFS/BHD corridor)", () => {
  assert.equal(isBelfastAirportRoiInstantJourney(ldy, roiPlaces.cork), false);
  assert.equal(needsManualQuoteApproval(ldy, roiPlaces.cork), true);
});

check("DUB airport ↔ Belfast stays instant (unchanged)", () => {
  assert.equal(needsManualQuoteApproval(belfastCityHall, dub), false);
  assert.equal(needsManualQuoteApproval(dub, belfastCityHall), false);
});

check("BFS ↔ BHD airport-to-airport is not the ROI instant helper", () => {
  assert.equal(isBelfastAirportRoiInstantJourney(bfs, bhd), false);
});

check("Payment gate: incomplete booking still blocked (no invented checkout)", () => {
  const blockers = getPaymentBookingBlockers({
    customerName: "",
    customerEmail: "",
    mobileNumber: "",
    tripDate: "",
    tripTime: "",
  });
  assert.ok(blockers.length > 0);
});

console.log("\n=== Source guards (no fare formula edits in this change) ===\n");

check("selected-place eligibility only; quote.ts formula untouched in this PR scope", () => {
  const selected = readFileSync(join(root, "src/lib/selected-place.ts"), "utf8");
  assert.match(selected, /isBelfastAirportRoiInstantJourney/);
  assert.match(selected, /BFS\/BHD ↔ Republic of Ireland address/);
  const quote = readFileSync(join(root, "src/lib/quote.ts"), "utf8");
  // Engine still uses universal distance curve — no ROI-specific fare branch.
  assert.match(quote, /calculateUniversalJourneyFareGbp/);
  assert.doesNotMatch(quote, /isBelfastAirportRoiInstantJourney/);
  assert.doesNotMatch(quote, /ROI_FARE|roiFare|republicOfIrelandFare/i);
});

check("QuoteCard excludes BFS/BHD ROI from manual ROI banner", () => {
  const card = readFileSync(join(root, "src/components/QuoteCard.tsx"), "utf8");
  assert.match(card, /isBelfastAirportRoiInstantJourney/);
  assert.match(
    card,
    /isRepublicOfIrelandJourney\(pickupPlace, dropoffPlace\)[\s\S]*!isBelfastAirportRoiInstantJourney/,
  );
});

console.log(`\nAll ${passed} BFS/BHD↔ROI instant-quote checks passed.`);
