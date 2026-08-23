/**
 * Static checks for the same-fare amendment test fixture helpers.
 * Run: npx tsx scripts/check-amendment-test-fixture.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";

const cityBfsMetrics = { distanceKm: 14 / 0.621371, durationMinutes: 25 };

const AMENDMENT_TEST_PICKUP =
  "Five Corners Guest Inn, 249 Rashee Road, Ballyclare BT39 9JN";
const AMENDMENT_TEST_DROPOFF =
  "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK";
const AMENDMENT_TEST_TIME = "10:00";

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

console.log("=== Wiring present ===");
const workerIndex = read("workers/addresses/src/index.ts");
assert.match(workerIndex, /amendment-test-seed/);
assert.match(workerIndex, /handleAmendmentTestSeedRequest/);
assert.match(read("workers/addresses/src/amendment-test-handlers.ts"), /isAmendmentTestFixture:\s*true/);
assert.match(read("shared/paid-booking-record.ts"), /isAmendmentTestFixture\?:/);
assert.match(read("workers/addresses/src/paid-booking-store.ts"), /isAmendmentTestFixture/);
assert.match(
  read("workers/addresses/src/booking-amendment-handlers.ts"),
  /amendment_test_fixture_no_sumup/,
);
assert.match(read("workers/addresses/src/refund-handlers.ts"), /AMENDMENT TEST fixture/);
assert.ok(fs.existsSync(path.join(root, "src/app/owner/amendment-test/page.tsx")));
assert.ok(fs.existsSync(path.join(root, ".github/workflows/seed-amendment-test-fixture.yml")));
console.log("OK  handler + isolation wiring");

console.log("\n=== Live pricing for fixture route ===");
const tripDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date(Date.now() + 5 * 864e5));

const quote = calculateAuthoritativeWebsiteQuote({
  airportCode: "BFS",
  fromAirport: false,
  pickupAddress: AMENDMENT_TEST_PICKUP,
  dropoffAddress: AMENDMENT_TEST_DROPOFF,
  returnJourney: false,
  outboundDate: tripDate,
  outboundTime: AMENDMENT_TEST_TIME,
  passengers: 2,
  suitcases: 2,
  routeMetrics: cityBfsMetrics,
});
assert.equal(quote.ok, true);
assert.ok(quote.ok && quote.amount >= 40 && quote.amount <= 60);
console.log(`OK  quote ${quote.ok ? quote.amountLabel : "fail"} on ${tripDate} ${AMENDMENT_TEST_TIME}`);

const sameTimePlus15 = calculateAuthoritativeWebsiteQuote({
  airportCode: "BFS",
  fromAirport: false,
  pickupAddress: AMENDMENT_TEST_PICKUP,
  dropoffAddress: AMENDMENT_TEST_DROPOFF,
  returnJourney: false,
  outboundDate: tripDate,
  outboundTime: "10:15",
  passengers: 2,
  suitcases: 2,
  routeMetrics: cityBfsMetrics,
});
assert.equal(sameTimePlus15.ok, true);
assert.equal(
  quote.ok && sameTimePlus15.ok ? quote.amount : null,
  sameTimePlus15.ok ? sameTimePlus15.amount : null,
);
console.log("OK  10:00 → 10:15 same fare");

console.log("\nAll amendment-test fixture checks passed.");
