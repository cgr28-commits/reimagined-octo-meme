/**
 * Airport-pickup flight numbers are a hard requirement for SumUp / booking continue.
 * Run: npx tsx scripts/check-airport-pickup-flight-required.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  FLIGHT_NUMBER_FORMAT_ERROR,
  getAirportPickupFlightNumberBlockers,
  isValidFlightNumberFormat,
  requiresOutboundAirportPickupFlight,
  requiresReturnAirportPickupFlight,
} from "../shared/flight-lookup";
import {
  resolvePaymentAirportContextFromAddresses,
  resolveSumUpChargeAmountGbp,
  checkoutAmountsMatch,
} from "../shared/open-website-payment-fares";

const root = path.resolve(import.meta.dirname, "..");

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

function blockersFor(
  pickup: string,
  dropoff: string,
  opts: {
    returnJourney?: boolean;
    flightNumber?: string;
    returnFlightNumber?: string;
  } = {},
): string[] {
  const ctx = resolvePaymentAirportContextFromAddresses(pickup, dropoff);
  assert.equal(ctx.ok, true, `expected airport context for ${pickup} → ${dropoff}`);
  if (!ctx.ok) return [ctx.error];
  return getAirportPickupFlightNumberBlockers({
    airportContext: ctx.context,
    returnJourney: opts.returnJourney,
    flightNumber: opts.flightNumber,
    returnFlightNumber: opts.returnFlightNumber,
  });
}

const DUB = "Dublin Airport (DUB), Ireland";
const BFS = "Belfast International Airport (BFS), Northern Ireland";
const BHD = "George Best Belfast City Airport (BHD), Northern Ireland";
const LDY = "City of Derry Airport (LDY), Northern Ireland";
const ADDR = "City Hall, Belfast, BT1 5GS, UK";

check("existing format validator accepts BA1234 / EZY456 / FR123 / EI123", () => {
  for (const flight of ["BA1234", "EZY456", "FR123", "EI123"]) {
    assert.equal(isValidFlightNumberFormat(flight), true, flight);
  }
});

check("existing format validator rejects FLOOOOR / ABC / 12345 / blank / random", () => {
  for (const flight of ["FLOOOOR", "ABC", "12345", "", "random text", "  "]) {
    assert.equal(isValidFlightNumberFormat(flight), false, JSON.stringify(flight));
  }
});

check("1. DUB → address + BA1234 → allowed", () => {
  assert.deepEqual(blockersFor(DUB, ADDR, { flightNumber: "BA1234" }), []);
});

check("2. DUB → address + FLOOOOR → blocked", () => {
  const blockers = blockersFor(DUB, ADDR, { flightNumber: "FLOOOOR" });
  assert.equal(blockers.length > 0, true);
  assert.equal(blockers[0], FLIGHT_NUMBER_FORMAT_ERROR);
});

check("3. DUB → address + blank flight number → blocked", () => {
  const blockers = blockersFor(DUB, ADDR, { flightNumber: "" });
  assert.equal(blockers.length > 0, true);
  assert.equal(blockers[0], FLIGHT_NUMBER_FORMAT_ERROR);
});

check("4. BFS → address + valid flight number → allowed", () => {
  assert.deepEqual(blockersFor(BFS, ADDR, { flightNumber: "EZY456" }), []);
});

check("5. BHD → address + invalid flight number → blocked", () => {
  const blockers = blockersFor(BHD, ADDR, { flightNumber: "FLOOOOR" });
  assert.equal(blockers.length > 0, true);
});

check("6. LDY → address + invalid flight number → blocked", () => {
  const blockers = blockersFor(LDY, ADDR, { flightNumber: "ABC" });
  assert.equal(blockers.length > 0, true);
});

check("7. Address → DUB → no flight number required", () => {
  assert.deepEqual(blockersFor(ADDR, DUB, { flightNumber: "" }), []);
  const ctx = resolvePaymentAirportContextFromAddresses(ADDR, DUB);
  assert.equal(ctx.ok, true);
  if (ctx.ok) {
    assert.equal(requiresOutboundAirportPickupFlight(ctx.context), false);
    assert.equal(ctx.context.fromAirport, false);
  }
});

check("8. Address → BFS → no flight number required", () => {
  assert.deepEqual(blockersFor(ADDR, BFS, { flightNumber: "" }), []);
});

check("9. DUB → BFS airport-to-airport → pickup flight number required", () => {
  const ctx = resolvePaymentAirportContextFromAddresses(DUB, BFS);
  assert.equal(ctx.ok, true);
  if (ctx.ok) {
    assert.equal(ctx.context.isAirportToAirport, true);
    assert.equal(requiresOutboundAirportPickupFlight(ctx.context), true);
  }
  assert.equal(blockersFor(DUB, BFS, { flightNumber: "" }).length > 0, true);
  assert.deepEqual(blockersFor(DUB, BFS, { flightNumber: "EI123" }), []);
});

check("10. Return journey where return leg starts at airport → valid return flight required", () => {
  // Address → DUB outbound; return collects from DUB.
  const ctx = resolvePaymentAirportContextFromAddresses(ADDR, DUB);
  assert.equal(ctx.ok, true);
  if (ctx.ok) {
    assert.equal(requiresReturnAirportPickupFlight(ctx.context, true), true);
    assert.equal(requiresOutboundAirportPickupFlight(ctx.context), false);
  }
  assert.equal(
    blockersFor(ADDR, DUB, {
      returnJourney: true,
      flightNumber: "",
      returnFlightNumber: "",
    }).length > 0,
    true,
  );
  assert.equal(
    blockersFor(ADDR, DUB, {
      returnJourney: true,
      flightNumber: "",
      returnFlightNumber: "FLOOOOR",
    }).length > 0,
    true,
  );
  assert.deepEqual(
    blockersFor(ADDR, DUB, {
      returnJourney: true,
      flightNumber: "",
      returnFlightNumber: "BA1234",
    }),
    [],
  );

  // A2A return: both legs need flights.
  assert.equal(
    blockersFor(DUB, BFS, {
      returnJourney: true,
      flightNumber: "BA1234",
      returnFlightNumber: "",
    }).length > 0,
    true,
  );
  assert.deepEqual(
    blockersFor(DUB, BFS, {
      returnJourney: true,
      flightNumber: "BA1234",
      returnFlightNumber: "EZY456",
    }),
    [],
  );
});

check("11. Direct payment API path rejects missing/invalid flight before SumUp", () => {
  const index = fs.readFileSync(
    path.join(root, "workers/addresses/src/index.ts"),
    "utf8",
  );
  assert.match(index, /getAirportPickupFlightNumberBlockers/);
  assert.match(index, /code: "invalid_flight_number"/);
  assert.match(index, /resolvePaymentAirportContextFromAddresses/);
  // Must run before createSumUpHostedCheckout.
  const flightGateAt = index.indexOf("getAirportPickupFlightNumberBlockers");
  const sumUpAt = index.indexOf("createSumUpHostedCheckout(apiKey");
  assert.ok(flightGateAt > 0 && sumUpAt > flightGateAt);

  const createPayment = fs.readFileSync(
    path.join(root, "src/lib/create-payment.ts"),
    "utf8",
  );
  assert.match(createPayment, /getAirportPickupFlightNumberBlockers/);

  const card = fs.readFileSync(path.join(root, "src/components/QuoteCard.tsx"), "utf8");
  assert.match(card, /validateRequiredFlightNumbers/);
  assert.match(card, /FLIGHT_NUMBER_FORMAT_ERROR/);
  assert.doesNotMatch(card, /Flight numbers are optional/);
  assert.doesNotMatch(card, /clearFlightBlockingErrors/);
  assert.match(card, /\(required\)/);
});

check("12. Valid flight number does not change the fare", () => {
  // Fare charge helpers ignore flight numbers entirely.
  assert.equal(checkoutAmountsMatch(138, 138), true);
  assert.equal(resolveSumUpChargeAmountGbp(138, 138), 138);
  assert.equal(resolveSumUpChargeAmountGbp(138, 138.01), 138);

  const withFlight = blockersFor(DUB, ADDR, { flightNumber: "BA1234" });
  const stillAllowed = blockersFor(DUB, ADDR, { flightNumber: "EI123" });
  assert.deepEqual(withFlight, []);
  assert.deepEqual(stillAllowed, []);

  const fareSource = fs.readFileSync(
    path.join(root, "shared/open-website-payment-fares.ts"),
    "utf8",
  );
  assert.doesNotMatch(fareSource, /flightNumber/);
  assert.match(fareSource, /resolveSumUpChargeAmountGbp/);
});

console.log("\nAll airport-pickup flight requirement checks passed.");
