/**
 * Boundary tests for passenger/luggage → vehicle selection.
 * Run: npx tsx scripts/check-vehicle-selection.ts
 *
 * Rule:
 * - Saloon: 1–4 passengers AND 0–2 suitcases
 * - Estate: 1–4 passengers AND 3–4 suitcases
 * - Minibus: 1–4 passengers AND 5+ suitcases, OR 5–7 passengers (any luggage)
 */

import assert from "node:assert/strict";
import { calculateQuote } from "../src/lib/quote";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  requiresMinibus,
  selectVehicleForParty,
  vehicleShortLabel,
} from "../src/lib/vehicle-selection";

function expectVehicle(
  passengers: number,
  suitcases: number,
  expected: typeof SALOON_VEHICLE | typeof ESTATE_VEHICLE | typeof MINIBUS_VEHICLE,
  note: string,
) {
  const actual = selectVehicleForParty(passengers, suitcases);
  assert.equal(actual, expected, `${note}: ${passengers}p/${suitcases}c → ${actual}`);
  console.log(`OK  ${note}: ${passengers}p / ${suitcases}c → ${vehicleShortLabel(actual)}`);
}

console.log("=== Saloon (1–4 passengers AND 0–2 cases) ===");
expectVehicle(1, 0, SALOON_VEHICLE, "1p/0c");
expectVehicle(1, 2, SALOON_VEHICLE, "1p/2c");
expectVehicle(2, 0, SALOON_VEHICLE, "2p/0c");
expectVehicle(2, 2, SALOON_VEHICLE, "2p/2c boundary");
expectVehicle(3, 0, SALOON_VEHICLE, "3p/0c — pax alone must NOT force Estate");
expectVehicle(3, 1, SALOON_VEHICLE, "3p/1c");
expectVehicle(3, 2, SALOON_VEHICLE, "3p/2c");
expectVehicle(4, 0, SALOON_VEHICLE, "4p/0c");
expectVehicle(4, 2, SALOON_VEHICLE, "4p/2c");

console.log("\n=== Estate (1–4 pax AND 3–4 cases) ===");
expectVehicle(1, 3, ESTATE_VEHICLE, "1p/3c");
expectVehicle(2, 4, ESTATE_VEHICLE, "2p/4c");
expectVehicle(3, 3, ESTATE_VEHICLE, "3p/3c");
expectVehicle(4, 4, ESTATE_VEHICLE, "4p/4c");
expectVehicle(2, 3, ESTATE_VEHICLE, "2p/3c luggage threshold");

console.log("\n=== Luggage boundaries (1–4 pax): 2 Saloon → 3 Estate → 4 Estate → 5 Minibus ===");
expectVehicle(2, 2, SALOON_VEHICLE, "2 cases → Saloon");
expectVehicle(2, 3, ESTATE_VEHICLE, "3 cases → Estate");
expectVehicle(2, 4, ESTATE_VEHICLE, "4 cases → Estate");
expectVehicle(2, 5, MINIBUS_VEHICLE, "5 cases → Minibus");
expectVehicle(4, 2, SALOON_VEHICLE, "4p/2c → Saloon");
expectVehicle(4, 3, ESTATE_VEHICLE, "4p/3c → Estate");
expectVehicle(4, 4, ESTATE_VEHICLE, "4p/4c → Estate");
expectVehicle(4, 5, MINIBUS_VEHICLE, "4p/5c → Minibus");

console.log("\n=== Threshold flips ===");
expectVehicle(4, 2, SALOON_VEHICLE, "still saloon at 4p/2c");
expectVehicle(4, 3, ESTATE_VEHICLE, "estate at 4p/3c");
expectVehicle(2, 2, SALOON_VEHICLE, "still saloon at 2 cases");
expectVehicle(2, 3, ESTATE_VEHICLE, "estate at 3 cases");
expectVehicle(4, 4, ESTATE_VEHICLE, "still estate at 4p/4c");
expectVehicle(5, 1, MINIBUS_VEHICLE, "minibus at 5p");
expectVehicle(4, 4, ESTATE_VEHICLE, "still estate at 4 cases");
expectVehicle(2, 5, MINIBUS_VEHICLE, "minibus at 5 cases (capacity)");

console.log("\n=== Minibus precedence (5–7 pax regardless of luggage) ===");
expectVehicle(5, 0, MINIBUS_VEHICLE, "5p/0c");
expectVehicle(5, 1, MINIBUS_VEHICLE, "5p/1c");
expectVehicle(6, 0, MINIBUS_VEHICLE, "6p/0c");
expectVehicle(7, 2, MINIBUS_VEHICLE, "7p/2c");
expectVehicle(2, 5, MINIBUS_VEHICLE, "2p/5c");
expectVehicle(4, 6, MINIBUS_VEHICLE, "4p/6c");
expectVehicle(5, 5, MINIBUS_VEHICLE, "5p/5c");
assert.equal(requiresMinibus(5, 1), true);
assert.equal(requiresMinibus(4, 4), false);
assert.equal(requiresMinibus(4, 5), true);

console.log("\n=== Pricing uses vehicle (rates unchanged) ===");
const belfast = "10 Donegall Square North, Belfast BT1 5GB";
const saloon = calculateQuote(belfast, "BFS", SALOON_VEHICLE);
const estate = calculateQuote(belfast, "BFS", ESTATE_VEHICLE);
assert.ok(saloon && estate);
assert.ok(estate!.amount > saloon!.amount, "Estate must cost more than saloon on airport routes");
console.log(
  `OK  BFS Belfast saloon £${saloon!.amount} / estate £${estate!.amount} (config estate premium £8 before rounding)`,
);

const minibusFormula = calculateQuote(belfast, "BFS", MINIBUS_VEHICLE);
assert.ok(minibusFormula && minibusFormula.amount > 0);
console.log(
  `OK  Minibus online fare enabled (BFS Belfast £${minibusFormula.amount}) — uses existing 1.55× estate tier / £60 A2A base.`,
);

console.log("\nAll vehicle-selection checks passed.");
