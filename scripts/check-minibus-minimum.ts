/**
 * Adjustable 7 Seater Minibus minimum fare.
 * Run: npx tsx scripts/check-minibus-minimum.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roundCustomerPayableGbp, roundGbp } from "../shared/gbp";
import {
  DEFAULT_BUSINESS_CLASS_MINIMUM_FARE_GBP,
  DEFAULT_MINIBUS_MINIMUM_FARE_GBP,
  businessClassFlooredPayableGbp,
  vehicleMinimumFareBreakdownFields,
} from "../shared/business-class-minimum";
import {
  defaultOwnerPricingSettings,
  normalizeOwnerPricingSettings,
  ownerPricingEngineOptions,
  validateOwnerPricingInput,
} from "../shared/owner-pricing-config";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import {
  checkoutAmountsMatch,
  resolveSumUpChargeAmountGbp,
} from "../shared/open-website-payment-fares";
import { calculateQuote } from "../src/lib/quote";

const SALOON = "Standard Saloon (1–4 passengers)";
const ESTATE = "Estate Car (1–4 passengers)";
const MINIBUS = "Minibus (5–7 passengers)";
const EXECUTIVE = "Executive Saloon (1–4 passengers)";

assert.equal(DEFAULT_MINIBUS_MINIMUM_FARE_GBP, 90);
assert.equal(defaultOwnerPricingSettings().minibus.minimumFareGbp, 90);
assert.equal(ownerPricingEngineOptions().minibusMinimumFareGbp, 90);
assert.equal(defaultOwnerPricingSettings().executive.minimumFareGbp, DEFAULT_BUSINESS_CLASS_MINIMUM_FARE_GBP);
assert.equal(defaultOwnerPricingSettings().minibus.multiplier, 1.55);

const storedWithoutMinimum = defaultOwnerPricingSettings();
const minibus = { ...storedWithoutMinimum.minibus };
delete (minibus as { minimumFareGbp?: number }).minimumFareGbp;
const kept = normalizeOwnerPricingSettings({
  ...storedWithoutMinimum,
  minibus: { ...minibus, multiplier: 1.6, publicEnabled: true },
});
assert.equal(kept.minibus.multiplier, 1.6);
assert.equal(kept.minibus.publicEnabled, true);
assert.equal(kept.minibus.minimumFareGbp, 90);
assert.equal(kept.executive.minimumFareGbp, 75);

function reloadSavedPricing(input: unknown) {
  const saved = validateOwnerPricingInput(input);
  assert.equal(saved.ok, true);
  if (!saved.ok) throw new Error("expected a valid pricing save");
  const refreshed = normalizeOwnerPricingSettings(JSON.parse(JSON.stringify(saved.settings)));
  return { saved: saved.settings, refreshed };
}

for (const amount of [0, 90, 100, 110, 2000]) {
  const saved = validateOwnerPricingInput({
    ...defaultOwnerPricingSettings(),
    minibus: { ...defaultOwnerPricingSettings().minibus, minimumFareGbp: amount },
  });
  assert.equal(saved.ok, true, `£${amount} should save`);
  if (saved.ok) assert.equal(saved.settings.minibus.minimumFareGbp, amount);
}

for (const amount of [-1, 2000.01]) {
  const saved = validateOwnerPricingInput({
    ...defaultOwnerPricingSettings(),
    minibus: { ...defaultOwnerPricingSettings().minibus, minimumFareGbp: amount },
  });
  assert.equal(saved.ok, false, `£${amount} should be rejected`);
}

const blank = validateOwnerPricingInput({
  ...defaultOwnerPricingSettings(),
  minibus: { ...defaultOwnerPricingSettings().minibus, minimumFareGbp: "" },
});
assert.equal(blank.ok, false);

function payable(input: {
  journey: number;
  access?: number;
  minimum?: number;
  returnJourney?: boolean;
  vehicle?: "minibus" | "executive" | "other";
}) {
  const access = input.access ?? 0;
  const vehicle = input.vehicle ?? "minibus";
  const floor =
    vehicle === "minibus"
      ? {
          minibusMinimumFareGbp: input.minimum ?? 90,
          outboundOneWayBeforeAccessGbp: input.journey,
          returnOneWayBeforeAccessGbp: input.returnJourney ? input.journey : undefined,
          returnDiscountRate: 0.05,
        }
      : vehicle === "executive"
        ? {
            businessClassMinimumFareGbp: input.minimum ?? 75,
            outboundOneWayBeforeAccessGbp: input.journey,
            returnOneWayBeforeAccessGbp: input.returnJourney ? input.journey : undefined,
            returnDiscountRate: 0.05,
          }
        : {};
  return composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: input.returnJourney
      ? roundGbp(input.journey * 2 * 0.95)
      : input.journey,
    airportAccessChargeGbp: input.returnJourney ? access * 2 : access,
    outboundAirportAccessChargeGbp: access,
    returnAirportAccessChargeGbp: input.returnJourney ? access : 0,
    returnJourney: input.returnJourney,
    ...floor,
  });
}

assert.equal(payable({ journey: 60 }).finalAmountPayableGbp, 90);
assert.equal(payable({ journey: 89 }).finalAmountPayableGbp, 90);
assert.equal(payable({ journey: 110 }).finalAmountPayableGbp, 110);
assert.equal(payable({ journey: 60, minimum: 100 }).finalAmountPayableGbp, 100);
assert.equal(payable({ journey: 110, minimum: 100 }).finalAmountPayableGbp, 110);

const oneWayAccess = payable({ journey: 60, access: 5 });
assert.equal(oneWayAccess.finalAmountPayableGbp, 90);
assert.equal(oneWayAccess.airportAccessChargeGbp, 5);
assert.notEqual(oneWayAccess.finalAmountPayableGbp, 60 + 5 + 5);
assert.notEqual(oneWayAccess.finalAmountPayableGbp, 90 + 5);
assert.equal(checkoutAmountsMatch(90, oneWayAccess.finalAmountPayableGbp), true);
assert.equal(
  resolveSumUpChargeAmountGbp(90, oneWayAccess.finalAmountPayableGbp),
  oneWayAccess.finalAmountPayableGbp,
);
assert.equal(resolveSumUpChargeAmountGbp(89, oneWayAccess.finalAmountPayableGbp), null);

const returnBelow = payable({ journey: 60, returnJourney: true });
assert.equal(returnBelow.finalAmountPayableGbp, roundCustomerPayableGbp(180 * 0.95));
assert.equal(returnBelow.finalAmountPayableGbp, 171);
assert.notEqual(returnBelow.finalAmountPayableGbp, roundCustomerPayableGbp(171 * 0.95));

const returnWithAccess = payable({ journey: 60, access: 5, returnJourney: true });
assert.equal(returnWithAccess.finalAmountPayableGbp, 171);
assert.equal(returnWithAccess.airportAccessChargeGbp, 10);
assert.notEqual(returnWithAccess.finalAmountPayableGbp, 171 + 10);

const returnAbove = businessClassFlooredPayableGbp({
  minimumFareGbp: 90,
  returnJourney: true,
  returnDiscountRate: 0.05,
  outboundOneWayBeforeAccessGbp: 110,
  returnOneWayBeforeAccessGbp: 110,
});
assert.equal(returnAbove, null);
assert.equal(payable({ journey: 110, returnJourney: true }).finalAmountPayableGbp, roundCustomerPayableGbp(220 * 0.95));

assert.equal(payable({ journey: 60, vehicle: "other", minimum: 100 }).finalAmountPayableGbp, 60);
assert.equal(payable({ journey: 50, vehicle: "executive", minimum: 75 }).finalAmountPayableGbp, 75);
assert.notEqual(payable({ journey: 50, vehicle: "executive", minimum: 75 }).finalAmountPayableGbp, 90);

const raised = reloadSavedPricing({
  ...defaultOwnerPricingSettings(),
  minibus: { ...defaultOwnerPricingSettings().minibus, minimumFareGbp: 100, publicEnabled: true },
});
assert.equal(raised.saved.minibus.minimumFareGbp, 100);
assert.equal(raised.refreshed.minibus.minimumFareGbp, 100);
assert.equal(raised.refreshed.minibus.multiplier, 1.55);
assert.equal(raised.refreshed.executive.minimumFareGbp, 75);
assert.equal(raised.refreshed.estate.upliftGbp, 10);
assert.equal(ownerPricingEngineOptions(raised.refreshed).minibusMinimumFareGbp, 100);
assert.equal(
  payable({
    journey: 60,
    minimum: ownerPricingEngineOptions(raised.refreshed).minibusMinimumFareGbp,
  }).finalAmountPayableGbp,
  100,
);
assert.equal(
  payable({
    journey: 50,
    vehicle: "executive",
    minimum: ownerPricingEngineOptions(raised.refreshed).executiveMinimumFareGbp,
  }).finalAmountPayableGbp,
  75,
);

const route = { distanceKm: 8, durationMinutes: 15 };
const schedule = { outboundDate: "2026-10-14", outboundTime: "10:00" };
const pricing = {
  ...defaultOwnerPricingSettings(),
  minibus: { ...defaultOwnerPricingSettings().minibus, publicEnabled: true, minimumFareGbp: 90 },
};
const saloon = calculateQuote("Belfast City Hall", "BFS", SALOON, false, schedule, route, true, pricing);
const estate = calculateQuote("Belfast City Hall", "BFS", ESTATE, false, schedule, route, true, pricing);
const minibusQuote = calculateQuote("Belfast City Hall", "BFS", MINIBUS, false, schedule, route, true, pricing);
const executive = calculateQuote("Belfast City Hall", "BFS", EXECUTIVE, false, schedule, route, true, pricing);
assert.ok(saloon && estate && minibusQuote && executive);
assert.equal(estate.amount, saloon.amount + 10);
assert.equal(minibusQuote.journeyFareGbp, roundGbp((estate.journeyFareGbp ?? 0) * 1.55));
assert.equal(executive.journeyFareGbp, roundGbp((saloon.journeyFareGbp ?? 0) * 1.5));

const saloonFields = vehicleMinimumFareBreakdownFields({
  vehicleType: SALOON,
  executiveMinimumFareGbp: 75,
  minibusMinimumFareGbp: 100,
  outboundOneWayBeforeAccessGbp: saloon.outboundOneWayBeforeAccessGbp,
});
assert.equal(saloonFields.minibusMinimumFareGbp, undefined);
assert.equal(saloonFields.businessClassMinimumFareGbp, undefined);

const minibusFields = vehicleMinimumFareBreakdownFields({
  vehicleType: MINIBUS,
  executiveMinimumFareGbp: 75,
  minibusMinimumFareGbp: 90,
  outboundOneWayBeforeAccessGbp: minibusQuote.outboundOneWayBeforeAccessGbp,
  returnDiscountRate: 0.05,
});
assert.equal(minibusFields.minibusMinimumFareGbp, 90);
assert.equal(minibusFields.businessClassMinimumFareGbp, undefined);
const flooredMinibus = composeWebsiteFareBreakdown({
  journeyFareBeforeAirportAccessGbp: minibusQuote.journeyFareGbp ?? minibusQuote.amount,
  airportFixedCostsGbp: minibusQuote.airportFixedCostsGbp ?? 0,
  nightWeekendSurchargeGbp: minibusQuote.nightWeekendSurchargeGbp ?? 0,
  ...minibusFields,
});
const normalMinibus = minibusQuote.outboundOneWayBeforeAccessGbp ?? 0;
if (normalMinibus < 90) {
  assert.equal(flooredMinibus.finalAmountPayableGbp, 90);
} else {
  assert.equal(flooredMinibus.finalAmountPayableGbp, roundCustomerPayableGbp(normalMinibus));
}
assert.equal(flooredMinibus.airportAccessChargeGbp, 0);

const confirmedBooking = {
  status: "confirmed",
  amountPaid: "£66.00",
  amountPaidGbp: 66,
  finalAmountPayableGbp: 66,
};
assert.equal(confirmedBooking.amountPaidGbp, 66);
assert.notEqual(confirmedBooking.finalAmountPayableGbp, 90);

const panel = readFileSync("src/components/OwnerPricingPanel.tsx", "utf8");
assert.match(panel, /7 Seater Minimum Fare/);
assert.match(panel, /data-minibus-minimum/);
assert.match(panel, /Save Changes/);
assert.match(panel, /New quotes use this amount/);
assert.match(panel, /Business Class Minimum Fare/);

const quoteCard = readFileSync("src/components/QuoteCard.tsx", "utf8");
assert.match(quoteCard, /vehicleMinimumFareBreakdownFields/);
assert.doesNotMatch(quoteCard, /w-\[3\.1rem\]/);

const paidBookings = readFileSync("src/components/OwnerPaidBookingsPanel.tsx", "utf8");
const confirmation = readFileSync("src/app/booking-confirmed/BookingConfirmedClient.tsx", "utf8");
assert.match(paidBookings, /booking\.amountPaid/);
assert.match(confirmation, /result\.amountPaid/);
assert.doesNotMatch(paidBookings, /minibusMinimumFareGbp|businessClassFlooredPayableGbp/);
assert.doesNotMatch(confirmation, /minibusMinimumFareGbp|businessClassFlooredPayableGbp/);

const payment = readFileSync("workers/addresses/src/index.ts", "utf8");
assert.match(payment, /vehicleMinimumFareBreakdownFields/);
assert.match(payment, /resolveSumUpChargeAmountGbp\(\s*acceptedFinalRaw,\s*serverFinalAmountGbp/);
assert.match(payment, /finalAmountPayableGbp: sumUpChargeGbp/);

console.log("OK  7 seater minimum fare");
