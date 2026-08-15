/**
 * A2A long-distance fares must not undercut the BFS/BHD airport rate card
 * when one end is Greater Belfast and the other is outside it.
 * Run: npx tsx scripts/check-a2a-airport-parity.ts
 */

import assert from "node:assert/strict";
import { VEHICLE_TYPES } from "../src/lib/data";
import { calculatePointToPointQuote, calculateQuote } from "../src/lib/quote";

let passed = 0;

function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

function main() {
  const saloon = VEHICLE_TYPES[0];
  const schedule = {
    tripDate: "2026-08-29",
    tripTime: "16:00",
    returnDate: "",
    returnTime: "",
  };
  const omaghMetrics = { distanceKm: 67 / 0.621371, durationMinutes: 78 };

  check("Omagh → Boucher matches or exceeds Omagh→BFS airport table fare", () => {
    const a2a = calculatePointToPointQuote(
      "Market Street, Omagh BT78 1AB, Northern Ireland",
      "Boucher Rd, Belfast BT12 6EU, UK",
      saloon,
      false,
      schedule,
      omaghMetrics,
    );
    const bfs = calculateQuote("Market Street, Omagh BT78 1AB, Northern Ireland", "BFS", saloon, false, {});
    const bhd = calculateQuote("Market Street, Omagh BT78 1AB, Northern Ireland", "BHD", saloon, false, {});
    assert.ok(a2a);
    assert.ok(bfs);
    assert.ok(bhd);
    const floor = Math.max(bfs!.amount, bhd!.amount);
    assert.equal(a2a!.amount, floor);
    assert.ok(a2a!.amount >= 119);
  });

  check("Greater Belfast ↔ Greater Belfast stays on OTS path (no airport floor)", () => {
    const a2a = calculatePointToPointQuote(
      "Main Street, Bangor BT20 5AF",
      "Bridge Street, Lisburn BT28 1AB",
      saloon,
      false,
      schedule,
      { distanceKm: 30, durationMinutes: 40 },
    );
    const bfsBangor = calculateQuote("Main Street, Bangor BT20 5AF", "BFS", saloon, false, {});
    assert.ok(a2a);
    assert.ok(bfsBangor);
    // Short GB–GB must stay below the Bangor→BFS airport fare.
    assert.ok(a2a!.amount < bfsBangor!.amount);
  });

  check("Airport calculateQuote amounts are unchanged by the A2A floor", () => {
    const bfs = calculateQuote("Omagh BT78 1AB", "BFS", saloon, false, schedule);
    assert.equal(bfs?.amount, 119);
  });

  console.log(`\n${passed} A2A airport-parity checks passed`);
}

main();
