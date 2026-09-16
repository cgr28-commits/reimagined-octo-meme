/**
 * Universal distance pricing — approved interpolation knots + Estate = Saloon + £6.
 * Run: npx tsx scripts/check-universal-distance-pricing.ts
 */
import assert from "node:assert/strict";
import {
  UNIVERSAL_ESTATE_PREMIUM_GBP,
  UNIVERSAL_SALOON_KNOTS,
  UNIVERSAL_SALOON_MINIMUM_GBP,
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

console.log("=== Floor + approved knots ===");
{
  const cases: Array<[number, number]> = [
    [0, 29],
    [2, 29],
    [4, 29],
    [6, 32],
    [8, 35],
    [10, 38],
    [12, 41],
    [15, 46],
    [20, 53],
    [25, 60],
    [30, 67],
    [35, 74],
    [40, 81],
    [50, 96],
    [60, 115],
    [70, 135],
    [80, 157],
    [90, 181],
    [100, 210],
  ];
  for (const [miles, target] of cases) {
    const saloon = calculateUniversalSaloonJourneyFareGbp(miles);
    const estate = calculateUniversalEstateJourneyFareGbp(saloon);
    assert.equal(saloon, target, `${miles} mi Saloon`);
    assert.equal(estate, target + UNIVERSAL_ESTATE_PREMIUM_GBP, `${miles} mi Estate`);
    assert.equal(estate - saloon, 6);
  }
  const raw98 = rawUniversalSaloonJourneyFareGbp(98);
  const saloon98 = calculateUniversalSaloonJourneyFareGbp(98);
  assert.ok(Math.abs(raw98 - 204.2) < 1e-9, `98 mi raw should be £204.20, got ${raw98}`);
  assert.ok(saloon98 === 204 || saloon98 === 205, `98 mi Saloon should be £204 or £205, got ${saloon98}`);
  assert.equal(saloon98, 204);
  console.log("OK  floor, knots, 98 mi interpolation, Estate +£6");
}

console.log("\n=== Just over 4 miles is a smooth rise, not a cliff ===");
{
  const atFloor = rawUniversalSaloonJourneyFareGbp(4);
  const justOver = rawUniversalSaloonJourneyFareGbp(4.1);
  const roundedOver = calculateUniversalSaloonJourneyFareGbp(4.1);
  assert.equal(atFloor, UNIVERSAL_SALOON_MINIMUM_GBP);
  assert.ok(justOver > atFloor, "raw fare must increase immediately after 4 miles");
  assert.ok(justOver - atFloor < 0.5, `4.1 mi should rise by well under £1, got +${justOver - atFloor}`);
  assert.ok(roundedOver === 29 || roundedOver === 30, `4.1 mi rounded must stay near the floor, got ${roundedOver}`);
  assert.ok(roundedOver - 29 <= 1, "no large jump just after 4 miles");
  console.log("OK  4.1 mi is a small interpolation step");
}

console.log("\n=== Interpolation is continuous at every knot (no 0.1-mile band jump) ===");
{
  const boundaries = UNIVERSAL_SALOON_KNOTS.map(([miles]) => miles);
  for (const miles of boundaries) {
    const at = rawUniversalSaloonJourneyFareGbp(miles);
    const before = rawUniversalSaloonJourneyFareGbp(miles - 0.1);
    const after = rawUniversalSaloonJourneyFareGbp(miles + 0.1);
    assert.ok(after > at, `${miles}+0.1 must be above the knot`);
    if (miles > 4) {
      assert.ok(before < at, `${miles}-0.1 must be below the knot`);
    }
    assert.ok(after - before < 1.2, `${miles} ±0.1 must stay within ~£1 raw, got ${after - before}`);
  }
  const at90 = calculateUniversalSaloonJourneyFareGbp(90);
  const at901 = calculateUniversalSaloonJourneyFareGbp(90.1);
  assert.equal(at90, 181);
  assert.ok(at901 === 181 || at901 === 182, `90.1 mi must not jump to the 100-mile knot, got ${at901}`);
  assert.ok(at901 - at90 <= 1);
  console.log("OK  knot neighbourhoods stay continuous");
}

console.log("\n=== Full knot table (Estate − Saloon = £6) ===");
{
  const miles = UNIVERSAL_SALOON_KNOTS.map(([m]) => m);
  const table = buildUniversalFareTable([0, 2, ...miles]);
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
  assert.equal(short!.amount, 29);
  assert.equal(short!.journeyFareGbp, 29);
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
  assert.equal(shortEstate!.amount, 35);
  assert.equal(shortEstate!.amount - short!.amount, 6);

  const mid = calculateQuote(
    "Galgorm Manor Hotel, Ballymena BT42 1EA",
    "BHD",
    SALOON_VEHICLE,
    false,
    { outboundDate: "2026-08-29", outboundTime: "10:00" },
    metricsForMiles(30, 46),
    false,
  );
  assert.equal(mid!.amount, 67);
  assert.equal(mid!.journeyFareGbp, 67);

  const long = calculateQuote(
    "Dublin area",
    "DUB",
    SALOON_VEHICLE,
    false,
    {},
    metricsForMiles(98, 120),
    false,
  );
  assert.equal(long!.journeyFareGbp, 204);
  // DUB drop-off fixed +£4
  assert.equal(long!.airportFixedCostsGbp, 4);
  assert.equal(long!.amount, 208);

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
  assert.equal(breakdown.journeyFareDisplayGbp, 46);
  assert.equal(breakdown.airportAccessChargeGbp, 4);
  assert.equal(breakdown.finalAmountPayableGbp, 50);
  console.log("OK  Journey £46 + Express £4 = £50");
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
  assert.equal(p2p!.amount, 46);
  assert.equal(p2p!.journeyFareGbp, 46);
  console.log("OK  A2A/P2P uses universal curve");
}

console.log("\n=== Representative examples ===");
{
  const examples = [
    ["BHD ~4 mi (City Hall)", 4, "BHD", false],
    ["BHD ~15 mi", 15, "BHD", false],
    ["BFS ~20 mi", 20, "BFS", false],
    ["BHD ~30 mi", 30, "BHD", false],
    ["BFS ~40 mi", 40, "BFS", false],
    ["DUB ~98 mi", 98, "DUB", false],
    ["DUB ~100 mi", 100, "DUB", false],
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
  assert.ok(Math.abs(rawUniversalSaloonJourneyFareGbp(4) - 29) < 0.01);
  assert.ok(Math.abs(rawUniversalSaloonJourneyFareGbp(15) - 46) < 0.01);
  assert.ok(Math.abs(rawUniversalSaloonJourneyFareGbp(30) - 67) < 0.01);
  assert.ok(Math.abs(rawUniversalSaloonJourneyFareGbp(50) - 96) < 0.01);
  assert.ok(Math.abs(rawUniversalSaloonJourneyFareGbp(70) - 135) < 0.01);
  assert.ok(Math.abs(rawUniversalSaloonJourneyFareGbp(90) - 181) < 0.01);
  assert.ok(Math.abs(rawUniversalSaloonJourneyFareGbp(100) - 210) < 0.01);
  const midShort = rawUniversalSaloonJourneyFareGbp(5);
  assert.ok(Math.abs(midShort - 30.5) < 0.01, `4–6 midpoint should be £30.50, got ${midShort}`);
  const mid = calculateUniversalJourneyFareGbp(25, "Estate Car (1–4 passengers)");
  assert.equal(mid.saloonGbp, 60);
  assert.equal(mid.journeyFareGbp - mid.saloonGbp, 6);
}

console.log("\nAll universal distance pricing checks passed.");
