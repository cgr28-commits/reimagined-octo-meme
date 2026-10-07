/**
 * Executive fare = Saloon journey fare × owner multiplier, nearest penny.
 * Airport pickup barrier/parking and Meet & Greet are included, not added again.
 * Run: npx tsx scripts/check-executive-multiplier.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getAirportLegFixedCostGbp } from "../shared/airport-fixed-costs";
import {
  DEFAULT_EXECUTIVE_MULTIPLIER,
  EXECUTIVE_AIRPORT_PICKUP_INCLUDED,
} from "../shared/executive-vehicle";
import { roundGbp } from "../shared/gbp";
import { quoteAirportAccessCharges } from "../shared/meet-greet";
import { resolveExpressDropOff } from "../shared/express-drop-off";
import {
  defaultOwnerPricingSettings,
  normalizeOwnerPricingSettings,
  validateOwnerPricingInput,
} from "../shared/owner-pricing-config";
import { calculateUniversalJourneyFareGbp } from "../shared/universal-distance-pricing";
import { calculateQuote } from "../src/lib/quote";

const EXECUTIVE = "Executive Saloon (1–4 passengers)";
const SALOON = "Standard Saloon (1–4 passengers)";

assert.equal(DEFAULT_EXECUTIVE_MULTIPLIER, 1.5);
assert.match(EXECUTIVE_AIRPORT_PICKUP_INCLUDED, /Meet & Greet/);
assert.match(EXECUTIVE_AIRPORT_PICKUP_INCLUDED, /personalised name board/);
assert.match(EXECUTIVE_AIRPORT_PICKUP_INCLUDED, /luggage assistance/);
assert.match(EXECUTIVE_AIRPORT_PICKUP_INCLUDED, /barrier and parking/);
assert.match(EXECUTIVE_AIRPORT_PICKUP_INCLUDED, /bottled water/);
assert.match(EXECUTIVE_AIRPORT_PICKUP_INCLUDED, /phone charging/);

for (const multiplier of [1.4, 1.5, 1.75, 2]) {
  const priced = calculateUniversalJourneyFareGbp(0, EXECUTIVE, {
    saloonFareGbp: 44,
    executiveMultiplier: multiplier,
  });
  assert.equal(priced.saloonGbp, 44);
  assert.equal(priced.journeyFareGbp, roundGbp(44 * multiplier), `×${multiplier}`);
  assert.notEqual(priced.journeyFareGbp, roundGbp((44 + 10) * multiplier));
}

const minimumRetired = calculateUniversalJourneyFareGbp(0, EXECUTIVE, {
  saloonFareGbp: 29,
  executiveMultiplier: 1.4,
  executiveMinimumGbp: 105,
});
assert.equal(minimumRetired.journeyFareGbp, roundGbp(29 * 1.4));
assert.ok(minimumRetired.journeyFareGbp < 105);

const saloon = calculateUniversalJourneyFareGbp(14, SALOON);
const estate = calculateUniversalJourneyFareGbp(14, "Estate Car (1–4 passengers)");
const minibus = calculateUniversalJourneyFareGbp(14, "Minibus (5–7 passengers)");
assert.equal(estate.journeyFareGbp, saloon.journeyFareGbp + 10);
assert.equal(minibus.journeyFareGbp, roundGbp(estate.journeyFareGbp * 1.55));

const stored = defaultOwnerPricingSettings() as unknown as Record<string, unknown>;
delete stored.executive;
const kept = normalizeOwnerPricingSettings({
  ...stored,
  saloon: { ...defaultOwnerPricingSettings().saloon, minimumFareGbp: 31 },
});
assert.equal(kept.saloon.minimumFareGbp, 31);
assert.equal(kept.executive.multiplier, 1.5);
assert.equal(kept.minibus.multiplier, 1.55);

const saved = validateOwnerPricingInput({
  ...defaultOwnerPricingSettings(),
  executive: { multiplier: 1.75 },
});
assert.equal(saved.ok, true);
if (saved.ok) {
  assert.equal(saved.settings.executive.multiplier, 1.75);
  const fare = calculateUniversalJourneyFareGbp(0, EXECUTIVE, {
    saloonFareGbp: 44,
    executiveMultiplier: saved.settings.executive.multiplier,
  });
  assert.equal(fare.journeyFareGbp, 77);
}

const rejected = validateOwnerPricingInput({
  ...defaultOwnerPricingSettings(),
  executive: { multiplier: 4 },
});
assert.equal(rejected.ok, false);

const dubPickup = getAirportLegFixedCostGbp("DUB", true, { pickupAccessIncluded: true });
const dubPickupNormal = getAirportLegFixedCostGbp("DUB", true);
assert.equal(dubPickupNormal, 9);
assert.equal(dubPickup, 4);
const dubDrop = getAirportLegFixedCostGbp("DUB", false, { pickupAccessIncluded: true });
assert.equal(dubDrop, getAirportLegFixedCostGbp("DUB", false));

const route = { distanceKm: 22, durationMinutes: 30 };
const executiveQuote = calculateQuote(
  "Belfast City Hall",
  "DUB",
  EXECUTIVE,
  false,
  { outboundDate: "2026-10-14", outboundTime: "10:00" },
  route,
  true,
);
const saloonQuote = calculateQuote(
  "Belfast City Hall",
  "DUB",
  SALOON,
  false,
  { outboundDate: "2026-10-14", outboundTime: "10:00" },
  route,
  true,
);
assert.ok(executiveQuote && saloonQuote);
assert.equal(executiveQuote.airportFixedCostsGbp, 4);
assert.equal(saloonQuote.airportFixedCostsGbp, 9);
assert.equal(
  executiveQuote.journeyFareGbp,
  roundGbp(saloonQuote.journeyFareGbp * DEFAULT_EXECUTIVE_MULTIPLIER),
);

const express = resolveExpressDropOff({
  airportCode: "BFS",
  fromAirport: true,
  selected: true,
});
const included = quoteAirportAccessCharges({
  expressLegs: express.legs,
  airportCode: "BFS",
  fromAirport: true,
  outboundChoice: "express",
  meetGreetIncluded: true,
});
assert.equal(included.airportAccessChargeGbp, 0);
assert.equal(included.outboundAirportAccessOption, "meet-greet");
assert.equal(included.expressDropOffFee, 0);

const charged = quoteAirportAccessCharges({
  expressLegs: express.legs,
  airportCode: "BFS",
  fromAirport: true,
  outboundChoice: "meet-greet",
});
assert.equal(charged.airportAccessChargeGbp, 15);

const panel = readFileSync("src/components/OwnerPricingPanel.tsx", "utf8");
assert.match(panel, /data-executive-multiplier/);
assert.match(panel, /Saloon fare ×/);
assert.match(panel, /data-executive-availability/);
assert.match(panel, /resource: "executive"/);
const shortNotice = readFileSync("src/components/OwnerShortNoticePanel.tsx", "utf8");
assert.match(shortNotice, /period\.resource !== "executive"/);
const api = readFileSync("src/lib/short-notice-api.ts", "utf8");
assert.match(api, /input\.resource === "executive"/);

console.log("check-executive-multiplier: ok");
