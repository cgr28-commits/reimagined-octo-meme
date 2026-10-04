/**
 * Voluntary Estate upgrade uses the dashboard Estate uplift.
 * £6 and £10 are both configurations, not hard-coded UI prices.
 *
 * Run: npx tsx scripts/check-estate-upgrade.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { calculateQuote } from "../src/lib/quote";
import { quoteFareVehiclesToRequest } from "../src/lib/quote-fare-request";
import {
  ESTATE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  partyFitsEstate,
  resolvePublicQuotedVehicle,
  selectVehicleForParty,
  voluntaryEstateUpgradeAllowed,
} from "../src/lib/vehicle-selection";
import { defaultOwnerPricingSettings } from "../shared/owner-pricing-config";
import { composeFareWithExpressDropOff } from "../shared/express-drop-off";
import { RETURN_JOURNEY_DISCOUNT_RATE } from "../shared/return-journey-discount";
import type { OwnerPricingSettings } from "../shared/owner-pricing-config";

const root = path.resolve(import.meta.dirname, "..");
const CITY = "Belfast City Hall, Belfast BT1 5GS";
const metrics = { distanceKm: 4 / 0.621371, durationMinutes: 12 };
const weekday = { outboundDate: "2026-10-07", outboundTime: "10:00" };

function pricingWithUplift(upliftGbp: number): OwnerPricingSettings {
  const settings = defaultOwnerPricingSettings();
  return { ...settings, estate: { upliftGbp } };
}

function check(label: string, fn: () => void) {
  fn();
  console.log(`OK  ${label}`);
}

check("Saloon party can take a voluntary Estate; luggage Estate and Minibus cannot", () => {
  assert.equal(voluntaryEstateUpgradeAllowed(2, 1), true);
  assert.equal(voluntaryEstateUpgradeAllowed(4, 2), true);
  assert.equal(voluntaryEstateUpgradeAllowed(2, 3), false);
  assert.equal(voluntaryEstateUpgradeAllowed(4, 4), false);
  assert.equal(voluntaryEstateUpgradeAllowed(5, 1), false);
  assert.equal(voluntaryEstateUpgradeAllowed(2, 5), false);
  assert.equal(partyFitsEstate(2, 1), true);
  assert.equal(partyFitsEstate(2, 4), true);
  assert.equal(partyFitsEstate(2, 5), false);
  assert.equal(selectVehicleForParty(2, 1), SALOON_VEHICLE);
  assert.equal(selectVehicleForParty(2, 3), ESTATE_VEHICLE);
  assert.equal(selectVehicleForParty(6, 1), MINIBUS_VEHICLE);
});

check("Requested Estate is kept only when the party fits an Estate", () => {
  assert.equal(
    resolvePublicQuotedVehicle(2, 1, ESTATE_VEHICLE),
    ESTATE_VEHICLE,
  );
  assert.equal(resolvePublicQuotedVehicle(2, 1, SALOON_VEHICLE), SALOON_VEHICLE);
  assert.equal(resolvePublicQuotedVehicle(2, 1, undefined), SALOON_VEHICLE);
  assert.equal(resolvePublicQuotedVehicle(2, 3, SALOON_VEHICLE), ESTATE_VEHICLE);
  assert.equal(resolvePublicQuotedVehicle(2, 3, ESTATE_VEHICLE), ESTATE_VEHICLE);
  assert.equal(
    resolvePublicQuotedVehicle(6, 1, ESTATE_VEHICLE, { publicMinibusEnabled: true }),
    MINIBUS_VEHICLE,
  );
  assert.equal(
    resolvePublicQuotedVehicle(2, 5, ESTATE_VEHICLE, { publicMinibusEnabled: true }),
    MINIBUS_VEHICLE,
  );
  assert.equal(
    resolvePublicQuotedVehicle(2, 1, MINIBUS_VEHICLE, { publicMinibusEnabled: false }),
    SALOON_VEHICLE,
  );
  assert.equal(
    resolvePublicQuotedVehicle(2, 1, MINIBUS_VEHICLE, { publicMinibusEnabled: true }),
    MINIBUS_VEHICLE,
  );
});

function fare(vehicle: typeof SALOON_VEHICLE | typeof ESTATE_VEHICLE, upliftGbp: number, returnJourney = false) {
  const quote = calculateQuote(
    CITY,
    "BHD",
    vehicle,
    returnJourney,
    weekday,
    metrics,
    false,
    pricingWithUplift(upliftGbp),
  );
  assert.ok(quote);
  return quote;
}

check("Dashboard uplift £6: Saloon £29, Estate £35", () => {
  const saloon = fare(SALOON_VEHICLE, 6);
  const estate = fare(ESTATE_VEHICLE, 6);
  assert.equal(saloon.journeyFareGbp, 29);
  assert.equal(estate.journeyFareGbp, 35);
  assert.equal(estate.journeyFareGbp - saloon.journeyFareGbp, 6);
});

check("Dashboard uplift £10: Saloon £29, Estate £39", () => {
  const saloon = fare(SALOON_VEHICLE, 10);
  const estate = fare(ESTATE_VEHICLE, 10);
  assert.equal(saloon.journeyFareGbp, 29);
  assert.equal(estate.journeyFareGbp, 39);
  assert.equal(estate.journeyFareGbp - saloon.journeyFareGbp, 10);
});

check("Express Drop-Off stays a separate £5 on Saloon and Estate", () => {
  for (const uplift of [6, 10]) {
    const saloon = fare(SALOON_VEHICLE, uplift).journeyFareGbp;
    const estate = fare(ESTATE_VEHICLE, uplift).journeyFareGbp;
    const saloonFree = composeFareWithExpressDropOff({ transferFareGbp: saloon, expressDropOffFeeGbp: 0 });
    const saloonExpress = composeFareWithExpressDropOff({ transferFareGbp: saloon, expressDropOffFeeGbp: 5 });
    const estateFree = composeFareWithExpressDropOff({ transferFareGbp: estate, expressDropOffFeeGbp: 0 });
    const estateExpress = composeFareWithExpressDropOff({ transferFareGbp: estate, expressDropOffFeeGbp: 5 });
    assert.equal(saloonFree.totalGbp, saloon);
    assert.equal(saloonExpress.totalGbp, saloon + 5);
    assert.equal(estateFree.totalGbp, saloon + uplift);
    assert.equal(estateExpress.totalGbp, saloon + uplift + 5);
  }
});

check("Return discount stays 5% and applies to the Estate fare", () => {
  assert.equal(RETURN_JOURNEY_DISCOUNT_RATE, 0.05);
  for (const uplift of [6, 10]) {
    const oneWay = fare(ESTATE_VEHICLE, uplift, false);
    const returning = fare(ESTATE_VEHICLE, uplift, true);
    const expected = Math.round(oneWay.journeyFareGbp * 2 * (1 - RETURN_JOURNEY_DISCOUNT_RATE) * 100) / 100;
    assert.equal(returning.journeyFareGbp, expected);
    assert.equal(returning.airportFixedCostsGbp, 0);
  }
});

check("Authoritative quote keeps a voluntary Estate and rejects it when a Minibus is required", () => {
  const bfs = { distanceKm: 14 / 0.621371, durationMinutes: 25 };
  const estate = calculateAuthoritativeWebsiteQuote({
    pickupAddress: CITY,
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS",
    fromAirport: false,
    passengers: 2,
    suitcases: 1,
    returnJourney: false,
    routeMetrics: bfs,
    vehicleType: ESTATE_VEHICLE,
    pricing: pricingWithUplift(6),
    outboundDate: weekday.outboundDate,
    outboundTime: weekday.outboundTime,
  });
  const saloon = calculateAuthoritativeWebsiteQuote({
    pickupAddress: CITY,
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS",
    fromAirport: false,
    passengers: 2,
    suitcases: 1,
    returnJourney: false,
    routeMetrics: bfs,
    vehicleType: SALOON_VEHICLE,
    pricing: pricingWithUplift(6),
    outboundDate: weekday.outboundDate,
    outboundTime: weekday.outboundTime,
  });
  assert.equal(estate.ok, true);
  assert.equal(saloon.ok, true);
  if (estate.ok && saloon.ok) {
    assert.equal(estate.vehicleType, ESTATE_VEHICLE);
    assert.equal(saloon.vehicleType, SALOON_VEHICLE);
    assert.equal(estate.journeyFareGbp, (saloon.journeyFareGbp ?? 0) + 6);
  }
  const minibusPricing = pricingWithUplift(6);
  minibusPricing.minibus.publicEnabled = true;
  const minibus = calculateAuthoritativeWebsiteQuote({
    pickupAddress: CITY,
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS",
    fromAirport: false,
    passengers: 6,
    suitcases: 1,
    returnJourney: false,
    routeMetrics: bfs,
    vehicleType: ESTATE_VEHICLE,
    pricing: minibusPricing,
    maxPassengers: 7,
  });
  assert.equal(minibus.ok, true);
  if (minibus.ok) assert.equal(minibus.vehicleType, MINIBUS_VEHICLE);
});

check("Saloon/Estate fare warm-up does not change the existing Minibus pair", () => {
  assert.deepEqual(
    quoteFareVehiclesToRequest({
      selectedVehicle: "Saloon (1–4 passengers)",
      automaticVehicle: "Saloon (1–4 passengers)",
      minibusVehicle: "Minibus (5–7 passengers)",
      publicMinibusEnabled: true,
      requiresMinibus: false,
    }),
    ["Saloon (1–4 passengers)", "Minibus (5–7 passengers)"],
  );
  assert.deepEqual(
    quoteFareVehiclesToRequest({
      selectedVehicle: SALOON_VEHICLE,
      automaticVehicle: SALOON_VEHICLE,
      minibusVehicle: MINIBUS_VEHICLE,
      estateVehicle: ESTATE_VEHICLE,
      publicMinibusEnabled: false,
      requiresMinibus: false,
    }),
    [SALOON_VEHICLE, ESTATE_VEHICLE],
  );
});

check("Upgrade card reads the dashboard uplift and does not hard-code £6", () => {
  const showcase = fs.readFileSync(path.join(root, "src/components/QuoteResultShowcase.tsx"), "utf8");
  const card = fs.readFileSync(path.join(root, "src/components/QuoteCard.tsx"), "utf8");
  const panel = fs.readFileSync(path.join(root, "src/components/OwnerPricingPanel.tsx"), "utf8");
  assert.match(showcase, /data-estate-upgrade/);
  assert.match(showcase, /data-estate-upgrade-selected/);
  assert.match(showcase, /formatGbpAmount\(upliftGbp\)/);
  assert.match(showcase, /Need more space\?/);
  assert.match(showcase, /Switch back to Saloon/);
  assert.match(showcase, /quote-estate\.webp/);
  assert.doesNotMatch(showcase, /\+ £6/);
  assert.doesNotMatch(showcase, /upliftGbp = 6/);
  assert.match(card, /upliftGbp=\{publicPricing\.estate\.upliftGbp\}/);
  assert.match(card, /voluntaryEstateUpgradeAllowed/);
  assert.match(card, /setChooseEstate\(true\)/);
  assert.match(card, /chooseMinibus \|\| pax >= 5 \|\| suitcases >= 5/);
  assert.match(panel, /Uplift over Saloon/);
  assert.match(panel, /draft\.estate\.upliftGbp/);
  assert.doesNotMatch(card, /Quiet Journey|climatePreference|EXECUTIVE_VEHICLE/);
  assert.doesNotMatch(showcase, /Quiet Journey|Executive/);
});

console.log("\nEstate upgrade checks passed.");
