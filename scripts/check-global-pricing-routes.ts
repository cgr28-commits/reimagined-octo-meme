/**
 * Global pricing engine — 15+ ordinary journeys (including non-benchmarks).
 * Proves fares generalise from the central model, not hard-coded town pairs.
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

const S = SALOON_VEHICLE;
const E = ESTATE_VEHICLE;

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

// 2 Short BHD airport
add(
  "City Hall → BHD",
  "airport",
  4.5,
  calculateQuote("Belfast City Hall, Belfast BT1 5GS", "BHD", S)?.amount,
  calculateQuote("Belfast City Hall, Belfast BT1 5GS", "BHD", E)?.amount,
  "bench ~£30/~£35",
);

// 3 Lisburn → BHD (must scale above city £30)
{
  const s = calculateQuote("1 Market Square, Lisburn BT28 1XN", "BHD", S)?.amount;
  const e = calculateQuote("1 Market Square, Lisburn BT28 1XN", "BHD", E)?.amount;
  add("Lisburn → BHD", "airport", 12, s, e);
  // Lisburn may share the BHD city-area floor; must not undercut the city benchmark.
  assert.ok((s ?? 0) >= 30, "Lisburn→BHD must be at least City Hall→BHD (£30)");
}

// 4 BFS city
add(
  "City Hall → BFS",
  "airport",
  14,
  calculateQuote("Belfast City Hall, Belfast BT1 5GS", "BFS", S)?.amount,
  calculateQuote("Belfast City Hall, Belfast BT1 5GS", "BFS", E)?.amount,
  "bench ~£44/~£50",
);

// 5 Bangor → BFS
{
  const s = calculateQuote("1 Main Street, Bangor BT20 5AF", "BFS", S)?.amount;
  const city = calculateQuote("Belfast City Hall, Belfast BT1 5GS", "BFS", S)?.amount;
  add(
    "Bangor → BFS",
    "airport",
    20,
    s,
    calculateQuote("1 Main Street, Bangor BT20 5AF", "BFS", E)?.amount,
  );
  assert.ok((s ?? 0) >= (city ?? 0), "Bangor→BFS should be >= city→BFS");
}

// 6 Newtownabbey → DUB
add(
  "Newtownabbey → DUB",
  "airport",
  100,
  calculateQuote("Glengormley, Newtownabbey BT36 7QU", "DUB", S)?.amount,
  calculateQuote("Glengormley, Newtownabbey BT36 7QU", "DUB", E)?.amount,
);

// 7 City → DUB
add(
  "City Hall → DUB",
  "airport",
  99,
  calculateQuote("Belfast City Hall, Belfast BT1 5GS", "DUB", S)?.amount,
  calculateQuote("Belfast City Hall, Belfast BT1 5GS", "DUB", E)?.amount,
  "bench £230/£240",
);

// 8 Dublin city beyond airport
{
  const s = calculateDublinCityBeyondAirportQuote(
    "Belfast City Hall, Belfast BT1 5GS",
    S,
    { distanceKm: 168.6, durationMinutes: 119.5 },
  )?.amount;
  const e = calculateDublinCityBeyondAirportQuote(
    "Belfast City Hall, Belfast BT1 5GS",
    E,
    { distanceKm: 168.6, durationMinutes: 119.5 },
  )?.amount;
  add("City Hall → Dublin city centre", "DUB+", 105, s, e);
  assert.ok((s ?? 0) > 230 && (e ?? 0) > 240);
}

// 9 Medium NI — Newry
add(
  "City Hall → Newry",
  "A2A",
  37,
  calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "1 Marcus Square, Newry BT35 8DQ",
    S,
    false,
    {},
    { distanceKm: 59.9, durationMinutes: 46 },
  )?.amount,
  calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "1 Marcus Square, Newry BT35 8DQ",
    E,
    false,
    {},
    { distanceKm: 59.9, durationMinutes: 46 },
  )?.amount,
  "bench ~£81/~£93",
);

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
add(
  "City Hall → Derry",
  "A2A",
  71,
  calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "1 Guildhall Square, Derry BT48 6BJ",
    S,
    false,
    {},
    { distanceKm: 114.1, durationMinutes: 86 },
  )?.amount,
  calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "1 Guildhall Square, Derry BT48 6BJ",
    E,
    false,
    {},
    { distanceKm: 114.1, durationMinutes: 86 },
  )?.amount,
  "bench ~£127/~£146",
);

// 12 BFS → Derry (airport → town)
add(
  "BFS → Derry",
  "airport",
  65,
  calculateQuote("1 Guildhall Square, Derry BT48 6BJ", "BFS", S, false, {}, {
    distanceKm: 105,
    durationMinutes: 80,
  })?.amount,
  calculateQuote("1 Guildhall Square, Derry BT48 6BJ", "BFS", E, false, {}, {
    distanceKm: 105,
    durationMinutes: 80,
  })?.amount,
);

// 13 Long NI — Enniskillen A2A
add(
  "City Hall → Enniskillen",
  "A2A",
  81,
  calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "10 East Bridge Street, Enniskillen, BT74 7AB",
    S,
    false,
    {},
    { distanceKm: 130.2, durationMinutes: 98 },
  )?.amount,
  calculatePointToPointQuote(
    "10 Donegall Square North, Belfast BT1 5GB",
    "10 East Bridge Street, Enniskillen, BT74 7AB",
    E,
    false,
    {},
    { distanceKm: 130.2, durationMinutes: 98 },
  )?.amount,
  "bench ~£145/~£165",
);

// 14 BFS → Enniskillen
add(
  "BFS → Enniskillen",
  "airport",
  79,
  calculateQuote("10 East Bridge Street, Enniskillen, BT74 7AB", "BFS", S, false, {}, {
    distanceKm: 126.5,
    durationMinutes: 98,
  })?.amount,
  calculateQuote("10 East Bridge Street, Enniskillen, BT74 7AB", "BFS", E, false, {}, {
    distanceKm: 126.5,
    durationMinutes: 98,
  })?.amount,
  "bench zone+distance protect",
);

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
add(
  "Europa Hotel → BFS",
  "airport",
  14,
  calculateQuote("Europa Hotel, Great Victoria Street, Belfast BT2 7BA", "BFS", S)?.amount,
  calculateQuote("Europa Hotel, Great Victoria Street, Belfast BT2 7BA", "BFS", E)?.amount,
);

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
const oneWay = calculateQuote("Belfast City Hall, Belfast BT1 5GS", "BFS", S)?.amount ?? 0;
const ret = calculateQuote("Belfast City Hall, Belfast BT1 5GS", "BFS", S, true)?.amount ?? 0;
assert.equal(oneWay, 44);
assert.equal(ret, 84, "BFS return: journey £44×1.9 → £84; fixed £0");
assert.ok(ret < oneWay * 2);

assert.ok(rows.length >= 15, `expected ≥15 journeys, got ${rows.length}`);
assert.ok(PRICING_CONFIG.pricingModel?.summary, "pricingModel docs must exist in config");

console.log(`\nOK  ${rows.length} journeys priced by the central engine (no town-pair hard-codes in UI)`);
console.log("All global pricing route checks passed.");
