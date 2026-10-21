import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PromotionalPriceBreakdown, FinalPayableBreakdown } from "../src/components/QuoteFareTrust";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { formatCustomerPromoPricingHtmlRows, formatCustomerPromoPricingLines } from "../shared/website-promo-pricing";
Object.assign(globalThis, { React });
const breakdown = composeWebsiteFareBreakdown({ journeyFareBeforeAirportAccessGbp:64.5, nightWeekendSurchargeGbp:21.5, airportAccessChargeGbp:5 });
for (const component of [PromotionalPriceBreakdown, FinalPayableBreakdown]) {
 const html = renderToStaticMarkup(createElement(component, {breakdown}));
 assert.doesNotMatch(html,/surcharge|evening|weekend|christmas|new year/i);
 assert.match(html,/64.50/,'journey includes time-based price');
 assert.match(html,/70/,'complete rounded total');
}
const fields = {originalEligibleJourneyPriceGbp:43,nightWeekendSurchargeGbp:21.5,finalAmountPayableGbp:70};
const text = JSON.stringify(formatCustomerPromoPricingHtmlRows(fields)) + JSON.stringify(formatCustomerPromoPricingLines(fields));
assert.doesNotMatch(text,/surcharge|evening|weekend|christmas|new year/i);
assert.match(text,/64.50/);
console.log('PASS rendered quote and checkout, text and HTML customer fare rows: inclusive fare, no time-premium wording');
