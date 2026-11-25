/**
 * Example port quotes through the EXISTING engine (no port tariffs) plus service-area results.
 * Route distances are illustrative road estimates (live routing is not reachable from CI).
 * Run: npx tsx scripts/example-port-quotes.ts
 */
import assert from "node:assert/strict";
import { DEFAULT_PORTS, toPublicPorts } from "../shared/ports";
import { portToPlace, portPairConflict } from "../src/lib/port-places";
import {
  isBelfastAirportRoiInstantJourney,
  needsManualQuoteApproval,
  quickSelectToPlace,
  type SelectedPlace,
} from "../src/lib/selected-place";
import { calculateQuote } from "../src/lib/quote";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";

const publicPorts = toPublicPorts(DEFAULT_PORTS.filter((p) => p.active));
const port = (id: string) => portToPlace(publicPorts.find((p) => p.id === id)!);
const m = (km: number) => ({ distanceKm: km, durationMinutes: Math.round(km * 1.1), source: "osrm" as const });

const bfs = quickSelectToPlace("BFS")!, bhd = quickSelectToPlace("BHD")!, dub = quickSelectToPlace("DUB")!;
const plainTwin = (p: SelectedPlace): SelectedPlace => ({ ...p, placeId: "plain-twin", placeName: null });

type Row = { label: string; a: SelectedPlace; b: SelectedPlace; km: number; airport: "BFS" | "BHD" | "DUB"; fromAirport: boolean; port: SelectedPlace };
const rows: Row[] = [
  { label: "Belfast Cruise Terminal → Belfast Intl", a: port("belfast-cruise-terminal"), b: bfs, km: 32, airport: "BFS", fromAirport: false, port: port("belfast-cruise-terminal") },
  { label: "Belfast Cruise Terminal → Belfast City", a: port("belfast-cruise-terminal"), b: bhd, km: 3, airport: "BHD", fromAirport: false, port: port("belfast-cruise-terminal") },
  { label: "Belfast Intl → Stena VT4 (Cairnryan)", a: bfs, b: port("stena-belfast-cairnryan-vt4"), km: 28, airport: "BFS", fromAirport: true, port: port("stena-belfast-cairnryan-vt4") },
  { label: "Belfast City → Stena VT2 (Liverpool)", a: bhd, b: port("stena-belfast-liverpool-vt2"), km: 5, airport: "BHD", fromAirport: true, port: port("stena-belfast-liverpool-vt2") },
  { label: "Belfast Intl → Irish Ferries Dublin T1", a: bfs, b: port("irish-ferries-dublin-t1"), km: 165, airport: "BFS", fromAirport: true, port: port("irish-ferries-dublin-t1") },
  { label: "Stena Dublin T2 → Belfast City", a: port("stena-dublin-t2"), b: bhd, km: 170, airport: "BHD", fromAirport: false, port: port("stena-dublin-t2") },
];

console.log("\nExample quotes (existing engine, Saloon):");
for (const r of rows) {
  const manual = needsManualQuoteApproval(r.a, r.b);
  const conflict = portPairConflict(r.a, r.b, publicPorts);
  const addr = r.fromAirport ? r.b.formattedAddress : r.a.formattedAddress;
  const oneWay = calculateQuote(addr, r.airport, SALOON_VEHICLE, false, {}, m(r.km), r.fromAirport);
  const ret = calculateQuote(addr, r.airport, SALOON_VEHICLE, true, {}, m(r.km), r.fromAirport);
  const twinAddr = plainTwin(r.port).formattedAddress;
  const twin = calculateQuote(twinAddr, r.airport, SALOON_VEHICLE, false, {}, m(r.km), r.fromAirport);
  assert.ok(oneWay && ret && twin, `${r.label}: engine must price it`);
  assert.equal(oneWay!.amount, twin!.amount, "port pricing must equal the same journey to a plain address");
  console.log(`  ${r.label.padEnd(44)} one way £${oneWay!.amount}  return £${ret!.amount}  manualApproval=${manual}  conflict=${conflict || "none"}`);
}

console.log("\nService-area validation:");
const dubPort = port("stena-dublin-t2");
const cases: [string, boolean][] = [
  ["Dublin port ↔ Dublin Airport blocked", !!portPairConflict(dubPort, dub, publicPorts)],
  ["Dublin port ↔ Dublin port blocked", !!portPairConflict(dubPort, port("irish-ferries-dublin-t1"), publicPorts)],
  ["Dublin port ↔ Belfast Intl allowed", !portPairConflict(dubPort, bfs, publicPorts)],
  ["Belfast port ↔ Dublin Airport not blocked by port guard (existing engine rules apply)", !portPairConflict(port("belfast-cruise-terminal"), dub, publicPorts)],
  ["BFS ↔ Dublin port is an instant ROI corridor journey", isBelfastAirportRoiInstantJourney(bfs, dubPort)],
];
for (const [name, ok] of cases) { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`); assert.ok(ok, name); }
