/**
 * Owner Personal Quote + Driver Quick Quote: native passenger/luggage selectors.
 * Run: npx tsx scripts/check-owner-quick-quote-selectors.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectVehicleForParty } from "../src/lib/vehicle-selection";
import {
  formatOnlineSuitcaseOption,
  formatPersonalQuoteSuitcaseOption,
  ONLINE_PASSENGER_OPTIONS,
  ONLINE_SUITCASE_OPTIONS,
  PERSONAL_QUOTE_SUITCASE_OPTIONS,
} from "../src/components/FiniteOptionSelect";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

check("Passenger options are exactly 1–4", () => {
  assert.deepEqual([...ONLINE_PASSENGER_OPTIONS], [1, 2, 3, 4]);
});

check("Personal Quote luggage options are 0–4 with 4+ label", () => {
  assert.deepEqual([...PERSONAL_QUOTE_SUITCASE_OPTIONS], [0, 1, 2, 3, 4]);
  assert.equal(formatPersonalQuoteSuitcaseOption(4), "4+");
  assert.equal(formatPersonalQuoteSuitcaseOption(2), "2");
});

check("Quick Quote luggage options use 4+ → stored 5 for vehicle rules", () => {
  assert.deepEqual([...ONLINE_SUITCASE_OPTIONS], [0, 1, 2, 3, 5]);
  assert.equal(formatOnlineSuitcaseOption(5), "4+");
  assert.equal(formatOnlineSuitcaseOption(3), "3");
  // Vehicle rules unchanged: 4 bags = Estate; 5 (4+) = Minibus
  assert.match(selectVehicleForParty(2, 4), /Estate/i);
  assert.match(selectVehicleForParty(2, 5), /Minibus/i);
  assert.match(selectVehicleForParty(4, 2), /Saloon|Estate/i);
});

check("Owner Personal Quotes uses FiniteOptionSelect (no free number typing)", () => {
  const panel = read("src/components/OwnerPersonalQuotesPanel.tsx");
  assert.match(panel, /FiniteOptionSelect/);
  assert.match(panel, /ONLINE_PASSENGER_OPTIONS/);
  assert.match(panel, /PERSONAL_QUOTE_SUITCASE_OPTIONS/);
  assert.doesNotMatch(
    panel,
    /Passengers[\s\S]{0,120}type="number"/,
    "must not use type=number for passengers",
  );
  assert.doesNotMatch(
    panel,
    /Suitcases[\s\S]{0,120}type="number"/,
    "must not use type=number for suitcases",
  );
});

check("Quick Quote uses FiniteOptionSelect (no numeric text entry)", () => {
  const qq = read("src/app/quick-quote/QuickQuoteOwnerClient.tsx");
  assert.match(qq, /FiniteOptionSelect/);
  assert.match(qq, /ONLINE_PASSENGER_OPTIONS|QUICK_QUOTE_MINIBUS_PASSENGER_OPTIONS/);
  assert.match(qq, /ONLINE_SUITCASE_OPTIONS/);
  assert.match(qq, /vehicleChoice/);
  assert.match(qq, /Minibus/);
  assert.doesNotMatch(qq, /inputMode="numeric"/);
  assert.match(qq, /Airport shortcuts/);
  assert.match(qq, /fromAirport/);
  assert.match(qq, /returnJourney/);
  assert.match(qq, /childSeatRequired/);
});

check("FiniteOptionSelect is a native select control", () => {
  const src = read("src/components/FiniteOptionSelect.tsx");
  assert.match(src, /<select/);
  assert.doesNotMatch(src, /type="number"/);
  assert.doesNotMatch(src, /inputMode="numeric"/);
});

console.log("\nAll owner/quick-quote selector checks passed.");
