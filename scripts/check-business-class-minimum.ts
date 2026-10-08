/**
 * Adjustable Business Class minimum fare.
 * Run: npx tsx scripts/check-business-class-minimum.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roundCustomerPayableGbp, roundGbp } from "../shared/gbp";
import {
  DEFAULT_BUSINESS_CLASS_MINIMUM_FARE_GBP,
  applyBusinessClassOneWayFloor,
  businessClassFlooredPayableGbp,
} from "../shared/business-class-minimum";
import {
  defaultOwnerPricingSettings,
  normalizeOwnerPricingSettings,
  ownerPricingEngineOptions,
  validateOwnerPricingInput,
} from "../shared/owner-pricing-config";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { UNIVERSAL_ESTATE_PREMIUM_GBP, calculateUniversalJourneyFareGbp } from "../shared/universal-distance-pricing";
import { calculateQuote } from "../src/lib/quote";

const EXECUTIVE = "Executive Saloon (1–4 passengers)";
const SALOON = "Standard Saloon (1–4 passengers)";
const ESTATE = "Estate Car (1–4 passengers)";
const MINIBUS = "Minibus (5–7 passengers)";

assert.equal(DEFAULT_BUSINESS_CLASS_MINIMUM_FARE_GBP, 75);
assert.equal(defaultOwnerPricingSettings().executive.minimumFareGbp, 75);
assert.equal(defaultOwnerPricingSettings().estate.upliftGbp, 10);
assert.equal(UNIVERSAL_ESTATE_PREMIUM_GBP, 10);
assert.equal(ownerPricingEngineOptions().executiveMinimumFareGbp, 75);

const stored = defaultOwnerPricingSettings() as unknown as Record<string, unknown>;
const executive = { ...(stored.executive as object) } as Record<string, unknown>;
delete executive.minimumFareGbp;
stored.executive = executive;
stored.saloon = { ...defaultOwnerPricingSettings().saloon, minimumFareGbp: 31 };
const kept = normalizeOwnerPricingSettings(stored);
assert.equal(kept.saloon.minimumFareGbp, 31);
assert.equal(kept.executive.multiplier, 1.5);
assert.equal(kept.executive.minimumFareGbp, 75);
assert.equal(kept.estate.upliftGbp, 10);

for (const amount of [65, 85, 100, 120, 0]) {
  const saved = validateOwnerPricingInput({
    ...defaultOwnerPricingSettings(),
    executive: { ...defaultOwnerPricingSettings().executive, minimumFareGbp: amount },
  });
  assert.equal(saved.ok, true, String(amount));
  if (saved.ok) assert.equal(saved.settings.executive.minimumFareGbp, amount);
}

const negative = validateOwnerPricingInput({
  ...defaultOwnerPricingSettings(),
  executive: { ...defaultOwnerPricingSettings().executive, minimumFareGbp: -1 },
});
assert.equal(negative.ok, false);

const blank = validateOwnerPricingInput({
  ...defaultOwnerPricingSettings(),
  executive: { ...defaultOwnerPricingSettings().executive, minimumFareGbp: "" },
});
assert.equal(blank.ok, false);

for (const [normal, expected] of [
  [50, 75],
  [65, 75],
  [74, 75],
  [85, 85],
  [110, 110],
] as const) {
  assert.equal(applyBusinessClassOneWayFloor(normal, 75), expected, `£${normal}`);
  const payable = businessClassFlooredPayableGbp({
    minimumFareGbp: 75,
    returnJourney: false,
    outboundOneWayBeforeAccessGbp: normal,
  });
  if (normal >= 75) assert.equal(payable, null);
  else assert.equal(payable, expected);
}

assert.equal(
  businessClassFlooredPayableGbp({
    minimumFareGbp: 75,
    returnJourney: false,
    outboundOneWayBeforeAccessGbp: 70,
    outboundAirportAccessChargeGbp: 5,
  }),
  null,
);
assert.equal(
  businessClassFlooredPayableGbp({
    minimumFareGbp: 75,
    returnJourney: false,
    outboundOneWayBeforeAccessGbp: 60,
    outboundAirportAccessChargeGbp: 5,
  }),
  75,
);
assert.notEqual(
  businessClassFlooredPayableGbp({
    minimumFareGbp: 75,
    returnJourney: false,
    outboundOneWayBeforeAccessGbp: 60,
    outboundAirportAccessChargeGbp: 5,
  }),
  80,
);
assert.equal(
  businessClassFlooredPayableGbp({
    minimumFareGbp: 75,
    returnJourney: false,
    outboundOneWayBeforeAccessGbp: 80,
    outboundAirportAccessChargeGbp: 5,
  }),
  null,
);

const returnBelow = businessClassFlooredPayableGbp({
  minimumFareGbp: 75,
  returnJourney: true,
  returnDiscountRate: 0.05,
  outboundOneWayBeforeAccessGbp: 50,
  returnOneWayBeforeAccessGbp: 50,
});
assert.equal(returnBelow, roundCustomerPayableGbp(150 * 0.95));
assert.equal(returnBelow, 143);
assert.ok((returnBelow ?? 0) < 150);

const returnAbove = businessClassFlooredPayableGbp({
  minimumFareGbp: 75,
  returnJourney: true,
  returnDiscountRate: 0.05,
  outboundOneWayBeforeAccessGbp: 110,
  returnOneWayBeforeAccessGbp: 110,
});
assert.equal(returnAbove, null);

function payable(input: {
  journey: number;
  access?: number;
  minimum?: number;
  returnJourney?: boolean;
  vehicle?: "executive" | "other";
}) {
  const access = input.access ?? 0;
  const executive = input.vehicle !== "other";
  return composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: input.returnJourney
      ? roundGbp(input.journey * 2 * 0.95)
      : input.journey,
    airportAccessChargeGbp: input.returnJourney ? access * 2 : access,
    outboundAirportAccessChargeGbp: access,
    returnAirportAccessChargeGbp: input.returnJourney ? access : 0,
    returnJourney: input.returnJourney,
    ...(executive
      ? {
          businessClassMinimumFareGbp: input.minimum ?? 75,
          outboundOneWayBeforeAccessGbp: input.journey,
          returnOneWayBeforeAccessGbp: input.returnJourney ? input.journey : undefined,
          returnDiscountRate: 0.05,
        }
      : {}),
  }).finalAmountPayableGbp;
}

assert.equal(payable({ journey: 50, minimum: 75 }), 75);
assert.equal(payable({ journey: 50, minimum: 90 }), 90);
assert.equal(payable({ journey: 50, minimum: 75 }), 75);
assert.equal(payable({ journey: 110, minimum: 90 }), 110);
assert.equal(payable({ journey: 60, access: 5, minimum: 75 }), 75);
assert.equal(payable({ journey: 80, access: 5, minimum: 75 }), 85);
assert.equal(payable({ journey: 50, returnJourney: true, minimum: 75 }), 143);
assert.equal(payable({ journey: 50, vehicle: "other", minimum: 90 }), 50);
assert.equal(payable({ journey: 44, vehicle: "other" }), 44);

const atNinety = composeWebsiteFareBreakdown({
  journeyFareBeforeAirportAccessGbp: 50,
  businessClassMinimumFareGbp: 90,
  outboundOneWayBeforeAccessGbp: 50,
  returnDiscountRate: 0.05,
});
assert.equal(atNinety.finalAmountPayableGbp, 90);
const backToSeventyFive = composeWebsiteFareBreakdown({
  journeyFareBeforeAirportAccessGbp: 50,
  businessClassMinimumFareGbp: 75,
  outboundOneWayBeforeAccessGbp: 50,
  returnDiscountRate: 0.05,
});
assert.equal(backToSeventyFive.finalAmountPayableGbp, 75);

const route = { distanceKm: 8, durationMinutes: 15 };
const schedule = { outboundDate: "2026-10-14", outboundTime: "10:00" };
const saloon = calculateQuote("Belfast City Hall", "BFS", SALOON, false, schedule, route, true);
const estate = calculateQuote("Belfast City Hall", "BFS", ESTATE, false, schedule, route, true);
const minibus = calculateQuote("Belfast City Hall", "BFS", MINIBUS, false, schedule, route, true);
const executiveQuote = calculateQuote("Belfast City Hall", "BFS", EXECUTIVE, false, schedule, route, true);
assert.ok(saloon && estate && minibus && executiveQuote);
assert.equal(estate.amount, saloon.amount + 10);
assert.equal(minibus.journeyFareGbp, roundGbp((estate.journeyFareGbp ?? 0) * 1.55));
assert.equal(
  executiveQuote.journeyFareGbp,
  roundGbp((saloon.journeyFareGbp ?? 0) * 1.5),
);
assert.ok((executiveQuote.outboundOneWayBeforeAccessGbp ?? 0) > 0);

const pricedAtDefault = composeWebsiteFareBreakdown({
  journeyFareBeforeAirportAccessGbp: executiveQuote.journeyFareGbp ?? executiveQuote.amount,
  airportFixedCostsGbp: executiveQuote.airportFixedCostsGbp ?? 0,
  nightWeekendSurchargeGbp: executiveQuote.nightWeekendSurchargeGbp ?? 0,
  businessClassMinimumFareGbp: 75,
  outboundOneWayBeforeAccessGbp: executiveQuote.outboundOneWayBeforeAccessGbp,
  returnDiscountRate: 0.05,
});
const pricedAtNinety = composeWebsiteFareBreakdown({
  journeyFareBeforeAirportAccessGbp: executiveQuote.journeyFareGbp ?? executiveQuote.amount,
  airportFixedCostsGbp: executiveQuote.airportFixedCostsGbp ?? 0,
  nightWeekendSurchargeGbp: executiveQuote.nightWeekendSurchargeGbp ?? 0,
  businessClassMinimumFareGbp: 90,
  outboundOneWayBeforeAccessGbp: executiveQuote.outboundOneWayBeforeAccessGbp,
  returnDiscountRate: 0.05,
});
const normalExecutive = executiveQuote.outboundOneWayBeforeAccessGbp ?? 0;
if (normalExecutive < 75) {
  assert.equal(pricedAtDefault.finalAmountPayableGbp, 75);
  assert.equal(pricedAtNinety.finalAmountPayableGbp, 90);
} else if (normalExecutive < 90) {
  assert.equal(pricedAtDefault.finalAmountPayableGbp, roundCustomerPayableGbp(normalExecutive));
  assert.equal(pricedAtNinety.finalAmountPayableGbp, 90);
} else {
  assert.equal(pricedAtDefault.finalAmountPayableGbp, roundCustomerPayableGbp(normalExecutive));
  assert.equal(pricedAtNinety.finalAmountPayableGbp, roundCustomerPayableGbp(normalExecutive));
}
assert.equal(
  calculateUniversalJourneyFareGbp(0, EXECUTIVE, {
    saloonFareGbp: 29,
    executiveMultiplier: 1.4,
    executiveMinimumGbp: 105,
  }).journeyFareGbp,
  roundGbp(29 * 1.4),
);

const confirmedBooking = { status: "confirmed", amountPaidGbp: 66 };
assert.equal(confirmedBooking.amountPaidGbp, 66);
assert.equal(
  businessClassFlooredPayableGbp({
    minimumFareGbp: 90,
    returnJourney: false,
    outboundOneWayBeforeAccessGbp: 50,
  }),
  90,
);
assert.equal(confirmedBooking.amountPaidGbp, 66);

const panel = readFileSync("src/components/OwnerPricingPanel.tsx", "utf8");
assert.match(panel, /Business Class Minimum Fare/);
assert.match(panel, /data-business-class-minimum/);
assert.match(panel, /Save Changes/);
assert.match(panel, /New quotes use this amount/);
assert.match(panel, /data-executive-multiplier/);

const quoteCard = readFileSync("src/components/QuoteCard.tsx", "utf8");
assert.match(quoteCard, /businessClassMinimumFareGbp/);
assert.doesNotMatch(quoteCard, /w-\[3\.1rem\]/);

console.log("OK  business class minimum fare");
