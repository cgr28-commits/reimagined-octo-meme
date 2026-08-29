/**
 * Global pricing engine — 15+ ordinary journeys (including non-benchmarks).
 * Proves fares generalise from universal distance pricing, not hard-coded town pairs.
 * Run: npx tsx scripts/check-global-pricing-routes.ts
 */

import assert from "node:assert/strict";
import { PRICING_CONFIG } from "../src/lib/pricing-config";
import {
  calculateDublinCityBeyondAirportQuote,
  calculatePointToPointQuote,
  calculateQuote,
} from "../src/lib/quote";
import {
  ESTATE_VEHICLE,
  SALOON_VEHICLE,
  selectVehicleForParty,
} from "../src/lib/vehicle-selection";
import {
  calculateUniversalEstateJourneyFareGbp,
  calculateUniversalSaloonJourneyFareGbp,
  universalDrivingMilesFromKm,
} from "../shared/universal-distance-pricing";

const S = SALOON_VEHICLE;
const E = ESTATE_VEHICLE;

function metricsForMiles(miles: number, durationMinutes = 40) {
  return { distanceKm: miles / 0.621371, durationMinutes };
}

type Row = {
  label: string;
  kind: string;
  miles: number;
  saloon: number;
  estate: number;
  benchmark?: string;
};

const rows: Row[] = [];

function add(
  label: string,
  kind: string,
  miles: number,
  saloon: number | null | undefined,
  estate: number | null | undefined,
  benchmark?: string,
) {
  assert.ok(saloon && estate, `${label} must produce saloon and estate fares`);
  assert.ok(estate >= saloon, `${label}: estate must be >= saloon`);
  rows.push({ label, kind, miles, saloon, estate, benchmark });
  console.log(
    `${label.padEnd(42)} ${kind.padEnd(10)} ${String(miles).padStart(5)} mi   S £${saloon}  E £${estate}${benchmark ? `  [${benchmark}]` : ""}`,
  );
}

console.log("=== Global pricing sample (15+ journeys) ===\n");

assert.equal(PRICING_CONFIG.universalDistancePricing?.enabled, true);

// 1 Short local A2A
add(
  "Belfast centre → Lisburn",
  "A2A",
  10,
  calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "1 Market Square, Lisburn BT28 1XN",
    S,
    false,
    {},
    { distanceKm: 15.5, durationMinutes: 15 },
  )?.amount,
  calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "1 Market Square, Lisburn BT28 1XN",
    E,
    false,
    {},
    { distanceKm: 15.5, durationMinutes: 15 },
  )?.amount,
);

// 2 Short BHD airport (~4.5 mi → S£31 E£37)
{
  const m = metricsForMiles(4.5, 12);
  const expectedS = calculateUniversalSaloonJourneyFareGbp(4.5);
  const expectedE = calculateUniversalEstateJourneyFareGbp(expectedS);
  assert.equal(expectedS, 31);
  assert.equal(expectedE, 37);
  const s = calculateQuote("Belfast City Hall, Belfast BT1 5GS", "BHD", S, false, {}, m)?.amount;
  const e = calculateQuote("Belfast City Hall, Belfast BT1 5GS", "BHD", E, false, {}, m)?.amount;
  assert.equal(s, expectedS);
  assert.equal(e, expectedE);
  add("City Hall → BHD", "airport", 4.5, s, e, "universal £31/£37");
}

// 3 Lisburn → BHD (must scale above city)
{
  const m = metricsForMiles(12, 22);
  const s = calculateQuote("1 Market Square, Lisburn BT28 1XN", "BHD", S, false, {}, m)?.amount;
  const e = calculateQuote("1 Market Square, Lisburn BT28 1XN", "BHD", E, false, {}, m)?.amount;
  const city = calculateUniversalSaloonJourneyFareGbp(4.5);
  add("Lisburn → BHD", "airport", 12, s, e);
  assert.ok((s ?? 0) >= city, "Lisburn→BHD must be at least City Hall→BHD");
  assert.equal(s, calculateUniversalSaloonJourneyFareGbp(12));
  assert.equal((e ?? 0) - (s ?? 0), 6);
}

// 4 BFS city (14 mi → S£48 E£54)
{
  const m = metricsForMiles(14, 25);
  const expectedS = calculateUniversalSaloonJourneyFareGbp(14);
  const expectedE = calculateUniversalEstateJourneyFareGbp(expectedS);
  assert.equal(expectedS, 48);
  assert.equal(expectedE, 54);
  const s = calculateQuote("Belfast City Hall, Belfast BT1 5GS", "BFS", S, false, {}, m)?.amount;
  const e = calculateQuote("Belfast City Hall, Belfast BT1 5GS", "BFS", E, false, {}, m)?.amount;
  assert.equal(s, expectedS);
  assert.equal(e, expectedE);
  add("City Hall → BFS", "airport", 14, s, e, "universal £48/£54");
}

// 5 Bangor → BFS
{
  const bangorM = metricsForMiles(20, 35);
  const cityM = metricsForMiles(14, 25);
  const s = calculateQuote("1 Main Street, Bangor BT20 5AF", "BFS", S, false, {}, bangorM)?.amount;
  const city = calculateQuote("Belfast City Hall, Belfast BT1 5GS", "BFS", S, false, {}, cityM)?.amount;
  add(
    "Bangor → BFS",
    "airport",
    20,
    s,
    calculateQuote("1 Main Street, Bangor BT20 5AF", "BFS", E, false, {}, bangorM)?.amount,
  );
  assert.ok((s ?? 0) >= (city ?? 0), "Bangor→BFS should be >= city→BFS");
  assert.equal((s ?? 0), calculateUniversalSaloonJourneyFareGbp(20));
}

// 6 Newtownabbey → DUB
{
  const m = metricsForMiles(100, 120);
  const journey = calculateUniversalSaloonJourneyFareGbp(100);
  const s = calculateQuote("Glengormley, Newtownabbey BT36 7QU", "DUB", S, false, {}, m)?.amount;
  const e = calculateQuote("Glengormley, Newtownabbey BT36 7QU", "DUB", E, false, {}, m)?.amount;
  assert.equal(s, journey + 4);
  assert.equal(e, calculateUniversalEstateJourneyFareGbp(journey) + 4);
  assert.equal((e ?? 0) - (s ?? 0), 6);
  add("Newtownabbey → DUB", "airport", 100, s, e);
}

// 7 City → DUB (98 mi → journey £230 + £4 = £234 / estate £240)
{
  const m = metricsForMiles(98, 115);
  const journey = calculateUniversalSaloonJourneyFareGbp(98);
  assert.equal(journey, 230);
  const s = calculateQuote("Belfast City Hall, Belfast BT1 5GS", "DUB", S, false, {}, m)?.amount;
  const e = calculateQuote("Belfast City Hall, Belfast BT1 5GS", "DUB", E, false, {}, m)?.amount;
  assert.equal(s, 234);
  assert.equal(e, 240);
  assert.equal((e ?? 0) - (s ?? 0), 6);
  add("City Hall → DUB", "airport", 98, s, e, "universal £234/£240");
}

// 8 Dublin city beyond airport
{
  const metrics = { distanceKm: 168.6, durationMinutes: 119.5 };
  const miles = universalDrivingMilesFromKm(168.6);
  const journeyFloor = calculateUniversalSaloonJourneyFareGbp(miles);
  const s = calculateDublinCityBeyondAirportQuote(
    "Belfast City Hall, Belfast BT1 5GS",
    S,
    metrics,
  )?.amount;
  const e = calculateDublinCityBeyondAirportQuote(
    "Belfast City Hall, Belfast BT1 5GS",
    E,
    metrics,
  )?.amount;
  add("City Hall → Dublin city centre", "DUB+", Math.round(miles), s, e);
  // Beyond-airport continues past the DUB airport journey (230 + fixed path).
  assert.ok((s ?? 0) > 230 + 4, `Dublin city beyond must exceed DUB airport drop (£234), got £${s}`);
  assert.ok((e ?? 0) > (s ?? 0));
  assert.ok((s ?? 0) >= journeyFloor);
}

// 9 Medium NI — Newry
{
  const metrics = { distanceKm: 59.9, durationMinutes: 46 };
  const miles = universalDrivingMilesFromKm(59.9);
  const expectedS = calculateUniversalSaloonJourneyFareGbp(miles);
  const expectedE = calculateUniversalEstateJourneyFareGbp(expectedS);
  const s = calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "1 Marcus Square, Newry BT35 8DQ",
    S,
    false,
    {},
    metrics,
  )?.amount;
  const e = calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "1 Marcus Square, Newry BT35 8DQ",
    E,
    false,
    {},
    metrics,
  )?.amount;
  assert.equal(s, expectedS);
  assert.equal(e, expectedE);
  add("City Hall → Newry", "A2A", Math.round(miles), s, e, `universal £${expectedS}/£${expectedE}`);
}

// 10 Carrickfergus → Newry (non-benchmark)
add(
  "Carrickfergus → Newry",
  "A2A",
  48,
  calculatePointToPointQuote(
    "1 Marine Highway, Carrickfergus BT38 8AG",
    "1 Marcus Square, Newry BT35 8DQ",
    S,
    false,
    {},
    { distanceKm: 78, durationMinutes: 65 },
  )?.amount,
  calculatePointToPointQuote(
    "1 Marine Highway, Carrickfergus BT38 8AG",
    "1 Marcus Square, Newry BT35 8DQ",
    E,
    false,
    {},
    { distanceKm: 78, durationMinutes: 65 },
  )?.amount,
);

// 11 Long NI — Derry
{
  const metrics = { distanceKm: 114.1, durationMinutes: 86 };
  const miles = universalDrivingMilesFromKm(114.1);
  const expectedS = calculateUniversalSaloonJourneyFareGbp(miles);
  const expectedE = calculateUniversalEstateJourneyFareGbp(expectedS);
  const s = calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "1 Guildhall Square, Derry BT48 6BJ",
    S,
    false,
    {},
    metrics,
  )?.amount;
  const e = calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "1 Guildhall Square, Derry BT48 6BJ",
    E,
    false,
    {},
    metrics,
  )?.amount;
  assert.equal(s, expectedS);
  assert.equal(e, expectedE);
  add("City Hall → Derry", "A2A", Math.round(miles), s, e, `universal £${expectedS}/£${expectedE}`);
}

// 12 BFS → Derry (airport → town)
{
  const metrics = { distanceKm: 105, durationMinutes: 80 };
  const miles = universalDrivingMilesFromKm(105);
  const expectedS = calculateUniversalSaloonJourneyFareGbp(miles);
  const s = calculateQuote("1 Guildhall Square, Derry BT48 6BJ", "BFS", S, false, {}, metrics)?.amount;
  const e = calculateQuote("1 Guildhall Square, Derry BT48 6BJ", "BFS", E, false, {}, metrics)?.amount;
  assert.equal(s, expectedS);
  assert.equal((e ?? 0) - (s ?? 0), 6);
  add("BFS → Derry", "airport", Math.round(miles), s, e);
}

// 13 Long NI — Enniskillen A2A
{
  const metrics = { distanceKm: 130.2, durationMinutes: 98 };
  const miles = universalDrivingMilesFromKm(130.2);
  const expectedS = calculateUniversalSaloonJourneyFareGbp(miles);
  const expectedE = calculateUniversalEstateJourneyFareGbp(expectedS);
  const s = calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "10 East Bridge Street, Enniskillen, BT74 7AB",
    S,
    false,
    {},
    metrics,
  )?.amount;
  const e = calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "10 East Bridge Street, Enniskillen, BT74 7AB",
    E,
    false,
    {},
    metrics,
  )?.amount;
  assert.equal(s, expectedS);
  assert.equal(e, expectedE);
  add("City Hall → Enniskillen", "A2A", Math.round(miles), s, e, `universal £${expectedS}/£${expectedE}`);
}

// 14 BFS → Enniskillen
{
  const metrics = { distanceKm: 126.5, durationMinutes: 98 };
  const miles = universalDrivingMilesFromKm(126.5);
  const expectedS = calculateUniversalSaloonJourneyFareGbp(miles);
  const s = calculateQuote("10 East Bridge Street, Enniskillen, BT74 7AB", "BFS", S, false, {}, metrics)?.amount;
  const e = calculateQuote("10 East Bridge Street, Enniskillen, BT74 7AB", "BFS", E, false, {}, metrics)?.amount;
  assert.equal(s, expectedS);
  assert.equal((e ?? 0) - (s ?? 0), 6);
  add("BFS → Enniskillen", "airport", Math.round(miles), s, e, "universal distance");
}

// 15 Holywood → Enniskillen (non-benchmark A2A)
add(
  "Holywood → Enniskillen",
  "A2A",
  88,
  calculatePointToPointQuote(
    "22 High Street, Holywood, BT18 9AB",
    "10 East Bridge Street, Enniskillen, BT74 7AB",
    S,
    false,
    {},
    { distanceKm: 139.6, durationMinutes: 106 },
  )?.amount,
  calculatePointToPointQuote(
    "22 High Street, Holywood, BT18 9AB",
    "10 East Bridge Street, Enniskillen, BT74 7AB",
    E,
    false,
    {},
    { distanceKm: 139.6, durationMinutes: 106 },
  )?.amount,
);

// 16 Belfast → Portrush (non-benchmark long coastal)
add(
  "Belfast → Portrush",
  "A2A",
  60,
  calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "1 Main Street, Portrush BT56 8BL",
    S,
    false,
    {},
    { distanceKm: 98, durationMinutes: 80 },
  )?.amount,
  calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "1 Main Street, Portrush BT56 8BL",
    E,
    false,
    {},
    { distanceKm: 98, durationMinutes: 80 },
  )?.amount,
);

// 17 Hotel → airport (Europa → BFS)
{
  const m = metricsForMiles(14, 25);
  const s = calculateQuote("Europa Hotel, Great Victoria Street, Belfast BT2 7BA", "BFS", S, false, {}, m)?.amount;
  const e = calculateQuote("Europa Hotel, Great Victoria Street, Belfast BT2 7BA", "BFS", E, false, {}, m)?.amount;
  assert.equal(s, 48);
  assert.equal(e, 54);
  add("Europa Hotel → BFS", "airport", 14, s, e);
}

// 18 Residential → residential
add(
  "Newtownabbey → Bangor",
  "A2A",
  12,
  calculatePointToPointQuote(
    "Glengormley, Newtownabbey BT36 7QU",
    "1 Main Street, Bangor BT20 5AF",
    S,
    false,
    {},
    { distanceKm: 20, durationMinutes: 25 },
  )?.amount,
  calculatePointToPointQuote(
    "Glengormley, Newtownabbey BT36 7QU",
    "1 Main Street, Bangor BT20 5AF",
    E,
    false,
    {},
    { distanceKm: 20, durationMinutes: 25 },
  )?.amount,
);

// Fail-safe: no invented A2A fare without metrics
assert.equal(
  calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "1 Main Street, Portrush BT56 8BL",
    S,
  ),
  null,
);

// Vehicle rules still global
assert.equal(selectVehicleForParty(2, 1), S);
assert.equal(selectVehicleForParty(3, 0), S);
assert.equal(selectVehicleForParty(3, 2), S);
assert.equal(selectVehicleForParty(1, 3), E);

// Return discount once on journey; airport fixed costs undiscounted both legs
{
  const m = metricsForMiles(14, 25);
  const oneWay = calculateQuote("Belfast City Hall, Belfast BT1 5GS", "BFS", S, false, {}, m)?.amount ?? 0;
  const ret = calculateQuote("Belfast City Hall, Belfast BT1 5GS", "BFS", S, true, {}, m)?.amount ?? 0;
  assert.equal(oneWay, 48);
  assert.equal(ret, 91.2, "BFS return: journey £48×1.9 → £91.20; fixed £0");
  assert.ok(ret < oneWay * 2);
}

assert.ok(rows.length >= 15, `expected ≥15 journeys, got ${rows.length}`);
assert.ok(PRICING_CONFIG.pricingModel?.summary, "pricingModel docs must exist in config");

console.log(`\nOK  ${rows.length} journeys priced by universal distance (no town-pair hard-codes in UI)`);
console.log("All global pricing route checks passed.");
