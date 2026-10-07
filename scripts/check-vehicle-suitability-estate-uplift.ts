/**
 * Unsuitable vehicles stay visible, the smallest suitable vehicle is selected
 * only when the current one no longer fits, and the Estate uplift defaults to
 * £10 while remaining owner-configurable.
 *
 * Run: npx tsx scripts/check-vehicle-suitability-estate-uplift.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { roundCustomerPayableGbp, roundGbp } from "../shared/gbp";
import {
  defaultOwnerPricingSettings,
  ownerPricingEngineOptions,
  type OwnerPricingSettings,
} from "../shared/owner-pricing-config";
import { resolveSumUpChargeAmountGbp } from "../shared/open-website-payment-fares";
import {
  UNIVERSAL_ESTATE_PREMIUM_GBP,
  calculateUniversalEstateJourneyFareGbp,
} from "../shared/universal-distance-pricing";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { calculateQuote } from "../src/lib/quote";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { QUOTE_REVEAL_BREATHING_PX, QUOTE_REVEAL_SCROLL_MS } from "../src/lib/quote-step-nav-scroll";
import {
  ESTATE_VEHICLE,
  EXECUTIVE_VEHICLE,
  MINIBUS_VEHICLE,
  SALOON_VEHICLE,
  VEHICLE_NOT_SUITABLE_CARD_MESSAGE,
  enabledVehicleTypesForQuote,
  keepOrSmallestSuitableVehicle,
  selectVehicleForParty,
  suitableVehicleTypesForParty,
  vehicleFitsParty,
} from "../src/lib/vehicle-selection";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

function check(label: string, fn: () => void) {
  fn();
  console.log(`OK  ${label}`);
}

const quoteFlags = { publicMinibusEnabled: true, publicExecutiveEnabled: true };

function pricingWithUplift(upliftGbp: number): OwnerPricingSettings {
  const base = defaultOwnerPricingSettings();
  return { ...base, estate: { ...base.estate, upliftGbp }, minibus: { ...base.minibus, publicEnabled: true } };
}

function quoteInput(overrides: Record<string, unknown> = {}) {
  return {
    pickupAddress: "Belfast City Hall, Belfast",
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS" as const,
    fromAirport: false,
    returnJourney: false,
    passengers: 2,
    suitcases: 1,
    routeMetrics: { distanceKm: 22, durationMinutes: 25 },
    pricing: pricingWithUplift(UNIVERSAL_ESTATE_PREMIUM_GBP),
    ...overrides,
  };
}

check("default Estate uplift is £10 and is the single code default", () => {
  assert.equal(UNIVERSAL_ESTATE_PREMIUM_GBP, 10);
  assert.equal(defaultOwnerPricingSettings().estate.upliftGbp, 10);
  assert.equal(ownerPricingEngineOptions().estatePremiumGbp, 10);
  assert.equal(ownerPricingEngineOptions(null).estatePremiumGbp, 10);
  const rootPricing = read("shared/universal-distance-pricing.ts");
  const workerPricing = read("workers/addresses/shared/universal-distance-pricing.ts");
  assert.match(rootPricing, /UNIVERSAL_ESTATE_PREMIUM_GBP = 10/);
  assert.match(workerPricing, /UNIVERSAL_ESTATE_PREMIUM_GBP = 10/);
  assert.doesNotMatch(rootPricing, /UNIVERSAL_ESTATE_PREMIUM_GBP = 6/);
  assert.doesNotMatch(workerPricing, /UNIVERSAL_ESTATE_PREMIUM_GBP = 6/);
  assert.doesNotMatch(read("shared/owner-pricing-config.ts"), /upliftGbp:\s*6|estatePremiumGbp:\s*6|\?\?\s*6/);
  assert.doesNotMatch(read("src/lib/quote.ts"), /estatePremiumGbp:\s*6|\?\?\s*6/);
});

check("unsuitable vehicles stay visible and disabled, and cannot be booked", () => {
  const enabled = enabledVehicleTypesForQuote(quoteFlags);
  assert.deepEqual(enabled, [SALOON_VEHICLE, ESTATE_VEHICLE, EXECUTIVE_VEHICLE, MINIBUS_VEHICLE]);
  const suitable = suitableVehicleTypesForParty(2, 4, quoteFlags);
  assert.equal(vehicleFitsParty(SALOON_VEHICLE, 2, 4), false);
  assert.equal(vehicleFitsParty(EXECUTIVE_VEHICLE, 2, 4), false);
  assert.equal(vehicleFitsParty(ESTATE_VEHICLE, 2, 4), true);
  assert.equal(vehicleFitsParty(MINIBUS_VEHICLE, 2, 4), true);
  assert.ok(enabled.includes(SALOON_VEHICLE));
  assert.ok(enabled.includes(EXECUTIVE_VEHICLE));
  assert.equal(suitable.includes(SALOON_VEHICLE), false);
  assert.equal(suitable.includes(EXECUTIVE_VEHICLE), false);
  assert.equal(VEHICLE_NOT_SUITABLE_CARD_MESSAGE, "Not suitable for your passenger/luggage selection");

  const categories = read("src/components/QuoteVehicleCategories.tsx");
  assert.match(categories, /enabledVehicleTypesForQuote/);
  assert.match(categories, /data-vehicle-suitable=\{fits \? "true" : "false"\}/);
  assert.match(categories, /disabled=\{!fits\}/);
  assert.match(categories, /disabled:opacity-100/);
  assert.match(categories, /h-\[5\.85rem\]/);
  assert.match(categories, /VEHICLE_NOT_SUITABLE_CARD_MESSAGE/);
  assert.doesNotMatch(categories, /opacity-40|opacity-50|Recommended|recommended/i);
  assert.equal(categories.split("VEHICLE_NOT_SUITABLE_CARD_MESSAGE").length, 3);

  const saloon = calculateAuthoritativeWebsiteQuote(
    quoteInput({ passengers: 2, suitcases: 4, vehicleType: SALOON_VEHICLE }),
  );
  const executive = calculateAuthoritativeWebsiteQuote(
    quoteInput({ passengers: 2, suitcases: 4, vehicleType: EXECUTIVE_VEHICLE }),
  );
  assert.equal(saloon.ok, false);
  assert.equal(executive.ok, false);
  if (!saloon.ok && !executive.ok) {
    assert.equal(saloon.reason, "vehicle_unavailable");
    assert.equal(executive.reason, "vehicle_unavailable");
  }
});

check("four large cases follow capacity rules and select the smallest suitable vehicle", () => {
  const auto = selectVehicleForParty(2, 4);
  assert.equal(auto, ESTATE_VEHICLE);
  const switched = keepOrSmallestSuitableVehicle({
    current: SALOON_VEHICLE,
    passengers: 2,
    suitcases: 4,
    ...quoteFlags,
  });
  assert.equal(switched, auto);
  assert.equal(switched, ESTATE_VEHICLE);
  assert.notEqual(switched, EXECUTIVE_VEHICLE);
  assert.notEqual(switched, MINIBUS_VEHICLE);
  const fromExecutive = keepOrSmallestSuitableVehicle({
    current: EXECUTIVE_VEHICLE,
    passengers: 2,
    suitcases: 4,
    ...quoteFlags,
  });
  assert.equal(fromExecutive, selectVehicleForParty(2, 4));
  const selection = read("src/lib/vehicle-selection.ts");
  const helper = selection.slice(
    selection.indexOf("export function keepOrSmallestSuitableVehicle"),
    selection.indexOf("export function suitableVehicleTypesForParty"),
  );
  assert.match(helper, /selectVehicleForParty/);
  assert.doesNotMatch(helper, /suitcases === 4|bags === 4/);
});

check("larger suitable vehicles stay selectable and a still-valid choice is not downgraded", () => {
  const upgraded = keepOrSmallestSuitableVehicle({
    current: ESTATE_VEHICLE,
    passengers: 2,
    suitcases: 2,
    ...quoteFlags,
  });
  assert.equal(upgraded, ESTATE_VEHICLE);
  assert.equal(selectVehicleForParty(2, 2), SALOON_VEHICLE);
  const suitable = suitableVehicleTypesForParty(2, 2, quoteFlags);
  assert.ok(suitable.includes(SALOON_VEHICLE));
  assert.ok(suitable.includes(ESTATE_VEHICLE));
  assert.ok(suitable.includes(EXECUTIVE_VEHICLE));
  assert.ok(suitable.includes(MINIBUS_VEHICLE));
  assert.equal(vehicleFitsParty(SALOON_VEHICLE, 2, 2), true);

  const premium = keepOrSmallestSuitableVehicle({
    current: EXECUTIVE_VEHICLE,
    passengers: 2,
    suitcases: 2,
    ...quoteFlags,
  });
  assert.equal(premium, EXECUTIVE_VEHICLE);
  const minibus = keepOrSmallestSuitableVehicle({
    current: MINIBUS_VEHICLE,
    passengers: 2,
    suitcases: 1,
    ...quoteFlags,
  });
  assert.equal(minibus, MINIBUS_VEHICLE);

  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /keepOrSmallestSuitableVehicle/);
  assert.match(card, /if \(next === explicit\) return/);
  assert.match(card, /if \(!vehicleFitsParty\(next, pax, suitcases\)\) return/);
  assert.match(card, /setVehicle\(next as VehicleType\)/);
  assert.match(card, /vehicle: quoteVehicle/);
});

check("automatic selection prices the selected vehicle and payment uses that uplift", () => {
  const estate = calculateAuthoritativeWebsiteQuote(
    quoteInput({ passengers: 2, suitcases: 4, vehicleType: ESTATE_VEHICLE }),
  );
  const saloon = calculateAuthoritativeWebsiteQuote(
    quoteInput({ passengers: 2, suitcases: 1, vehicleType: SALOON_VEHICLE }),
  );
  assert.equal(estate.ok && estate.vehicleType, ESTATE_VEHICLE);
  assert.equal(saloon.ok, true);
  if (estate.ok && saloon.ok) {
    assert.equal(estate.journeyFareGbp! - saloon.journeyFareGbp!, 10);
    const breakdown = composeWebsiteFareBreakdown({
      journeyFareBeforeAirportAccessGbp: estate.journeyFareGbp!,
      airportAccessChargeGbp: 5,
    });
    const payable = breakdown.finalAmountPayableGbp;
    assert.equal(payable, roundCustomerPayableGbp((estate.journeyFareGbp ?? 0) + 5));
    assert.equal(resolveSumUpChargeAmountGbp(payable, payable), payable);
    assert.equal(resolveSumUpChargeAmountGbp(payable - 3, payable), null);
  }
});

check("owner Estate uplift replaces £10 for the quote and SumUp", () => {
  for (const uplift of [12, 15]) {
    const pricing = pricingWithUplift(uplift);
    const saloon = calculateAuthoritativeWebsiteQuote(
      quoteInput({ vehicleType: SALOON_VEHICLE, pricing }),
    );
    const estate = calculateAuthoritativeWebsiteQuote(
      quoteInput({ passengers: 2, suitcases: 4, vehicleType: ESTATE_VEHICLE, pricing }),
    );
    assert.equal(saloon.ok && estate.ok, true);
    if (saloon.ok && estate.ok) {
      assert.equal(estate.journeyFareGbp! - saloon.journeyFareGbp!, uplift);
      assert.notEqual(estate.journeyFareGbp! - saloon.journeyFareGbp!, 6);
      assert.notEqual(estate.journeyFareGbp! - saloon.journeyFareGbp!, 10);
      const payable = roundCustomerPayableGbp(estate.amount);
      assert.equal(resolveSumUpChargeAmountGbp(payable, payable), payable);
    }
  }
  const savedSix = pricingWithUplift(6);
  const overridden = calculateAuthoritativeWebsiteQuote(
    quoteInput({ passengers: 2, suitcases: 4, vehicleType: ESTATE_VEHICLE, pricing: savedSix }),
  );
  const saloon = calculateAuthoritativeWebsiteQuote(
    quoteInput({ vehicleType: SALOON_VEHICLE, pricing: savedSix }),
  );
  assert.equal(overridden.ok && saloon.ok, true);
  if (overridden.ok && saloon.ok) {
    assert.equal(overridden.journeyFareGbp! - saloon.journeyFareGbp!, 6);
  }
});

check("configured Estate uplift is applied before final whole-pound rounding", () => {
  const uplift = 10.6;
  const pricing = pricingWithUplift(uplift);
  const metrics = { distanceKm: 4 / 0.621371, durationMinutes: 12 };
  const night = { outboundDate: "2026-08-19", outboundTime: "22:00" };
  const saloon = calculateQuote(
    "Belfast City Hall, Belfast BT1 5GS",
    "BHD",
    SALOON_VEHICLE,
    false,
    night,
    metrics,
    false,
    pricing,
  )!;
  const estate = calculateQuote(
    "Belfast City Hall, Belfast BT1 5GS",
    "BHD",
    ESTATE_VEHICLE,
    false,
    night,
    metrics,
    false,
    pricing,
  )!;
  assert.equal(saloon.journeyFareGbp, roundGbp(29 * 1.1));
  const estateBeforeRound = roundGbp((29 + uplift) * 1.1);
  assert.equal(estate.journeyFareGbp, estateBeforeRound);
  assert.equal(calculateUniversalEstateJourneyFareGbp(29, uplift), 29 + uplift);
  const payable = roundCustomerPayableGbp(estate.journeyFareGbp!);
  const upliftAfterWholePound = roundCustomerPayableGbp(saloon.journeyFareGbp!) + uplift;
  assert.notEqual(payable, roundCustomerPayableGbp(upliftAfterWholePound));
  const breakdown = composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: estate.journeyFareGbp!,
  });
  assert.equal(breakdown.finalAmountPayableGbp, payable);
  assert.equal(resolveSumUpChargeAmountGbp(payable, breakdown.finalAmountPayableGbp), payable);
});

check("the vehicle-options scroll runs once, eased, and keeps its stop", () => {
  assert.equal(QUOTE_REVEAL_SCROLL_MS, 720);
  assert.ok(QUOTE_REVEAL_SCROLL_MS >= 600 && QUOTE_REVEAL_SCROLL_MS <= 800);
  assert.equal(QUOTE_REVEAL_BREATHING_PX, 12);
  const scroll = read("src/lib/quote-step-nav-scroll.ts");
  const revealFn = scroll.slice(
    scroll.indexOf("function measureQuoteReveal"),
    scroll.indexOf("export function scheduleBookTransferGlide"),
  );
  assert.match(revealFn, /data-quote-vehicle-options-heading/);
  assert.doesNotMatch(revealFn, /data-quote-result-heading/);
  assert.match(revealFn, /quoteRevealEaseInOut/);
  assert.match(revealFn, /prefersReducedMotion\(\)/);
  assert.match(revealFn, /scrollBehavior = "auto"/);
  assert.doesNotMatch(revealFn, /behavior:\s*"smooth"/);
  const card = read("src/components/QuoteCard.tsx");
  const effect = card.slice(
    card.indexOf("One results scroll, as soon as the results mount."),
    card.indexOf("Reset time→Your Journey"),
  );
  assert.match(effect, /hadRouteSummaryScrollRef\.current = true/);
  assert.match(effect, /scheduleQuoteRevealScroll\(\{/);
  assert.doesNotMatch(effect, /chooseEstate|chooseExecutive|chooseMinibus|serverFare/);
});

console.log("OK  vehicle suitability and Estate uplift");
