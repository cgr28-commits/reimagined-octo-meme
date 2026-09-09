/**
 * Luggage change must switch Saloon ↔ Estate and the fare together.
 * Stale Worker fare splits from the previous vehicle must never paint.
 * Run: npx tsx scripts/check-quote-vehicle-fare-refresh.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  EXPRESS_DROP_OFF_FEES_GBP,
  composeFareWithExpressDropOff,
} from "../shared/express-drop-off";
import { UNIVERSAL_ESTATE_PREMIUM_GBP } from "../shared/universal-distance-pricing";
import {
  resolveDisplayJourneyFareGbp,
  serverFareAppliesToParty,
  type ServerFarePartyParts,
} from "../src/lib/quote-display-fare";
import { calculateQuote } from "../src/lib/quote";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import {
  ESTATE_VEHICLE,
  SALOON_VEHICLE,
  selectVehicleForParty,
} from "../src/lib/vehicle-selection";

const root = path.resolve(import.meta.dirname, "..");
const cityHall = "Belfast City Hall, Belfast BT1 5GS";
const cityBfsMetrics = { distanceKm: 14 / 0.621371, durationMinutes: 25 };
const cityBhdMetrics = { distanceKm: 4 / 0.621371, durationMinutes: 12 };

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function journeyFare(quote: { journeyFareGbp?: number; amount: number }): number {
  return typeof quote.journeyFareGbp === "number" ? quote.journeyFareGbp : quote.amount;
}

function staleSaloonParts(saloonFare: number): ServerFarePartyParts {
  return {
    journeyFareGbp: saloonFare,
    airportFixedCostsGbp: 0,
    amountGbp: saloonFare,
    vehicleType: SALOON_VEHICLE,
    passengers: 2,
    suitcases: 2,
  };
}

console.log("=== Estate premium stays £6 in the pricing engine ===");
{
  assert.equal(UNIVERSAL_ESTATE_PREMIUM_GBP, 6);
  assert.equal(selectVehicleForParty(2, 2), SALOON_VEHICLE);
  assert.equal(selectVehicleForParty(2, 3), ESTATE_VEHICLE);
  console.log("OK  2p/2 bags = Saloon; 2p/3 bags = Estate; premium £6");
}

console.log("\n=== BFS: luggage Saloon → Estate changes fare immediately by £6 ===");
{
  const saloon = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, {}, cityBfsMetrics);
  const estate = calculateQuote(cityHall, "BFS", ESTATE_VEHICLE, false, {}, cityBfsMetrics);
  assert.ok(saloon && estate);
  const saloonFare = journeyFare(saloon);
  const estateFare = journeyFare(estate);
  assert.equal(estateFare, saloonFare + 6, "BFS Estate journey = Saloon + £6");

  const afterLuggageChange = resolveDisplayJourneyFareGbp({
    liveJourneyFareGbp: estate.journeyFareGbp ?? estate.amount,
    liveAmountGbp: estate.amount,
    serverFareParts: staleSaloonParts(saloonFare),
    passengers: 2,
    suitcases: 3,
    vehicleType: ESTATE_VEHICLE,
  });
  assert.equal(afterLuggageChange, estateFare);
  assert.notEqual(afterLuggageChange, saloonFare);
  assert.equal(afterLuggageChange! - saloonFare, 6);

  const backToSaloon = resolveDisplayJourneyFareGbp({
    liveJourneyFareGbp: saloon.journeyFareGbp ?? saloon.amount,
    liveAmountGbp: saloon.amount,
    serverFareParts: {
      ...staleSaloonParts(estateFare),
      vehicleType: ESTATE_VEHICLE,
      suitcases: 3,
    },
    passengers: 2,
    suitcases: 2,
    vehicleType: SALOON_VEHICLE,
  });
  assert.equal(backToSaloon, saloonFare);

  const authoritativeSaloon = calculateAuthoritativeWebsiteQuote({
    pickupAddress: cityHall,
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS",
    fromAirport: false,
    passengers: 2,
    suitcases: 2,
    returnJourney: false,
    routeMetrics: cityBfsMetrics,
  });
  const authoritativeEstate = calculateAuthoritativeWebsiteQuote({
    pickupAddress: cityHall,
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS",
    fromAirport: false,
    passengers: 2,
    suitcases: 3,
    returnJourney: false,
    routeMetrics: cityBfsMetrics,
  });
  assert.equal(authoritativeSaloon.ok, true);
  assert.equal(authoritativeEstate.ok, true);
  if (authoritativeSaloon.ok && authoritativeEstate.ok) {
    assert.match(authoritativeSaloon.vehicleType, /Saloon/i);
    assert.match(authoritativeEstate.vehicleType, /Estate/i);
    const sFare = authoritativeSaloon.journeyFareGbp ?? authoritativeSaloon.amount;
    const eFare = authoritativeEstate.journeyFareGbp ?? authoritativeEstate.amount;
    assert.equal(eFare - sFare, 6);
  }
  console.log(`OK  BFS Saloon £${saloonFare} → Estate £${estateFare}`);
}

console.log("\n=== BHD: same luggage switch is immediately +£6 ===");
{
  const saloon = calculateQuote(cityHall, "BHD", SALOON_VEHICLE, false, {}, cityBhdMetrics);
  const estate = calculateQuote(cityHall, "BHD", ESTATE_VEHICLE, false, {}, cityBhdMetrics);
  assert.ok(saloon && estate);
  assert.equal(journeyFare(estate), journeyFare(saloon) + 6);

  const displayed = resolveDisplayJourneyFareGbp({
    liveJourneyFareGbp: estate.journeyFareGbp ?? estate.amount,
    liveAmountGbp: estate.amount,
    serverFareParts: staleSaloonParts(journeyFare(saloon)),
    passengers: 2,
    suitcases: 4,
    vehicleType: ESTATE_VEHICLE,
  });
  assert.equal(displayed, journeyFare(estate));
  console.log(`OK  BHD Saloon £${journeyFare(saloon)} → Estate £${journeyFare(estate)}`);
}

console.log("\n=== Express £5 / £4 stay separate from the vehicle fare ===");
{
  const saloon = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, {}, cityBfsMetrics)!;
  const estate = calculateQuote(cityHall, "BFS", ESTATE_VEHICLE, false, {}, cityBfsMetrics)!;
  const saloonJourney = journeyFare(saloon);
  const estateJourney = journeyFare(estate);

  const saloonExpress = composeFareWithExpressDropOff({
    transferFareGbp: saloonJourney,
    expressDropOffFeeGbp: EXPRESS_DROP_OFF_FEES_GBP.BFS,
  });
  const estateExpress = composeFareWithExpressDropOff({
    transferFareGbp: estateJourney,
    expressDropOffFeeGbp: EXPRESS_DROP_OFF_FEES_GBP.BFS,
  });
  assert.equal(saloonExpress.expressDropOffFeeGbp, 5);
  assert.equal(estateExpress.expressDropOffFeeGbp, 5);
  assert.equal(estateExpress.transferFareGbp, saloonExpress.transferFareGbp + 6);
  assert.equal(estateExpress.totalGbp, saloonExpress.totalGbp + 6);

  const saloonFree = composeFareWithExpressDropOff({
    transferFareGbp: saloonJourney,
    expressDropOffFeeGbp: 0,
  });
  const estateFree = composeFareWithExpressDropOff({
    transferFareGbp: estateJourney,
    expressDropOffFeeGbp: 0,
  });
  assert.equal(saloonFree.totalGbp, saloonJourney);
  assert.equal(estateFree.totalGbp, estateJourney);
  assert.equal(estateFree.totalGbp, saloonFree.totalGbp + 6);

  const bhdSaloon = calculateQuote(cityHall, "BHD", SALOON_VEHICLE, false, {}, cityBhdMetrics)!;
  const bhdEstate = calculateQuote(cityHall, "BHD", ESTATE_VEHICLE, false, {}, cityBhdMetrics)!;
  const bhdSaloonExpress = composeFareWithExpressDropOff({
    transferFareGbp: journeyFare(bhdSaloon),
    expressDropOffFeeGbp: EXPRESS_DROP_OFF_FEES_GBP.BHD,
  });
  const bhdEstateExpress = composeFareWithExpressDropOff({
    transferFareGbp: journeyFare(bhdEstate),
    expressDropOffFeeGbp: EXPRESS_DROP_OFF_FEES_GBP.BHD,
  });
  assert.equal(bhdSaloonExpress.expressDropOffFeeGbp, 4);
  assert.equal(bhdEstateExpress.totalGbp, bhdSaloonExpress.totalGbp + 6);
  console.log("OK  BFS +£5 / BHD +£4 stay on top of the vehicle journey fare");
}

console.log("\n=== Return journeys keep Estate = Saloon + £6 on the one-way fare ===");
{
  const oneWaySaloon = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, false, {}, cityBfsMetrics);
  const oneWayEstate = calculateQuote(cityHall, "BFS", ESTATE_VEHICLE, false, {}, cityBfsMetrics);
  const returnSaloon = calculateQuote(cityHall, "BFS", SALOON_VEHICLE, true, {}, cityBfsMetrics);
  const returnEstate = calculateQuote(cityHall, "BFS", ESTATE_VEHICLE, true, {}, cityBfsMetrics);
  assert.ok(oneWaySaloon && oneWayEstate && returnSaloon && returnEstate);
  assert.equal(journeyFare(oneWayEstate), journeyFare(oneWaySaloon) + 6);
  assert.ok(journeyFare(returnEstate) > journeyFare(returnSaloon));
  const displayed = resolveDisplayJourneyFareGbp({
    liveJourneyFareGbp: returnEstate.journeyFareGbp ?? returnEstate.amount,
    liveAmountGbp: returnEstate.amount,
    serverFareParts: {
      ...staleSaloonParts(journeyFare(returnSaloon)),
      vehicleType: SALOON_VEHICLE,
    },
    passengers: 2,
    suitcases: 3,
    vehicleType: ESTATE_VEHICLE,
  });
  assert.equal(displayed, journeyFare(returnEstate));
  console.log(
    `OK  BFS return uses Estate fare £${journeyFare(returnEstate)} immediately (not stale £${journeyFare(returnSaloon)})`,
  );
}

console.log("\n=== QuoteCard drops stale server fares when the vehicle changes ===");
{
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /serverFareAppliesToParty/);
  assert.match(card, /currentServerFareParts/);
  assert.match(card, /getAutoVehicle\(pax, suitcases/);
  assert.match(card, /requestedVehicle/);
  assert.match(card, /serverQuoteGenRef/);
  assert.doesNotMatch(
    card,
    /if \(serverFareParts\) \{\s*const fixedFromLines/,
  );
  console.log("OK  QuoteCard ignores Worker splits that belong to the previous vehicle");
}

console.log("\nAll quote vehicle fare-refresh checks passed.");
