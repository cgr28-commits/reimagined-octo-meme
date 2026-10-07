/**
 * Meet & Greet is a fixed pickup-leg access charge.
 * It is not added to Express, not surcharged, and not charged on both return directions.
 * Run: npx tsx scripts/check-meet-greet.ts
 */

import assert from "node:assert/strict";
import { resolveExpressDropOff } from "../shared/express-drop-off";
import {
  formatAirportAccessOptionCustomerLines,
  formatAirportAccessOptionDashboardValue,
  formatAirportAccessOptionOwnerLines,
} from "../shared/express-drop-off";
import { ceilCustomerFareToWholePoundGbp, roundGbp } from "../shared/gbp";
import {
  MEET_GREET_DESCRIPTION,
  MEET_GREET_DRIVER_NOTE,
  defaultMeetGreetFees,
  quoteAirportAccessCharges,
} from "../shared/meet-greet";
import {
  defaultOwnerPricingSettings,
  normalizeOwnerPricingSettings,
  validateOwnerPricingInput,
} from "../shared/owner-pricing-config";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";

const SALOON = 44;
const ESTATE = 54;
const MINIBUS = roundGbp(54 * 1.55);

function expressLegs(input: {
  airportCode: string;
  fromAirport: boolean;
  returnJourney?: boolean;
  express?: boolean;
}) {
  return resolveExpressDropOff({
    airportCode: input.airportCode,
    fromAirport: input.fromAirport,
    returnJourney: input.returnJourney,
    selected: input.express === true,
    outboundSelected: input.express === true,
    returnSelected: input.express === true,
  }).legs;
}

function access(input: {
  airportCode: string;
  fromAirport: boolean;
  returnJourney?: boolean;
  outbound?: "express" | "free" | "meet-greet";
  returnChoice?: "express" | "free" | "meet-greet";
  express?: boolean;
  fees?: { bfsGbp: number; bhdGbp: number; dubGbp: number };
}) {
  return quoteAirportAccessCharges({
    expressLegs: expressLegs({
      airportCode: input.airportCode,
      fromAirport: input.fromAirport,
      returnJourney: input.returnJourney,
      express: input.express,
    }),
    airportCode: input.airportCode,
    fromAirport: input.fromAirport,
    returnJourney: input.returnJourney,
    outboundChoice: input.outbound ?? "free",
    returnChoice: input.returnChoice ?? "free",
    fees: input.fees,
  });
}

function customerTotal(input: {
  vehicleFare: number;
  rate: number;
  accessGbp: number;
  fixedGbp?: number;
  returnJourney?: boolean;
}) {
  const surcharge = roundGbp(input.vehicleFare * input.rate);
  return composeWebsiteFareBreakdown({
    journeyFareBeforeAirportAccessGbp: roundGbp(input.vehicleFare + surcharge),
    nightWeekendSurchargeGbp: surcharge,
    airportFixedCostsGbp: input.fixedGbp ?? 0,
    airportAccessChargeGbp: input.accessGbp,
    returnJourney: input.returnJourney,
  });
}

function wrongSurchargedTotal(vehicleFare: number, rate: number, accessGbp: number, fixedGbp = 0) {
  return ceilCustomerFareToWholePoundGbp((vehicleFare + accessGbp + fixedGbp) * (1 + rate));
}

const defaults = defaultMeetGreetFees();
assert.equal(defaults.bfsGbp, 15);
assert.equal(defaults.bhdGbp, 15);
assert.equal(defaults.dubGbp, 25);

const bfsPickup = access({ airportCode: "BFS", fromAirport: true, outbound: "meet-greet", express: true });
assert.equal(bfsPickup.meetGreetFeeGbp, 15);
assert.equal(bfsPickup.expressDropOffFee, 0);
assert.equal(bfsPickup.airportAccessChargeGbp, 15);
assert.equal(bfsPickup.outboundAirportAccessOption, "meet-greet");

const bhdPickup = access({ airportCode: "BHD", fromAirport: true, outbound: "meet-greet" });
assert.equal(bhdPickup.meetGreetFeeGbp, 15);
assert.equal(bhdPickup.airportAccessChargeGbp, 15);

const dubPickup = access({ airportCode: "DUB", fromAirport: true, outbound: "meet-greet" });
assert.equal(dubPickup.expressDropOffFee, 0);
assert.equal(dubPickup.meetGreetFeeGbp, 25);
assert.equal(dubPickup.airportAccessChargeGbp, 25);

const expressInstead = access({ airportCode: "BFS", fromAirport: true, outbound: "express", express: true });
assert.equal(expressInstead.expressDropOffFee, 5);
assert.equal(expressInstead.meetGreetFeeGbp, 0);
assert.equal(expressInstead.airportAccessChargeGbp, 5);

const dropOffIgnoresMeetGreet = access({
  airportCode: "BFS",
  fromAirport: false,
  outbound: "meet-greet",
  express: true,
});
assert.equal(dropOffIgnoresMeetGreet.meetGreetFeeGbp, 0);
assert.equal(dropOffIgnoresMeetGreet.expressDropOffFee, 5);
assert.equal(dropOffIgnoresMeetGreet.airportAccessChargeGbp, 5);

const toAirportReturn = access({
  airportCode: "BHD",
  fromAirport: false,
  returnJourney: true,
  outbound: "meet-greet",
  returnChoice: "meet-greet",
  express: true,
});
assert.equal(toAirportReturn.outboundAirportAccessChargeGbp, 4);
assert.equal(toAirportReturn.returnAirportAccessChargeGbp, 15);
assert.equal(toAirportReturn.meetGreetFeeGbp, 15);
assert.equal(toAirportReturn.airportAccessChargeGbp, 19);
assert.equal(toAirportReturn.returnAirportAccessOption, "meet-greet");
assert.notEqual(toAirportReturn.outboundAirportAccessOption, "meet-greet");

const fromAirportReturn = access({
  airportCode: "DUB",
  fromAirport: true,
  returnJourney: true,
  outbound: "meet-greet",
  returnChoice: "meet-greet",
});
assert.equal(fromAirportReturn.outboundAirportAccessChargeGbp, 25);
assert.equal(fromAirportReturn.returnAirportAccessChargeGbp, 0);
assert.equal(fromAirportReturn.meetGreetFeeGbp, 25);
assert.equal(fromAirportReturn.airportAccessOption, "meet-greet");

for (const vehicleFare of [SALOON, ESTATE, MINIBUS]) {
  for (const [label, rate, fee] of [
    ["evening", 0.1, 15],
    ["night", 0.2, 15],
    ["weekend-day", 0.1, 15],
    ["weekend-night", 0.3, 15],
    ["dublin-evening", 0.1, 25],
  ] as const) {
    const priced = customerTotal({ vehicleFare, rate, accessGbp: fee, fixedGbp: fee === 25 ? 9 : 0 });
    const surcharge = roundGbp(vehicleFare * rate);
    const expected = ceilCustomerFareToWholePoundGbp(vehicleFare + surcharge + (fee === 25 ? 9 : 0) + fee);
    assert.equal(priced.nightWeekendSurchargeGbp, surcharge, `${label} ${vehicleFare} surcharge`);
    assert.equal(priced.finalAmountPayableGbp, expected, `${label} ${vehicleFare} total`);
    const surchargedFee = wrongSurchargedTotal(vehicleFare, rate, fee, fee === 25 ? 9 : 0);
    if (surchargedFee !== expected) {
      assert.notEqual(
        priced.finalAmountPayableGbp,
        surchargedFee,
        `${label} ${vehicleFare} must not surcharge Meet & Greet`,
      );
    }
  }
}

const returnFare = roundGbp(SALOON * 2 * 0.95);
const returnPriced = customerTotal({
  vehicleFare: returnFare,
  rate: 0,
  accessGbp: toAirportReturn.airportAccessChargeGbp,
  returnJourney: true,
});
assert.equal(toAirportReturn.meetGreetFeeGbp, 15);
assert.equal(
  returnPriced.finalAmountPayableGbp,
  ceilCustomerFareToWholePoundGbp(returnFare + toAirportReturn.airportAccessChargeGbp),
);
assert.notEqual(
  returnPriced.finalAmountPayableGbp,
  ceilCustomerFareToWholePoundGbp(returnFare + 15 + 15),
);

const lines = formatAirportAccessOptionCustomerLines({
  expressDropOffAirport: "BFS",
  airportCode: "BFS",
  fromAirport: false,
  returnJourney: true,
  outboundExpressDropOffSelected: false,
  returnExpressDropOffSelected: false,
  outboundAirportAccessOption: "free",
  returnAirportAccessOption: "meet-greet",
  outboundAirportAccessChargeGbp: 0,
  returnAirportAccessChargeGbp: 15,
});
assert.equal(lines.filter((line) => line.includes("Meet & Greet")).length, 1);
assert.match(lines.join("\n"), new RegExp(MEET_GREET_DESCRIPTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(lines.join("\n"), /Return airport access: Meet & Greet — £15/);
assert.doesNotMatch(lines.join("\n"), /Outbound airport access: Meet & Greet/);

const owner = formatAirportAccessOptionOwnerLines({
  expressDropOffAirport: "DUB",
  airportCode: "DUB",
  fromAirport: true,
  outboundAirportAccessOption: "meet-greet",
  outboundAirportAccessChargeGbp: 25,
});
assert.match(owner.join("\n"), /MEET & GREET — £25 — DRIVER ENTERS TERMINAL/);
assert.match(MEET_GREET_DRIVER_NOTE, /enter the terminal/);

const dashboard = formatAirportAccessOptionDashboardValue({
  expressDropOffAirport: "BHD",
  airportCode: "BHD",
  fromAirport: true,
  outboundAirportAccessOption: "meet-greet",
  outboundAirportAccessChargeGbp: 15,
  airportAccessOption: "meet-greet",
});
assert.match(dashboard ?? "", /Meet & Greet — £15 — enter the terminal/);

const storedWithoutMeetGreet = defaultOwnerPricingSettings() as unknown as Record<string, unknown>;
delete storedWithoutMeetGreet.meetGreet;
const custom = normalizeOwnerPricingSettings({
  ...storedWithoutMeetGreet,
  saloon: {
    ...defaultOwnerPricingSettings().saloon,
    minimumFareGbp: 31,
  },
});
assert.equal(custom.saloon.minimumFareGbp, 31);
assert.equal(custom.meetGreet.bfsGbp, 15);
assert.equal(custom.meetGreet.dubGbp, 25);

const saved = validateOwnerPricingInput({
  ...defaultOwnerPricingSettings(),
  meetGreet: { bfsGbp: 18, bhdGbp: 12, dubGbp: 30 },
});
assert.equal(saved.ok, true);
if (saved.ok) {
  const priced = access({
    airportCode: "DUB",
    fromAirport: true,
    outbound: "meet-greet",
    fees: saved.settings.meetGreet,
  });
  assert.equal(priced.meetGreetFeeGbp, 30);
  const total = customerTotal({ vehicleFare: SALOON, rate: 0.2, accessGbp: priced.airportAccessChargeGbp });
  assert.equal(total.finalAmountPayableGbp, ceilCustomerFareToWholePoundGbp(SALOON + roundGbp(SALOON * 0.2) + 30));
}

const rejected = validateOwnerPricingInput({
  ...defaultOwnerPricingSettings(),
  meetGreet: { bfsGbp: 150, bhdGbp: 15, dubGbp: 25 },
});
assert.equal(rejected.ok, false);

console.log("check-meet-greet: ok");
