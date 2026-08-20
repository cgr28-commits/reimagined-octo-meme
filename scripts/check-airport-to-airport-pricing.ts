/**
 * Airport ↔ airport must use airport pricing (never generic A2A/OTS).
 * DUB legs use existing Dublin Airport rules; BHD→DUB saloon ≈ £230 not ~£170.
 * Ordinary address ↔ DUB fares must remain unchanged.
 *
 * Run: npx tsx scripts/check-airport-to-airport-pricing.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  calculateAirportToAirportQuote,
  calculatePointToPointQuote,
  calculateQuote,
} from "../src/lib/quote";
import {
  detectAirportCodeFromPlace,
  detectJourneyKind,
  emptySelectedPlace,
  type SelectedPlace,
} from "../src/lib/selected-place";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";
import { calculateWebsiteOneWayFare } from "../src/lib/website-fare";
import { SERVED_AIRPORTS } from "../shared/served-airports";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const SALOON = SALOON_VEHICLE;

/** Typical BHD/BFS ↔ DUB driving metrics (long cross-border leg). */
const DUB_CROSS_BORDER_METRICS = {
  distanceKm: 168,
  durationMinutes: 115,
};

/** Typical LDY ↔ DUB driving metrics. */
const LDY_DUB_METRICS = {
  distanceKm: 230,
  durationMinutes: 160,
};

function airportPlace(code: string): SelectedPlace {
  const airport = SERVED_AIRPORTS.find((item) => item.code === code);
  assert.ok(airport, `missing served airport ${code}`);
  return {
    ...emptySelectedPlace(),
    placeId: airport.placeId,
    formattedAddress: airport.formattedAddress,
    displayAddress: airport.formattedAddress,
    placeName: airport.name,
    lat: airport.lat,
    lng: airport.lng,
    countryCode: airport.countryCode,
    postalCode: airport.postalCode,
  };
}

function addressPlace(address: string, lat: number, lng: number): SelectedPlace {
  return {
    ...emptySelectedPlace(),
    placeId: `addr-${address.slice(0, 24)}`,
    formattedAddress: address,
    displayAddress: address,
    placeName: address.split(",")[0] ?? address,
    lat,
    lng,
    countryCode: "GB",
    postalCode: address.match(/BT\d+\s*\d[A-Z]{2}/i)?.[0] ?? null,
  };
}

console.log("=== 1. Routing: airport↔airport uses dedicated helper (not A2A fallthrough) ===");
{
  const quoteSrc = read("src/lib/quote.ts");
  assert.match(quoteSrc, /export function calculateAirportToAirportQuote/);
  assert.match(
    quoteSrc,
    /When Dublin Airport is one end[\s\S]*always use existing DUB airport pricing/,
  );
  assert.match(
    quoteSrc,
    /underlying address-to-address journey fare \+ genuine access fee/,
  );
  assert.doesNotMatch(
    quoteSrc,
    /viaPickupAirport\.amount >= viaDropoffAirport\.amount/,
  );

  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /calculateAirportToAirportQuote/);
  assert.match(
    card,
    /journeyKind === "airport-to-airport"[\s\S]*calculateAirportToAirportQuote/,
  );

  const websiteFare = read("src/lib/website-fare.ts");
  assert.match(websiteFare, /calculateAirportToAirportQuote/);
  assert.match(
    websiteFare,
    /journeyKind === "airport-to-airport"[\s\S]*calculateAirportToAirportQuote/,
  );
  console.log("OK  QuoteCard + website-fare route airport↔airport via helper");
}

console.log("\n=== 2. Buggy A2A path still produces ~£170 (must not be used) ===");
{
  const buggy = calculatePointToPointQuote(
    "George Best Belfast City Airport, Airport Rd, Belfast BT3 9JH, UK",
    "Dublin Airport, Co. Dublin, Ireland",
    SALOON,
    false,
    {},
    DUB_CROSS_BORDER_METRICS,
  );
  assert.ok(buggy);
  assert.ok(
    buggy!.amount >= 160 && buggy!.amount <= 180,
    `expected buggy A2A ~£170, got £${buggy!.amount}`,
  );
  console.log(`OK  Generic A2A undercuts at £${buggy!.amount} (regression guard)`);
}

console.log("\n=== 3. Belfast City ↔ Dublin Airport ≈ £230 (not ~£170) ===");
{
  const bhd = airportPlace("BHD");
  const dub = airportPlace("DUB");
  assert.equal(detectAirportCodeFromPlace(bhd), "BHD");
  assert.equal(detectAirportCodeFromPlace(dub), "DUB");
  assert.equal(detectJourneyKind(bhd, dub), "airport-to-airport");
  assert.equal(detectJourneyKind(dub, bhd), "airport-to-airport");

  const intended = calculateQuote(
    bhd.formattedAddress,
    "DUB",
    SALOON,
    false,
    {},
    DUB_CROSS_BORDER_METRICS,
  );
  assert.ok(intended);
  assert.equal(intended!.amount, 230, `intended DUB path must be £230, got £${intended!.amount}`);

  const bhdToDub = calculateAirportToAirportQuote(
    "BHD",
    "DUB",
    bhd.formattedAddress,
    dub.formattedAddress,
    SALOON,
    false,
    {},
    DUB_CROSS_BORDER_METRICS,
  );
  const dubToBhd = calculateAirportToAirportQuote(
    "DUB",
    "BHD",
    dub.formattedAddress,
    bhd.formattedAddress,
    SALOON,
    false,
    {},
    DUB_CROSS_BORDER_METRICS,
  );
  assert.ok(bhdToDub && dubToBhd);
  assert.equal(bhdToDub!.amount, 230);
  assert.equal(dubToBhd!.amount, 230);
  assert.notEqual(bhdToDub!.amount, 170);

  const websiteBhdToDub = calculateWebsiteOneWayFare({
    pickupAddress: bhd.formattedAddress,
    dropoffAddress: dub.formattedAddress,
    pickupPlace: bhd,
    dropoffPlace: dub,
    vehicleType: SALOON,
    routeMetrics: DUB_CROSS_BORDER_METRICS,
  });
  const websiteDubToBhd = calculateWebsiteOneWayFare({
    pickupAddress: dub.formattedAddress,
    dropoffAddress: bhd.formattedAddress,
    pickupPlace: dub,
    dropoffPlace: bhd,
    vehicleType: SALOON,
    routeMetrics: DUB_CROSS_BORDER_METRICS,
  });
  assert.ok(websiteBhdToDub && websiteDubToBhd);
  assert.equal(websiteBhdToDub!.amount, 230);
  assert.equal(websiteDubToBhd!.amount, 230);
  console.log("OK  BHD ↔ DUB saloon £230 via airport helper + website-fare");
}

console.log("\n=== 4. Belfast International ↔ Dublin Airport ===");
{
  const bfs = airportPlace("BFS");
  const dub = airportPlace("DUB");
  assert.equal(detectJourneyKind(bfs, dub), "airport-to-airport");

  const intended = calculateQuote(
    bfs.formattedAddress,
    "DUB",
    SALOON,
    false,
    {},
    DUB_CROSS_BORDER_METRICS,
  );
  assert.ok(intended);

  const bfsToDub = calculateAirportToAirportQuote(
    "BFS",
    "DUB",
    bfs.formattedAddress,
    dub.formattedAddress,
    SALOON,
    false,
    {},
    DUB_CROSS_BORDER_METRICS,
  );
  const dubToBfs = calculateAirportToAirportQuote(
    "DUB",
    "BFS",
    dub.formattedAddress,
    bfs.formattedAddress,
    SALOON,
    false,
    {},
    DUB_CROSS_BORDER_METRICS,
  );
  assert.ok(bfsToDub && dubToBfs);
  assert.equal(bfsToDub!.amount, intended!.amount);
  assert.equal(dubToBfs!.amount, intended!.amount);
  assert.ok(
    bfsToDub!.amount > 180,
    `BFS↔DUB must use DUB floor path, got £${bfsToDub!.amount}`,
  );

  const website = calculateWebsiteOneWayFare({
    pickupAddress: bfs.formattedAddress,
    dropoffAddress: dub.formattedAddress,
    pickupPlace: bfs,
    dropoffPlace: dub,
    vehicleType: SALOON,
    routeMetrics: DUB_CROSS_BORDER_METRICS,
  });
  assert.ok(website);
  assert.equal(website!.amount, intended!.amount);
  console.log(`OK  BFS ↔ DUB saloon £${bfsToDub!.amount} (matches DUB airport path)`);
}

console.log("\n=== 5. City of Derry Airport ↔ Dublin Airport ===");
{
  const ldy = airportPlace("LDY");
  const dub = airportPlace("DUB");
  assert.equal(detectJourneyKind(ldy, dub), "airport-to-airport");
  assert.equal(detectJourneyKind(dub, ldy), "airport-to-airport");

  const intended = calculateQuote(
    ldy.formattedAddress,
    "DUB",
    SALOON,
    false,
    {},
    LDY_DUB_METRICS,
  );
  assert.ok(intended);

  const ldyToDub = calculateAirportToAirportQuote(
    "LDY",
    "DUB",
    ldy.formattedAddress,
    dub.formattedAddress,
    SALOON,
    false,
    {},
    LDY_DUB_METRICS,
  );
  const dubToLdy = calculateAirportToAirportQuote(
    "DUB",
    "LDY",
    dub.formattedAddress,
    ldy.formattedAddress,
    SALOON,
    false,
    {},
    LDY_DUB_METRICS,
  );
  assert.ok(ldyToDub && dubToLdy);
  assert.equal(ldyToDub!.amount, intended!.amount);
  assert.equal(dubToLdy!.amount, intended!.amount);
  assert.ok(
    ldyToDub!.amount > 200,
    `LDY↔DUB must not use generic A2A undercut, got £${ldyToDub!.amount}`,
  );

  const website = calculateWebsiteOneWayFare({
    pickupAddress: ldy.formattedAddress,
    dropoffAddress: dub.formattedAddress,
    pickupPlace: ldy,
    dropoffPlace: dub,
    vehicleType: SALOON,
    routeMetrics: LDY_DUB_METRICS,
  });
  assert.ok(website);
  assert.equal(website!.amount, intended!.amount);
  console.log(`OK  LDY ↔ DUB saloon £${ldyToDub!.amount} (matches DUB airport path)`);
}

console.log("\n=== 6. Ordinary address ↔ Dublin Airport unchanged ===");
{
  const cityHall = "Belfast City Hall, Belfast BT1 5GS";
  const lisburn = "1 Market Square, Lisburn BT28 1XN";
  const bangor = "Main Street, Bangor BT20 5ED";
  const dub = airportPlace("DUB");

  const baselines: Array<{ address: string; expected: number; lat: number; lng: number }> = [
    { address: cityHall, expected: 230, lat: 54.5964, lng: -5.9301 },
    { address: lisburn, expected: 240, lat: 54.5162, lng: -6.0583 },
    { address: bangor, expected: 245, lat: 54.6538, lng: -5.6689 },
  ];

  for (const row of baselines) {
    const toDub = calculateQuote(row.address, "DUB", SALOON);
    const fromDub = calculateQuote(row.address, "DUB", SALOON);
    assert.ok(toDub && fromDub);
    assert.equal(toDub!.amount, row.expected, `${row.address}→DUB`);
    assert.equal(fromDub!.amount, row.expected, `DUB→${row.address}`);

    const addr = addressPlace(row.address, row.lat, row.lng);
    assert.equal(detectJourneyKind(addr, dub), "address-to-airport");
    assert.equal(detectJourneyKind(dub, addr), "airport-to-address");

    const websiteTo = calculateWebsiteOneWayFare({
      pickupAddress: row.address,
      dropoffAddress: dub.formattedAddress,
      pickupPlace: addr,
      dropoffPlace: dub,
      vehicleType: SALOON,
      routeMetrics: null,
    });
    const websiteFrom = calculateWebsiteOneWayFare({
      pickupAddress: dub.formattedAddress,
      dropoffAddress: row.address,
      pickupPlace: dub,
      dropoffPlace: addr,
      vehicleType: SALOON,
      routeMetrics: null,
    });
    assert.ok(websiteTo && websiteFrom);
    assert.equal(websiteTo!.amount, row.expected);
    assert.equal(websiteFrom!.amount, row.expected);
  }
  console.log("OK  address→DUB and DUB→address fares unchanged (City Hall/Lisburn/Bangor)");
}

console.log("\n=== 7. Non-DUB airport↔airport = A2A underlying + access fees (not Antrim-zone max) ===");
{
  const bhd = airportPlace("BHD");
  const bfs = airportPlace("BFS");
  const metrics = { distanceKm: 17 / 0.621371, durationMinutes: 32 };
  const a2a = calculatePointToPointQuote(
    bfs.formattedAddress,
    bhd.formattedAddress,
    SALOON,
    false,
    {},
    metrics,
  );
  const viaAirport = calculateAirportToAirportQuote(
    "BFS",
    "BHD",
    bfs.formattedAddress,
    bhd.formattedAddress,
    SALOON,
    false,
    {},
    metrics,
  );
  assert.ok(a2a && viaAirport);
  // Must NOT equal the old Antrim→BHD zone win (£69).
  assert.notEqual(viaAirport!.amount, 69);
  assert.ok(
    viaAirport!.amount >= a2a!.amount,
    `airport↔airport must include access fees on top of A2A (got £${viaAirport!.amount} vs A2A £${a2a!.amount})`,
  );
  assert.equal(viaAirport!.amount, a2a!.amount + 5 + 4);
  assert.equal(viaAirport!.areaSurcharge, 9);
  console.log(
    `OK  BFS↔BHD = A2A £${a2a!.amount} + £5 + £4 → £${viaAirport!.amount} (not Antrim-zone £69)`,
  );
}

console.log("\nAll airport-to-airport pricing checks passed.");
