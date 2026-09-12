/**
 * Universal distance pricing — approved calibration + Estate = Saloon + £6.
 * Run: npx tsx scripts/check-universal-distance-pricing.ts
 */
import assert from "node:assert/strict";
import {
  buildUniversalFareTable,
  calculateUniversalEstateJourneyFareGbp,
  calculateUniversalJourneyFareGbp,
  calculateUniversalSaloonJourneyFareGbp,
  rawUniversalSaloonJourneyFareGbp,
} from "../shared/universal-distance-pricing";
import { calculateQuote, calculatePointToPointQuote } from "../src/lib/quote";
import { SALOON_VEHICLE, ESTATE_VEHICLE } from "../src/lib/vehicle-selection";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";

function metricsForMiles(miles: number, durationMinutes = 40) {
  return {
    distanceKm: miles / 0.621371,
    durationMinutes,
  };
}

console.log("=== Calibration knots ===");
{
  const cases: Array<[number, number]> = [
    [0, 25],
    [2, 25],
    [4, 25],
    [5, 27],
    [10, 38],
    [15, 48],
    [20, 57],
    [25, 66],
    [30, 74],
    [32, 78],
    [35, 85],
    [40, 96],
    [50, 119],
    [60, 142],
    [70, 164],
    [80, 187],
    [90, 210],
    [98, 228],
    [100, 233],
  ];
  for (const [miles, target] of cases) {
    const saloon = calculateUniversalSaloonJourneyFareGbp(miles);
    const estate = calculateUniversalEstateJourneyFareGbp(saloon);
    assert.equal(saloon, target, `${miles} mi Saloon`);
    assert.equal(estate, target + 6, `${miles} mi Estate`);
    assert.equal(estate - saloon, 6);
  }
  console.log("OK  approved table + Estate +£6");
}

console.log("\n=== Full 0–100 mile table (Estate − Saloon = £6) ===");
{
  const miles = [0, 2, 4, 5, 10, 15, 20, 25, 30, 32, 35, 40, 45, 50, 60, 70, 75, 80, 90, 98, 100];
  const table = buildUniversalFareTable(miles);
  console.log("Miles | Saloon | Estate | Δ");
  for (const row of table) {
    assert.equal(row.estate - row.saloon, 6, `${row.miles} mi delta`);
    console.log(
      `${String(row.miles).padStart(5)} | ${String(row.saloon).padStart(6)} | ${String(row.estate).padStart(6)} | ${row.estate - row.saloon}`,
    );
  }
  console.log("OK  table parity");
}

console.log("\n=== calculateQuote uses universal miles (no zone/floor) ===");
{
  // 0–4 miles → £25 Saloon (City Hall-ish to BHD)
  const short = calculateQuote(
    "Belfast City Hall BT1",
    "BHD",
    SALOON_VEHICLE,
    false,
    {},
    metricsForMiles(4, 12),
    false,
  );
  assert.ok(short);
  assert.equal(short!.amount, 25);
  assert.equal(short!.journeyFareGbp, 25);
  assert.equal(short!.amount, short!.journeyFareGbp);

  const shortEstate = calculateQuote(
    "Belfast City Hall BT1",
    "BHD",
    ESTATE_VEHICLE,
    false,
    {},
    metricsForMiles(4, 12),
    false,
  );
  assert.equal(shortEstate!.amount, 31);
  assert.equal(shortEstate!.amount - short!.amount, 6);

  // ~32 miles → £78 (Galgorm-ish to BHD with real road miles)
  const mid = calculateQuote(
    "Galgorm Manor Hotel, Ballymena BT42 1EA",
    "BHD",
    SALOON_VEHICLE,
    false,
    { outboundDate: "2026-08-29", outboundTime: "10:00" },
    metricsForMiles(32, 46),
    false,
  );
  assert.equal(mid!.amount, 78);
  assert.equal(mid!.journeyFareGbp, 78);

  // ~98 miles → £228 Saloon (long-distance / Dublin-level)
  const long = calculateQuote(
    "Dublin area",
    "DUB",
    SALOON_VEHICLE,
    false,
    {},
    metricsForMiles(98, 120),
    false,
  );
  assert.equal(long!.journeyFareGbp, 228);
  // DUB drop-off fixed +£4
  assert.equal(long!.airportFixedCostsGbp, 4);
  assert.equal(long!.amount, 232);

  // No metrics → no fare (no zone fallback)
  assert.equal(
    calculateQuote("Ballymena BT42", "BHD", SALOON_VEHICLE, false, {}, null, false),
    null,
  );
  console.log("OK  quote engine + no zone fallback");
}

console.log("\n=== Express remains separate ===");
{
  const journey = calculateUniversalSaloonJourneyFareGbp(15);
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: journey,
    airportFixedCostsGbp: 0,
    airportAccessChargeGbp: 4,
  });
  assert.equal(breakdown.journeyFareDisplayGbp, 48);
  assert.equal(breakdown.airportAccessChargeGbp, 4);
  assert.equal(breakdown.finalAmountPayableGbp, 52);
  console.log("OK  Journey £48 + Express £4 = £52");
}

console.log("\n=== Point-to-point same curve ===");
{
  const p2p = calculatePointToPointQuote(
    "Pickup",
    "Dropoff",
    SALOON_VEHICLE,
    false,
    {},
    metricsForMiles(15, 25),
  );
  assert.equal(p2p!.amount, 48);
  assert.equal(p2p!.journeyFareGbp, 48);
  console.log("OK  A2A/P2P uses universal curve");
}

console.log("\n=== Representative examples ===");
{
  const examples = [
    ["BHD ~4 mi (City Hall)", 4, "BHD", false],
    ["BHD ~15 mi", 15, "BHD", false],
    ["BFS ~20 mi", 20, "BFS", false],
    ["BHD ~32 mi (Galgorm-ish)", 32, "BHD", false],
    ["BFS ~40 mi", 40, "BFS", false],
    ["DUB ~98 mi", 98, "DUB", false],
  ] as const;
  for (const [label, miles, airport, fromAirport] of examples) {
    const saloon = calculateQuote(
      "Address",
      airport,
      SALOON_VEHICLE,
      false,
      {},
      metricsForMiles(miles),
      fromAirport,
    );
    const estate = calculateQuote(
      "Address",
      airport,
      ESTATE_VEHICLE,
      false,
      {},
      metricsForMiles(miles),
      fromAirport,
    );
    console.log(
      `  ${label}: Saloon journey £${saloon!.journeyFareGbp} / Estate £${estate!.journeyFareGbp}` +
        (saloon!.airportFixedCostsGbp
          ? ` (+£${saloon!.airportFixedCostsGbp} fixed → amount £${saloon!.amount})`
          : ""),
    );
    assert.equal(estate!.journeyFareGbp! - saloon!.journeyFareGbp!, 6);
  }
}

console.log("\n=== Raw formula continuity ===");
{
  assert.ok(Math.abs(rawUniversalSaloonJourneyFareGbp(4) - 25) < 0.01);
  assert.ok(Math.abs(rawUniversalSaloonJourneyFareGbp(15) - 48) < 0.01);
  assert.ok(Math.abs(rawUniversalSaloonJourneyFareGbp(32) - 78) < 0.01);
  assert.ok(Math.abs(rawUniversalSaloonJourneyFareGbp(98) - 228) < 0.01);
  const midShort = rawUniversalSaloonJourneyFareGbp(9.5);
  assert.ok(Math.abs(midShort - 36.5) < 0.01, `4–15 midpoint should be £36.50, got ${midShort}`);
  const mid = calculateUniversalJourneyFareGbp(25, "Estate Car (1–4 passengers)");
  assert.equal(mid.journeyFareGbp - mid.saloonGbp, 6);
}

console.log("\nAll universal distance pricing checks passed.");
