/**
 * BHD/BFS long-distance saloon floor — regression checks (approved simulation).
 * Run: npx tsx scripts/check-belfast-airport-distance-floor.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRICING_CONFIG } from "../src/lib/pricing-config";
import {
  applyBelfastAirportDistanceFloor,
  calculateQuote,
  drivingMilesFromKm,
  thresholdMilesOneDecimal,
} from "../src/lib/quote";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
} from "../src/lib/vehicle-selection";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const SALOON = SALOON_VEHICLE;
const ESTATE = ESTATE_VEHICLE;
const MINIBUS = MINIBUS_VEHICLE;

function milesToKm(miles: number): number {
  return miles / 0.621371;
}

function metricsForMiles(miles: number, minsPerMile = 1.4) {
  return {
    distanceKm: milesToKm(miles),
    durationMinutes: miles * minsPerMile,
  };
}

console.log("=== 1. Config + roundFare untouched ===");
{
  const cfg = PRICING_CONFIG.belfastAirportDistanceFloor;
  assert.ok(cfg?.enabled);
  assert.equal(cfg?.thresholdMiles, 20);
  assert.equal(cfg?.perExtraMileGbp, 2);
  assert.equal(cfg?.baseFloorGbp?.BHD, 65);
  assert.equal(cfg?.baseFloorGbp?.BFS, 60);

  const quoteSrc = read("src/lib/quote.ts");
  assert.match(quoteSrc, /function roundFare\(value: number\)/);
  assert.match(
    quoteSrc,
    /rounded % 5 === 4 \? rounded : roundToNearestFive\(rounded\)/,
  );
  assert.match(quoteSrc, /applyBelfastAirportDistanceFloor/);
  // Floor path must use nearest £5, not roundFare, when floor wins.
  assert.match(
    quoteSrc,
    /Floor wins[\s\S]*roundToNearestFive\(distanceFloor\)/,
  );
  console.log("OK  belfastAirportDistanceFloor configured; roundFare body unchanged");
}

console.log("\n=== 2. Threshold gate (1dp) — Carrickfergus ~20.015 stays zone ===");
{
  assert.equal(thresholdMilesOneDecimal(20.015), 20.0);
  assert.equal(thresholdMilesOneDecimal(20.04), 20.0);
  assert.equal(thresholdMilesOneDecimal(20.05), 20.1);
  assert.equal(thresholdMilesOneDecimal(20.06), 20.1);

  const rawKm = milesToKm(20.015);
  assert.equal(thresholdMilesOneDecimal(drivingMilesFromKm(rawKm)), 20.0);

  // Existing zone fare must be preserved (floor not applied at ≤20.0 miles).
  const kept = applyBelfastAirportDistanceFloor(64, "BFS", rawKm);
  assert.equal(kept, 64);

  const carrick = "Carrickfergus BT38 7DG";
  const withMetrics = calculateQuote(carrick, "BFS", SALOON, false, {}, metricsForMiles(20.015));
  const zoneOnly = calculateQuote(carrick, "BFS", SALOON, false, {}, null);
  assert.equal(withMetrics?.amount, zoneOnly?.amount);
  assert.equal(withMetrics?.amount, 59);
  console.log("OK  threshold 20.0 skips floor; Carrickfergus → BFS stays zone £59");
}

console.log("\n=== 3. Zone wins unchanged; floor wins nearest £5 ===");
{
  // Zone £80 beats floor at 21 miles BHD: floor = 65 + 2*1 = 67 → keep 80.
  assert.equal(applyBelfastAirportDistanceFloor(80, "BHD", milesToKm(21)), 80);

  // Floor beats zone £65 at 24.6 mi BHD: 65 + 2*4.6 = 74.2 → nearest £5 = 75.
  assert.equal(applyBelfastAirportDistanceFloor(65, "BHD", milesToKm(24.6)), 75);

  // Would be £74 under roundFare £x4-keep — prove we use nearest £5 instead.
  const rawFloor = 65 + 2 * (24.6 - 20);
  assert.equal(Math.round(rawFloor), 74);
  assert.equal(applyBelfastAirportDistanceFloor(65, "BHD", milesToKm(24.6)), 75);

  // Ballymena-like: zone 80 vs floor at 29.4 = 65+18.8=83.8 → 85.
  assert.equal(applyBelfastAirportDistanceFloor(80, "BHD", milesToKm(29.4)), 85);
  console.log("OK  zone preserved exactly; floor snaps to nearest £5 (not £x4-keep)");
}

console.log("\n=== 4. Approved route targets (BHD/BFS) ===");
{
  const cases: Array<{
    name: string;
    address: string;
    airport: "BHD" | "BFS";
    miles: number;
    saloon: number;
  }> = [
    { name: "Larne → BHD", address: "Larne BT40 1AA", airport: "BHD", miles: 24.6, saloon: 75 },
    {
      name: "Ballygally → BHD",
      address: "Ballygally, Larne BT40 2QZ",
      airport: "BHD",
      miles: 27.6,
      saloon: 75,
    },
    {
      name: "Ballymena → BHD",
      address: "Ballymena BT43 6AN",
      airport: "BHD",
      miles: 29.4,
      saloon: 85,
    },
    { name: "Larne → BFS", address: "Larne BT40 1AA", airport: "BFS", miles: 22.3, saloon: 60 },
    {
      name: "Ballygally → BFS",
      address: "Ballygally, Larne BT40 2QZ",
      airport: "BFS",
      miles: 25.3,
      saloon: 65,
    },
  ];

  for (const item of cases) {
    const q = calculateQuote(
      item.address,
      item.airport,
      SALOON,
      false,
      {},
      metricsForMiles(item.miles),
    );
    assert.equal(q?.amount, item.saloon, `${item.name} expected £${item.saloon}, got £${q?.amount}`);
  }

  // Short / local unchanged (no metrics or short metrics). Legacy BFS/BHD strip applied.
  assert.equal(
    calculateQuote("Belfast City Hall, Belfast BT1 5GS", "BHD", SALOON)?.amount,
    30,
  );
  assert.equal(
    calculateQuote(
      "Belfast City Hall, Belfast BT1 5GS",
      "BHD",
      SALOON,
      false,
      {},
      metricsForMiles(4.6),
    )?.amount,
    30,
  );
  assert.equal(
    calculateQuote(
      "Belfast City Hall, Belfast BT1 5GS",
      "BFS",
      SALOON,
      false,
      {},
      metricsForMiles(16),
    )?.amount,
    44,
  );
  assert.equal(
    calculateQuote("Ballymena BT43 6AN", "BFS", SALOON, false, {}, metricsForMiles(17.4))
      ?.amount,
    44,
  );
  console.log("OK  long-distance floor routes + short fares at revised zone prices");
}

console.log("\n=== 5. Estate / Minibus / return relationships ===");
{
  const addr = "Ballygally, Larne BT40 2QZ";
  const m = metricsForMiles(27.6);
  const s = calculateQuote(addr, "BHD", SALOON, false, {}, m)?.amount;
  const e = calculateQuote(addr, "BHD", ESTATE, false, {}, m)?.amount;
  const mb = calculateQuote(addr, "BHD", MINIBUS, false, {}, m)?.amount;
  const sR = calculateQuote(addr, "BHD", SALOON, true, {}, m)?.amount;
  assert.equal(s, 75);
  assert.equal(e, 84);
  assert.equal(mb, 130);
  assert.equal(sR, 144);
  console.log("OK  Estate/Minibus/return follow existing relationships from new saloon");
}

console.log("\n=== 6. Monotonic: fares never fall as distance rises (fixed zone) ===");
{
  let prev = applyBelfastAirportDistanceFloor(65, "BHD", milesToKm(20));
  for (let miles = 20; miles <= 35; miles += 0.1) {
    const next = applyBelfastAirportDistanceFloor(65, "BHD", milesToKm(miles));
    assert.ok(
      next >= prev,
      `non-monotonic at ${miles.toFixed(1)} mi: £${prev} → £${next}`,
    );
    prev = next;
  }
  prev = applyBelfastAirportDistanceFloor(80, "BHD", milesToKm(20));
  for (let miles = 20; miles <= 35; miles += 0.1) {
    const next = applyBelfastAirportDistanceFloor(80, "BHD", milesToKm(miles));
    assert.ok(next >= prev, `zone80 non-monotonic at ${miles.toFixed(1)}`);
    prev = next;
  }
  console.log("OK  BHD floor curve non-decreasing for zone £65 and £80");
}

console.log("\n=== 7. Dublin unchanged by Belfast distance floor (fixed costs still apply) ===");
{
  const hall = "Belfast City Hall, Belfast BT1 5GS";
  const longMetrics = metricsForMiles(100);
  assert.equal(calculateQuote(hall, "DUB", SALOON)?.amount, 234);
  assert.equal(calculateQuote(hall, "DUB", ESTATE)?.amount, 240);
  assert.equal(
    calculateQuote(hall, "DUB", SALOON, false, {}, longMetrics)?.amount,
    234,
  );
  assert.equal(applyBelfastAirportDistanceFloor(230, "DUB", milesToKm(100)), 230);
  assert.equal(applyBelfastAirportDistanceFloor(250, "LDY", milesToKm(30)), 250);
  console.log("OK  DUB/LDY no-op for distance floor; City Hall→DUB £234");
}

console.log("\nAll belfast airport distance-floor checks passed.");
