/**
 * Airport↔airport access-fee fix — full diagnostic matrix.
 * Run: npx tsx scripts/check-airport-airport-access-fees.ts
 */

import assert from "node:assert/strict";
import {
  calculateAirportToAirportQuote,
  calculatePointToPointQuote,
  calculateQuote,
  drivingMilesFromKm,
  matchAreaFromAddress,
} from "../src/lib/quote";
import {
  getAirportAccessFeeGbp,
  PRICING_CONFIG,
} from "../src/lib/pricing-config";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";
import { SERVED_AIRPORTS } from "../shared/served-airports";

const S = SALOON_VEHICLE;

const bfs = SERVED_AIRPORTS.find((a) => a.code === "BFS")!;
const bhd = SERVED_AIRPORTS.find((a) => a.code === "BHD")!;
const dub = SERVED_AIRPORTS.find((a) => a.code === "DUB")!;

const CITY = "Belfast City Hall, Belfast BT1 5GS";
const ANTRIM = "17 High Street, Antrim BT41 4BB";
const BFS_ADDR = bfs.formattedAddress;
const BHD_ADDR = bhd.formattedAddress;
const DUB_ADDR = dub.formattedAddress;

const M17 = { distanceKm: 17 / 0.621371, durationMinutes: 32 };
const M14 = { distanceKm: 14 / 0.621371, durationMinutes: 25 };
const M5 = { distanceKm: 4.5 / 0.621371, durationMinutes: 12 };
const M8 = { distanceKm: 8 / 0.621371, durationMinutes: 18 };
const DUB_METRICS = { distanceKm: 168, durationMinutes: 115 };

type Row = {
  id: number;
  label: string;
  miles: number;
  underlying: number;
  areaRule: string;
  accessFees: string;
  other: string;
  rounding: string;
  final: number;
};

const rows: Row[] = [];

function milesOf(m: { distanceKm: number }) {
  return Math.round(drivingMilesFromKm(m.distanceKm) * 10) / 10;
}

console.log("=== Config: BFS/BHD access fees £0 + Antrim table untouched ===");
assert.equal(getAirportAccessFeeGbp("BFS"), 0);
assert.equal(getAirportAccessFeeGbp("BHD"), 0);
assert.equal(PRICING_CONFIG.areaAirportSurchargesGbp.Antrim.BHD, 35);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.BHD, 34);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.BFS, 45);
assert.equal(PRICING_CONFIG.operational.airportChargesGbp.BFS, null);
assert.equal(PRICING_CONFIG.operational.airportChargesGbp.BHD, null);
console.log("OK  BFS/BHD £0 access fees; Antrim.BHD still £35; ops charges still null");

console.log("\n=== Matrix ===\n");

// 1 BFS → BHD
{
  const underlying = calculatePointToPointQuote(BFS_ADDR, BHD_ADDR, S, false, {}, M17)!;
  const q = calculateAirportToAirportQuote("BFS", "BHD", BFS_ADDR, BHD_ADDR, S, false, {}, M17)!;
  assert.notEqual(q.amount, 69, "must not use Antrim→BHD zone path");
  assert.equal(q.amount, underlying.amount + 4);
  rows.push({
    id: 1,
    label: "BFS → BHD (airport↔airport)",
    miles: milesOf(M17),
    underlying: underlying.amount,
    areaRule: "none (airports identified; A2A underlying — not Antrim zone)",
    accessFees: "collection BFS waived; retain BHD destination £4",
    other: "no zone surcharge / no airport minimum re-apply",
    rounding: `${underlying.amount}+4 → ${q.amount} (roundFare)`,
    final: q.amount,
  });
}

// 2 BHD → BFS
{
  const underlying = calculatePointToPointQuote(BHD_ADDR, BFS_ADDR, S, false, {}, M17)!;
  const q = calculateAirportToAirportQuote("BHD", "BFS", BHD_ADDR, BFS_ADDR, S, false, {}, M17)!;
  assert.equal(q.amount, underlying.amount + 5);
  assert.notEqual(q.amount, 69);
  rows.push({
    id: 2,
    label: "BHD → BFS (airport↔airport)",
    miles: milesOf(M17),
    underlying: underlying.amount,
    areaRule: "none (A2A underlying)",
    accessFees: "collection BHD waived; retain BFS destination £5",
    other: "collection-only waiver (not symmetric £ amounts)",
    rounding: `${underlying.amount}+5 → ${q.amount}`,
    final: q.amount,
  });
}

// 3 Antrim town → BHD (zone path must stay £65)
{
  const area = matchAreaFromAddress(ANTRIM);
  const q = calculateQuote(ANTRIM, "BHD", S, false, {}, M8)!;
  assert.equal(area, "Antrim");
  assert.equal(q.amount, 65);
  rows.push({
    id: 3,
    label: "Antrim town → BHD",
    miles: milesOf(M8),
    underlying: 34,
    areaRule: `Antrim → BHD zone surcharge £35`,
    accessFees: "included commercially in zone fare (not separate add-on)",
    other: "airport minimum £34 already satisfied",
    rounding: "34+35=65 (legacy strip −£4 on customer total)",
    final: q.amount,
  });
}

// 4 BHD → Antrim residential
{
  const q = calculateQuote(ANTRIM, "BHD", S, false, {}, M8, true)!;
  assert.equal(q.amount, 65);
  rows.push({
    id: 4,
    label: "BHD → Antrim residential",
    miles: milesOf(M8),
    underlying: 34,
    areaRule: `same BHD scheme; address area Antrim (+£35)`,
    accessFees: "BFS/BHD fixed costs £0 (legacy strip only)",
    other: "fromAirport=true; same total as drop-off",
    rounding: "£65",
    final: q.amount,
  });
}

// 5 Belfast → BFS
{
  const area = matchAreaFromAddress(CITY);
  const q = calculateQuote(CITY, "BFS", S, false, {}, M14)!;
  rows.push({
    id: 5,
    label: "Belfast City Hall → BFS",
    miles: milesOf(M14),
    underlying: 45,
    areaRule: `${area} → BFS surcharge £${q.areaSurcharge}`,
    accessFees: "included in zone fare",
    other: `base £45 + surcharge → £${q.amount}`,
    rounding: `£${q.amount}`,
    final: q.amount,
  });
}

// 6 BFS → Belfast
{
  const q = calculateQuote(CITY, "BFS", S, false, {}, M14, true)!;
  rows.push({
    id: 6,
    label: "BFS → Belfast City Hall",
    miles: milesOf(M14),
    underlying: 45,
    areaRule: `Belfast City Centre → BFS (same as #5)`,
    accessFees: "fixed pickup legacy strip only (£0 add-on)",
    other: "fromAirport=true",
    rounding: `£${q.amount}`,
    final: q.amount,
  });
}

// 7 Belfast → BHD
{
  const q = calculateQuote(CITY, "BHD", S, false, {}, M5)!;
  assert.equal(q.amount, 30);
  rows.push({
    id: 7,
    label: "Belfast City Hall → BHD",
    miles: milesOf(M5),
    underlying: 34,
    areaRule: "Belfast City Centre → BHD surcharge £0",
    accessFees: "included in zone fare (legacy strip −£4)",
    other: "BHD city benchmark",
    rounding: "£30 customer (base £34)",
    final: q.amount,
  });
}

// 8 BHD → Belfast
{
  const q = calculateQuote(CITY, "BHD", S, false, {}, M5, true)!;
  assert.equal(q.amount, 30);
  rows.push({
    id: 8,
    label: "BHD → Belfast City Hall",
    miles: milesOf(M5),
    underlying: 34,
    areaRule: "same as #7",
    accessFees: "fixed costs £0 (legacy strip only)",
    other: "fromAirport=true",
    rounding: "£30",
    final: q.amount,
  });
}

// 9 Address → DUB (ordinary) — journey + £4 M1 toll allowance
{
  const q = calculateQuote(CITY, "DUB", S, false, {}, DUB_METRICS, false)!;
  assert.equal(q.amount, 234);
  assert.equal(q.airportFixedCostsGbp, 4);
  rows.push({
    id: 9,
    label: "Belfast City Hall → DUB",
    miles: Math.round(drivingMilesFromKm(DUB_METRICS.distanceKm) * 10) / 10,
    underlying: 180,
    areaRule: "Belfast City Centre → DUB +£50",
    accessFees: "M1 toll allowance £4 (no Dublin drop-off fee)",
    other: "zone journey £230 + fixed £4",
    rounding: "£234",
    final: q.amount,
  });
}

// 10 Airport↔airport involving DUB — anti-undercut preserved
{
  const buggyA2a = calculatePointToPointQuote(BHD_ADDR, DUB_ADDR, S, false, {}, DUB_METRICS)!;
  const q = calculateAirportToAirportQuote(
    "BHD",
    "DUB",
    BHD_ADDR,
    DUB_ADDR,
    S,
    false,
    {},
    DUB_METRICS,
  )!;
  const intended = calculateQuote(BHD_ADDR, "DUB", S, false, {}, DUB_METRICS, false)!;
  assert.equal(q.amount, intended.amount);
  assert.equal(q.amount, 234);
  assert.ok(q.amount > buggyA2a.amount, "must not fall to A2A undercut");
  rows.push({
    id: 10,
    label: "BHD → DUB (airport↔airport)",
    miles: Math.round(drivingMilesFromKm(DUB_METRICS.distanceKm) * 10) / 10,
    underlying: 180,
    areaRule: "DUB scheme for BHD address (City Centre +£50) — NOT A2A+fees",
    accessFees: "DUB drop-off path (+£4 M1); NI access fees not stacked",
    other: `A2A undercut would be £${buggyA2a.amount}; anti-undercut keeps DUB`,
    rounding: "£234",
    final: q.amount,
  });
}

// Extra: BFS → DUB also protected
{
  const q = calculateAirportToAirportQuote(
    "BFS",
    "DUB",
    BFS_ADDR,
    DUB_ADDR,
    S,
    false,
    {},
    DUB_METRICS,
  )!;
  const intended = calculateQuote(BFS_ADDR, "DUB", S, false, {}, DUB_METRICS, false)!;
  assert.equal(q.amount, intended.amount);
  assert.ok(q.amount >= 234);
  console.log(`OK  BFS→DUB airport↔airport £${q.amount} (matches DUB path £${intended.amount})`);
}

for (const r of rows) {
  console.log(
    `#${r.id} ${r.label}\n` +
      `   miles=${r.miles}  underlying=£${r.underlying}  area=${r.areaRule}\n` +
      `   access=${r.accessFees}  other=${r.other}\n` +
      `   rounding=${r.rounding}  FINAL=£${r.final}\n`,
  );
}

assert.equal(rows[0].final, rows[0].underlying + 4);
assert.equal(rows[1].final, rows[1].underlying + 5);
assert.ok(rows[0].final < 69);
console.log(
  `\nNEW BFS→BHD price: £${rows[0].final} (was £59 with both fees; now −£5 collection only)`,
);
console.log("Dublin protection: BHD→DUB still £234 (zone + M1; not A2A undercut).");
console.log("\nAll airport↔airport access-fee matrix checks passed.");
