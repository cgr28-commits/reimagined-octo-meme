/**
 * Journey-direction switching must not leave stale airport / address / flight values.
 * Run: npx tsx scripts/check-quote-journey-direction.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyJourneyDirectionResetToSnapshot,
  planJourneyDirectionDependentReset,
  submittedJourneyLocationFields,
  type JourneyDirectionFormSnapshot,
} from "../shared/quote-journey-direction";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const bfsPickup: JourneyDirectionFormSnapshot = {
  pickupAddress: "Belfast International Airport",
  dropoffAddress: "12 Donegall Square, Belfast",
  pickupIsAirport: true,
  dropoffIsAirport: false,
  goingFlightNumber: "EI123",
  collectionFlightNumber: "",
  airportCode: "BFS",
  hiddenPickup: "Belfast International Airport",
  hiddenDropoff: "",
};

const cityToBhd: JourneyDirectionFormSnapshot = {
  pickupAddress: "12 Donegall Square, Belfast",
  dropoffAddress: "George Best Belfast City Airport",
  pickupIsAirport: false,
  dropoffIsAirport: true,
  goingFlightNumber: "",
  collectionFlightNumber: "FR456",
  airportCode: "BHD",
  hiddenPickup: "",
  hiddenDropoff: "George Best Belfast City Airport",
};

console.log("=== Airport pickup → Airport drop-off clears stale values ===");
{
  const plan = planJourneyDirectionDependentReset({
    previousIntent: "from-airport",
    nextIntent: "to-airport",
  });
  assert.equal(plan.clearPickup, true);
  assert.equal(plan.clearDropoff, true);
  assert.equal(plan.clearGoingFlight, true);
  assert.equal(plan.clearCollectionFlight, true);
  assert.equal(plan.clearAirportSelection, false);
  assert.equal(plan.applyAirportTo, "dropoff");

  const reset = applyJourneyDirectionResetToSnapshot(bfsPickup, plan);
  const submitted = submittedJourneyLocationFields(reset);
  assert.equal(submitted.pickupAddress, "");
  assert.equal(submitted.dropoffAddress, "");
  assert.equal(submitted.flightNumber, "");
  assert.equal(submitted.returnFlightNumber, "");
  assert.equal(submitted.hiddenPickup, "");
  assert.equal(submitted.hiddenDropoff, "");
  assert.notEqual(submitted.pickupAddress, "Belfast International Airport");
  assert.notEqual(submitted.flightNumber, "EI123");
  console.log("OK  from-airport → to-airport cannot leave a stale airport, address, or flight");
}

console.log("\n=== Airport drop-off → Airport pickup clears stale values ===");
{
  const plan = planJourneyDirectionDependentReset({
    previousIntent: "to-airport",
    nextIntent: "from-airport",
  });
  assert.equal(plan.clearPickup, true);
  assert.equal(plan.clearDropoff, true);
  assert.equal(plan.clearGoingFlight, true);
  assert.equal(plan.applyAirportTo, "pickup");

  const reset = applyJourneyDirectionResetToSnapshot(cityToBhd, plan);
  const submitted = submittedJourneyLocationFields(reset);
  assert.equal(submitted.pickupAddress, "");
  assert.equal(submitted.dropoffAddress, "");
  assert.equal(submitted.flightNumber, "");
  assert.equal(submitted.returnFlightNumber, "");
  assert.equal(submitted.hiddenPickup, "");
  assert.equal(submitted.hiddenDropoff, "");
  assert.notEqual(submitted.dropoffAddress, "George Best Belfast City Airport");
  assert.notEqual(submitted.returnFlightNumber, "FR456");
  console.log("OK  to-airport → from-airport cannot leave a stale airport, address, or flight");
}

console.log("\n=== Address-to-address clears airport-side leftovers ===");
{
  const plan = planJourneyDirectionDependentReset({
    previousIntent: "from-airport",
    nextIntent: "address-to-address",
  });
  assert.equal(plan.clearPickup, true);
  assert.equal(plan.clearGoingFlight, true);
  assert.equal(plan.clearAirportSelection, true);
  const reset = applyJourneyDirectionResetToSnapshot(bfsPickup, plan);
  const submitted = submittedJourneyLocationFields(reset);
  assert.equal(submitted.pickupAddress, "");
  assert.equal(submitted.flightNumber, "");
  assert.equal(submitted.airportCode, "");
  assert.equal(submitted.hiddenPickup, "");
  assert.equal(reset.dropoffAddress, "12 Donegall Square, Belfast");
  console.log("OK  switching to address-to-address drops the airport pickup and flight");
}

console.log("\n=== Same intent is a no-op ===");
{
  const plan = planJourneyDirectionDependentReset({
    previousIntent: "from-airport",
    nextIntent: "from-airport",
  });
  assert.equal(plan.clearPickup, false);
  assert.equal(plan.clearDropoff, false);
  assert.equal(plan.clearGoingFlight, false);
  const reset = applyJourneyDirectionResetToSnapshot(bfsPickup, plan);
  assert.equal(reset.pickupAddress, bfsPickup.pickupAddress);
  assert.equal(reset.goingFlightNumber, "EI123");
  console.log("OK  re-tapping the same direction keeps the current fields");
}

console.log("\n=== QuoteCard applies the helper and keeps customer details ===");
{
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /planJourneyDirectionDependentReset/);
  assert.match(card, /clearConfirmedPickupPlace\(\)/);
  assert.match(card, /clearConfirmedDropoffPlace\(\)/);
  assert.match(card, /setGoingFlightNumber\(""\)/);
  assert.match(card, /setCollectionFlightNumber\(""\)/);
  assert.match(card, /function applyJourneyIntent/);
  const applyStart = card.indexOf("function applyJourneyIntent");
  const applyFn = card.slice(applyStart, applyStart + 2500);
  assert.doesNotMatch(applyFn, /clearDownstreamQuoteChoices\(\)/);
  assert.doesNotMatch(applyFn, /setPassengers\(null\)/);
  assert.doesNotMatch(applyFn, /setCustomerName\(""\)/);
  console.log("OK  direction switch does not wipe name, phone, email, passengers, or luggage");
}

console.log("\nAll journey-direction reset checks passed.");
