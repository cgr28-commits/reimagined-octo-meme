/**
 * Airport↔airport access-fee fix — full diagnostic matrix (universal distance).
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
import {
  calculateUniversalSaloonJourneyFareGbp,
  universalDrivingMilesFromKm,
} from "../shared/universal-distance-pricing";

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

const DUB_DROP_FIXED = 4;

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

function universalJourney(metrics: { distanceKm: number }): number {
  return calculateUniversalSaloonJourneyFareGbp(
    universalDrivingMilesFromKm(metrics.distanceKm),
  );
}

console.log("=== Config: BFS/BHD access fees £0 + Antrim table untouched (historical) ===");
assert.equal(getAirportAccessFeeGbp("BFS"), 0);
assert.equal(getAirportAccessFeeGbp("BHD"), 0);
assert.equal(PRICING_CONFIG.areaAirportSurchargesGbp.Antrim.BHD, 35);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.BHD, 34);
assert.equal(PRICING_CONFIG.airportBasePricesGbp.BFS, 45);
assert.equal(PRICING_CONFIG.operational.airportChargesGbp.BFS, null);
assert.equal(PRICING_CONFIG.operational.airportChargesGbp.BHD, null);
assert.equal(PRICING_CONFIG.universalDistancePricing?.enabled, true);
console.log("OK  BFS/BHD £0 access fees; universal distance enabled; historical config retained");

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
    areaRule: "none (airports identified; A2A underlying — universal distance)",
    accessFees: "collection BFS waived; retain BHD destination £4",
    other: "no zone surcharge / no airport minimum re-apply",
    rounding: `${underlying.amount}+4 → ${q.amount}`,
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
    areaRule: "none (A2A underlying — universal distance)",
    accessFees: "collection BHD waived; retain BFS destination £5",
    other: "collection-only waiver (not symmetric £ amounts)",
    rounding: `${underlying.amount}+5 → ${q.amount}`,
    final: q.amount,
  });
}

// 3 Antrim town → BHD (zone retired; universal 8 mi → £37)
{
  const area = matchAreaFromAddress(ANTRIM);
  const journey = universalJourney(M8);
  assert.equal(journey, 37);
  const q = calculateQuote(ANTRIM, "BHD", S, false, {}, M8)!;
  assert.equal(area, "Antrim");
  assert.equal(q.amount, 37);
  assert.notEqual(q.amount, 65, "Antrim zone £65 retired under universal distance");
  rows.push({
    id: 3,
    label: "Antrim town → BHD",
    miles: milesOf(M8),
    underlying: journey,
    areaRule: "zone retired — universal distance (8 mi → £37)",
    accessFees: "BFS/BHD fixed £0",
    other: "NOT Antrim zone £65",
    rounding: `£${q.amount}`,
    final: q.amount,
  });
}

// 4 BHD → Antrim residential
{
  const journey = universalJourney(M8);
  const q = calculateQuote(ANTRIM, "BHD", S, false, {}, M8, true)!;
  assert.equal(q.amount, journey);
  assert.notEqual(q.amount, 65);
  rows.push({
    id: 4,
    label: "BHD → Antrim residential",
    miles: milesOf(M8),
    underlying: journey,
    areaRule: "universal distance (same miles as #3)",
    accessFees: "BFS/BHD fixed costs £0",
    other: "fromAirport=true; same total as drop-off",
    rounding: `£${q.amount}`,
    final: q.amount,
  });
}

// 5 Belfast → BFS (14 mi → £48)
{
  const area = matchAreaFromAddress(CITY);
  const journey = universalJourney(M14);
  assert.equal(journey, 48);
  const q = calculateQuote(CITY, "BFS", S, false, {}, M14)!;
  assert.equal(q.amount, 48);
  rows.push({
    id: 5,
    label: "Belfast City Hall → BFS",
    miles: milesOf(M14),
    underlying: journey,
    areaRule: `${area} — universal distance (zone retired)`,
    accessFees: "BFS fixed £0",
    other: "14 mi → £48",
    rounding: `£${q.amount}`,
    final: q.amount,
  });
}

// 6 BFS → Belfast
{
  const q = calculateQuote(CITY, "BFS", S, false, {}, M14, true)!;
  assert.equal(q.amount, 48);
  rows.push({
    id: 6,
    label: "BFS → Belfast City Hall",
    miles: milesOf(M14),
    underlying: 48,
    areaRule: "universal distance (same as #5)",
    accessFees: "fixed pickup £0",
    other: "fromAirport=true",
    rounding: `£${q.amount}`,
    final: q.amount,
  });
}

// 7 Belfast → BHD (~4.5 mi → £31, not £30 legacy strip)
{
  const journey = universalJourney(M5);
  assert.equal(journey, 31);
  const q = calculateQuote(CITY, "BHD", S, false, {}, M5)!;
  assert.equal(q.amount, 31);
  assert.notEqual(q.amount, 30, "not legacy strip £30");
  rows.push({
    id: 7,
    label: "Belfast City Hall → BHD",
    miles: milesOf(M5),
    underlying: journey,
    areaRule: "universal distance (~4.5 mi → £31)",
    accessFees: "BHD fixed £0",
    other: "not legacy strip £30",
    rounding: "£31",
    final: q.amount,
  });
}

// 8 BHD → Belfast
{
  const q = calculateQuote(CITY, "BHD", S, false, {}, M5, true)!;
  assert.equal(q.amount, 31);
  rows.push({
    id: 8,
    label: "BHD → Belfast City Hall",
    miles: milesOf(M5),
    underlying: 31,
    areaRule: "same as #7",
    accessFees: "fixed costs £0",
    other: "fromAirport=true",
    rounding: "£31",
    final: q.amount,
  });
}

// 9 Address → DUB (ordinary) — journey £245 + £4 M1 = £249
{
  const journey = universalJourney(DUB_METRICS);
  assert.equal(journey, 245);
  const q = calculateQuote(CITY, "DUB", S, false, {}, DUB_METRICS, false)!;
  assert.equal(q.amount, 249);
  assert.equal(q.airportFixedCostsGbp, 4);
  rows.push({
    id: 9,
    label: "Belfast City Hall → DUB",
    miles: Math.round(drivingMilesFromKm(DUB_METRICS.distanceKm) * 10) / 10,
    underlying: journey,
    areaRule: "universal distance (168 km → £245 journey)",
    accessFees: "Dublin drop-off fee £0 + M1 £4",
    other: "journey £245 + fixed £4 (not zone £234)",
    rounding: "£249",
    final: q.amount,
  });
}

// 10 Airport↔airport involving DUB — same as DUB path; underlying = journey (no undercut)
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
  const journey = universalJourney(DUB_METRICS);
  assert.equal(buggyA2a.amount, journey);
  assert.equal(q.amount, intended.amount);
  assert.equal(q.amount, 249);
  assert.equal(intended.amount, 249);
  assert.equal(q.amount, buggyA2a.amount + DUB_DROP_FIXED);
  rows.push({
    id: 10,
    label: "BHD → DUB (airport↔airport)",
    miles: Math.round(drivingMilesFromKm(DUB_METRICS.distanceKm) * 10) / 10,
    underlying: journey,
    areaRule: "DUB path (universal journey) — A2A underlying equals journey",
    accessFees: "DUB drop-off path (+£4 M1); NI access fees not stacked",
    other: `underlying £${buggyA2a.amount}; airport = underlying + £4`,
    rounding: "£249",
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
  assert.equal(q.amount, 249);
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
  `\nBFS→BHD price: £${rows[0].final} (A2A + destination £4)`,
);
console.log("Dublin: BHD→DUB £249 (universal journey £245 + M1 £4; underlying matches journey).");
console.log("\nAll airport↔airport access-fee matrix checks passed.");
