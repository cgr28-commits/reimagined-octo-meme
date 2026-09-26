/**
 * First painted fare must already be authoritative.
 * Does not change the 10% Night & Weekend rule.
 * Run: npx tsx scripts/check-quote-authoritative-fare.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mayPaintAuthoritativeFare } from "../src/lib/authoritative-quote-fare";
import {
  QUOTE_FARE_START_DELAY_MS,
  quoteFareVehiclesToRequest,
} from "../src/lib/quote-fare-request";
import {
  expressQuoteExpressHint,
  expressQuoteExpressTitle,
  expressQuoteFreeHint,
  expressQuoteFreeTitle,
} from "../shared/express-drop-off";
import { NIGHT_WEEKEND_SURCHARGE_RATE } from "../shared/night-weekend-surcharge";
import { AIRPORT_FIXED_COSTS_GBP, requiredAirportAccessNotice } from "../shared/airport-fixed-costs";
import {
  EXPRESS_DROP_OFF_FEES_GBP,
  parseCustomerExpressDropOffSelected,
  resolveExpressDropOff,
} from "../shared/express-drop-off";

const root = path.resolve(import.meta.dirname, "..");
const card = fs.readFileSync(path.join(root, "src/components/QuoteCard.tsx"), "utf8");
const showcase = fs.readFileSync(path.join(root, "src/components/QuoteResultShowcase.tsx"), "utf8");

console.log("=== Interim live fare must not paint ===");
assert.equal(
  mayPaintAuthoritativeFare({
    serverFareReady: false,
    publicPricingLoaded: false,
    serverQuoteUnavailable: false,
    previewSkipsServer: false,
  }),
  false,
  "default 10% settings must not paint before config or the worker quote",
);
assert.equal(
  mayPaintAuthoritativeFare({
    serverFareReady: true,
    publicPricingLoaded: false,
    serverQuoteUnavailable: false,
    previewSkipsServer: false,
  }),
  true,
  "a matching worker fare is authoritative even before public config paint",
);
assert.equal(
  mayPaintAuthoritativeFare({
    serverFareReady: false,
    publicPricingLoaded: true,
    serverQuoteUnavailable: true,
    previewSkipsServer: false,
  }),
  true,
);
assert.equal(
  mayPaintAuthoritativeFare({
    serverFareReady: false,
    publicPricingLoaded: false,
    serverQuoteUnavailable: true,
    previewSkipsServer: false,
  }),
  false,
  "a failed worker quote still waits for loaded pricing config",
);
assert.equal(
  mayPaintAuthoritativeFare({
    serverFareReady: false,
    publicPricingLoaded: true,
    serverQuoteUnavailable: false,
    previewSkipsServer: true,
  }),
  true,
);
assert.equal(NIGHT_WEEKEND_SURCHARGE_RATE, 0.1);
assert.match(card, /mayPaintAuthoritativeFare/);
assert.match(card, /mayPaintNumericFare && \(journeyFareParts\.nightWeekendSurchargeGbp/);
assert.doesNotMatch(card, /journeyFareGbp \* 0\.9|amount \* 0\.9|surcharge \* 0/);
assert.match(card, /Calculating your transfer price/);
assert.match(card, /const authoritativeFareReady = mayPaintNumericFare/);
assert.match(card, /const resultsCanRender =/);
assert.match(card, /const quoteResultsReady = resultsCanRender/);
const resultsBlock = card.slice(
  card.indexOf("const resultsCanRender"),
  card.indexOf("const quoteResultsReady = resultsCanRender"),
);
assert.doesNotMatch(resultsBlock, /mayPaintNumericFare|authoritativeFareReady/);
assert.match(card, /: "Calculating…"/);
assert.match(showcase, /formattedPrice\.startsWith\("£"\) \? "ready" : "pending"/);
assert.match(showcase, /min-h-\[clamp\(3\.5rem,1\.6rem\+10vw,4\.5rem\)\]/);
assert.match(showcase, /text-\[clamp\(2\.65rem,1\.22rem\+7\.6vw,3\.4rem\)\]/);
const scrollEffect = card.slice(
  card.indexOf("One results scroll, to the start anchor"),
  card.indexOf("Reset time→Your Journey"),
);
assert.match(scrollEffect, /hadRouteSummaryScrollRef\.current = true/);
assert.match(scrollEffect, /quoteResultsStartRef/);
assert.match(scrollEffect, /correctAfterMs: 0/);
assert.doesNotMatch(scrollEffect, /mayPaintNumericFare|authoritativeFareReady/);
assert.match(card, /QUOTE_FARE_START_DELAY_MS/);
assert.doesNotMatch(
  card,
  /await refreshAuthoritativeServerQuote\(\);\s*\}\)\(\);\s*\}, 280\)/,
);
assert.match(card, /vehicleType: vehicle/);
assert.match(card, /quoteFareVehiclesToRequest/);
assert.equal(QUOTE_FARE_START_DELAY_MS, 0);
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
assert.equal(expressQuoteFreeTitle("BFS", "drop-off"), "Free Drop-Off — Included");
assert.equal(expressQuoteExpressTitle("BFS", "drop-off"), "Express Drop-Off — +£5");
assert.equal(
  expressQuoteFreeHint("drop-off", "BFS"),
  "Long Stay car park · Around a 5-minute walk to the terminal",
);
assert.equal(
  expressQuoteExpressHint("drop-off"),
  "Drop-off close to the terminal entrance · Minimal walking",
);
assert.equal(
  expressQuoteFreeHint("pick-up", "BHD"),
  "Meet at the Long Stay car park · Approximately a 5–10 minute walk from the terminal",
);
assert.equal(expressQuoteFreeHint("drop-off", "BHD"), "Use the airport's designated free drop-off area");
assert.doesNotMatch(expressQuoteFreeHint("drop-off", "BHD"), /Long Stay|minute walk/);
assert.equal(requiredAirportAccessNotice({ airportCode: "DUB", fromAirport: true }) == null, false);
console.log("OK  no interim fare; results mount before the authoritative number; 10% rate unchanged");

console.log("\n=== Airport fees unchanged; Dublin and Derry are not a Free/Express choice ===");
assert.equal(EXPRESS_DROP_OFF_FEES_GBP.BFS, 5);
assert.equal(EXPRESS_DROP_OFF_FEES_GBP.BHD, 4);
assert.equal(AIRPORT_FIXED_COSTS_GBP.DUB.parkingAllowanceGbp, 5);
assert.equal(AIRPORT_FIXED_COSTS_GBP.DUB.tollAllowanceGbp, 4);
assert.equal(AIRPORT_FIXED_COSTS_GBP.DUB.dropOffFeeGbp, 0);
assert.equal(AIRPORT_FIXED_COSTS_GBP.LDY.pickupFeeGbp, 2.5);
assert.equal(AIRPORT_FIXED_COSTS_GBP.LDY.dropOffFeeGbp, 1);
assert.equal(requiredAirportAccessNotice({ airportCode: "BFS", fromAirport: false }), null);
assert.equal(requiredAirportAccessNotice({ airportCode: "BHD", fromAirport: true }), null);
const dubPickup = requiredAirportAccessNotice({ airportCode: "DUB", fromAirport: true });
assert.match(dubPickup?.body ?? "", /pickup\/parking \(£5\)/);
assert.match(dubPickup?.body ?? "", /M1 tolls \(£4\)/);
const dubDrop = requiredAirportAccessNotice({ airportCode: "DUB", fromAirport: false });
assert.match(dubDrop?.body ?? "", /drop-off is included/);
assert.match(dubDrop?.body ?? "", /M1 tolls \(£4\)/);
const ldyPickup = requiredAirportAccessNotice({ airportCode: "LDY", fromAirport: true });
assert.match(ldyPickup?.body ?? "", /£2\.50/);
const ldyDrop = requiredAirportAccessNotice({ airportCode: "LDY", fromAirport: false });
assert.match(ldyDrop?.body ?? "", /£1/);
assert.equal(resolveExpressDropOff({ airportCode: "DUB", fromAirport: true }).eligible, false);
assert.equal(resolveExpressDropOff({ airportCode: "LDY", fromAirport: false }).eligible, false);
assert.match(card, /data-required-airport-access/);
assert.doesNotMatch(card, /role="radio"/);
console.log("OK  Dublin and City of Derry notices use the existing charges");

console.log("\n=== New quotes store Free explicitly; missing flags stay legacy Express ===");
assert.equal(parseCustomerExpressDropOffSelected(undefined), true);
assert.equal(parseCustomerExpressDropOffSelected(false), false);
assert.equal(parseCustomerExpressDropOffSelected(true), true);
assert.match(
  card,
  /const \[expressDropOffSelected, setExpressDropOffSelected\] = useState\(false\)/,
);
assert.match(
  card,
  /const \[returnExpressDropOffSelected, setReturnExpressDropOffSelected\] = useState\(false\)/,
);
const both = resolveExpressDropOff({
  airportCode: "BFS",
  fromAirport: false,
  returnJourney: true,
  outboundSelected: true,
  returnSelected: true,
});
assert.equal(both.outboundFeeGbp, 5);
assert.equal(both.returnFeeGbp, 5);
assert.equal(both.feeGbp, 10);
const toggledOff = resolveExpressDropOff({
  airportCode: "BHD",
  fromAirport: true,
  returnJourney: true,
  outboundSelected: false,
  returnSelected: true,
});
assert.equal(toggledOff.outboundFeeGbp, 0);
assert.equal(toggledOff.returnFeeGbp, 4);
assert.equal(toggledOff.feeGbp, 4);
const again = resolveExpressDropOff({
  airportCode: "BFS",
  fromAirport: false,
  returnJourney: true,
  outboundSelected: true,
  returnSelected: false,
});
assert.equal(again.feeGbp, 5);
console.log("OK  per-leg Express does not stack");

console.log("\nAll authoritative fare checks passed.");
