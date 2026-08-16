/**
 * Boundary tests for passenger/luggage → vehicle selection (OTS capacity model).
 * Run: npx tsx scripts/check-vehicle-selection.ts
 */

import assert from "node:assert/strict";
import { calculateQuote } from "../src/lib/quote";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  fitsEstateCapacity,
  fitsSaloonCapacity,
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

console.log("=== Saloon (≤3 pax + ≤3 cases, or 4 pax + hand luggage) ===");
expectVehicle(1, 0, SALOON_VEHICLE, "1p/0c");
expectVehicle(1, 2, SALOON_VEHICLE, "1p/2c");
expectVehicle(1, 3, SALOON_VEHICLE, "1p/3c");
expectVehicle(2, 0, SALOON_VEHICLE, "2p/0c");
expectVehicle(2, 2, SALOON_VEHICLE, "2p/2c");
expectVehicle(2, 3, SALOON_VEHICLE, "2p/3c");
expectVehicle(3, 0, SALOON_VEHICLE, "3p/0c");
expectVehicle(3, 2, SALOON_VEHICLE, "3p/2c");
expectVehicle(3, 3, SALOON_VEHICLE, "3p/3c boundary");
expectVehicle(4, 0, SALOON_VEHICLE, "4p/0c hand luggage");

console.log("\n=== Estate (≤4 pax + ≤4 cases, when not saloon) ===");
expectVehicle(4, 1, ESTATE_VEHICLE, "4p/1c");
expectVehicle(4, 2, ESTATE_VEHICLE, "4p/2c");
expectVehicle(4, 4, ESTATE_VEHICLE, "4p/4c");
expectVehicle(1, 4, ESTATE_VEHICLE, "1p/4c");
expectVehicle(2, 4, ESTATE_VEHICLE, "2p/4c");
expectVehicle(3, 4, ESTATE_VEHICLE, "3p/4c");

console.log("\n=== Threshold flips ===");
expectVehicle(3, 3, SALOON_VEHICLE, "3→4 cases at 3 pax: still saloon at 3 cases");
expectVehicle(3, 4, ESTATE_VEHICLE, "3→4 cases at 3 pax: estate at 4 cases");
expectVehicle(4, 0, SALOON_VEHICLE, "4 pax hand luggage: saloon");
expectVehicle(4, 1, ESTATE_VEHICLE, "4 pax + 1 case: estate");
expectVehicle(4, 4, ESTATE_VEHICLE, "4→5 pax: still estate at 4");
expectVehicle(5, 1, MINIBUS_VEHICLE, "4→5 pax: minibus at 5");
expectVehicle(4, 4, ESTATE_VEHICLE, "4→5 cases: still estate at 4 cases");
expectVehicle(2, 5, MINIBUS_VEHICLE, "4→5 cases: minibus at 5 cases");

console.log("\n=== Minibus precedence ===");
expectVehicle(5, 1, MINIBUS_VEHICLE, "5p/1c");
expectVehicle(6, 0, MINIBUS_VEHICLE, "6p/0c");
expectVehicle(2, 5, MINIBUS_VEHICLE, "2p/5c");
expectVehicle(4, 6, MINIBUS_VEHICLE, "4p/6c");
expectVehicle(5, 5, MINIBUS_VEHICLE, "5p/5c");
assert.equal(requiresMinibus(5, 1), true);
assert.equal(requiresMinibus(4, 4), false);
assert.equal(fitsSaloonCapacity(3, 3), true);
assert.equal(fitsSaloonCapacity(4, 0), true);
assert.equal(fitsSaloonCapacity(4, 1), false);
assert.equal(fitsEstateCapacity(4, 1), true);
assert.equal(fitsEstateCapacity(3, 3), false);

console.log("\n=== Pricing uses vehicle (rates unchanged) ===");
const belfast = "10 Donegall Square North, Belfast BT1 5GB";
const saloon = calculateQuote(belfast, "BFS", SALOON_VEHICLE);
const estate = calculateQuote(belfast, "BFS", ESTATE_VEHICLE);
assert.ok(saloon && estate);
assert.ok(estate!.amount > saloon!.amount, "Estate must cost more than saloon on airport routes");
console.log(
  `OK  BFS Belfast saloon £${saloon!.amount} / estate £${estate!.amount} (config estate premium £8 before rounding)`,
);

// Minibus formula exists but must not be used for instant online checkout without approval.
const minibusFormula = calculateQuote(belfast, "BFS", MINIBUS_VEHICLE);
console.log(
  `NOTE Minibus formula exists in config (BFS Belfast would be £${minibusFormula?.amount}) — NOT enabled for instant online booking.`,
);

console.log("\nAll vehicle-selection checks passed.");
