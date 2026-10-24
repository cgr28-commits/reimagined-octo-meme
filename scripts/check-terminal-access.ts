/** Per-visit isolation, config validation, fare invariants and notification formatting. */
import assert from "node:assert/strict";
import { airportVisitKey, listTerminalAccessVisits, quoteAirportAccessCharges, parseTerminalAccessChoices } from "../shared/meet-greet";
import { defaultOwnerPricingSettings, validateOwnerPricingInput, toPublicOwnerPricingConfig } from "../shared/owner-pricing-config";
import { resolveJourneyAirportFees } from "../shared/airport-fixed-costs";
import { formatAirportAccessOptionCustomerLines, formatAirportAccessOptionDashboardValue } from "../shared/express-drop-off";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
const pricing = defaultOwnerPricingSettings();
let checks=0;
for (const pickupAirportCode of ["BFS","BHD","DUB"]) for (const dropoffAirportCode of ["BFS","BHD","DUB"]) {
  if (pickupAirportCode===dropoffAirportCode) continue;
  for (const returnJourney of [false,true]) {
    const context={isAirportToAirport:true,pickupAirportCode,dropoffAirportCode,returnJourney};
    const visits=listTerminalAccessVisits(context);
    const free=quoteAirportAccessCharges(context);
    assert.equal(free.airportAccessChargeGbp,0);
    const fixed=resolveJourneyAirportFees(context);
    assert.ok(fixed.lines.every(line=>line.airportCode!=="BFS"&&line.airportCode!=="BHD"));
    for(const visit of visits) for(const option of ["free","express","meet-greet"] as const) {
      const quote=quoteAirportAccessCharges({...context,visitChoices:{[airportVisitKey(visit)]:option},fees:pricing.meetGreet,terminalAccessFees:pricing.terminalAccess});
      const expected=option==="express"?(visit.airportCode==="BFS"?5:4):option==="meet-greet"&&visit.service==="pick-up"?15:0;
      assert.equal(quote.airportAccessChargeGbp,expected);
      assert.equal(quote.legs.filter(row=>row.chargeGbp>0).length,expected?1:0);
      assert.equal(new Set(quote.legs.map(airportVisitKey)).size,quote.legs.length);
      const lines=formatAirportAccessOptionCustomerLines({terminalAccessVisits:quote.legs});
      assert.equal(lines.length,quote.legs.length);
      assert.ok(formatAirportAccessOptionDashboardValue({terminalAccessVisits:quote.legs}));
      checks++;
    }
  }
}
for(const airportCode of ["BFS","BHD"]) for(const fromAirport of [true,false]) {
  const free=quoteAirportAccessCharges({airportCode,fromAirport});
  assert.equal(free.airportAccessChargeGbp,0);
  const included=quoteAirportAccessCharges({airportCode,fromAirport,meetGreetIncluded:true,outboundChoice:"express"});
  assert.equal(included.airportAccessChargeGbp,fromAirport?0:airportCode==="BFS"?5:4);
}
assert.deepEqual(parseTerminalAccessChoices({"outbound:BFS:pick-up":"express",amount:1,"return:DUB:pick-up":"express","outbound:BHD:drop-off":"bogus"}),{"outbound:BFS:pick-up":"express"});
for(const fee of [-1,101,NaN,Infinity,"oops"]) assert.equal(validateOwnerPricingInput({...pricing,terminalAccess:{bfsGbp:fee,bhdGbp:4}}).ok,false);
assert.deepEqual(toPublicOwnerPricingConfig({...pricing,terminalAccess:{bfsGbp:7.25,bhdGbp:6.35}}).terminalAccess,{bfsGbp:7.25,bhdGbp:6.35});
const noAccess=composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:114,returnJourney:true});
assert.equal(noAccess.returnJourneySavingGbp,6);
const paid=composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:114,returnJourney:true,airportAccessChargeGbp:7.25});
assert.equal(paid.finalAmountPayableGbp-noAccess.finalAmountPayableGbp,7.25);
assert.equal(paid.returnJourneySavingGbp,6);
console.log(`PASS ${checks} airport-to-airport per-visit combinations plus defaults, M&G inclusion, tamper filtering, configured fees, exact optional fee and 5% return discount.`);

const businessFree=composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:50,businessClassMinimumFareGbp:100,outboundOneWayBeforeAccessGbp:50});
const businessPaid=composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:50,businessClassMinimumFareGbp:100,outboundOneWayBeforeAccessGbp:50,airportAccessChargeGbp:5.25,outboundAirportAccessChargeGbp:5.25});
assert.equal(businessFree.finalAmountPayableGbp,100);
assert.equal(businessPaid.finalAmountPayableGbp,105.25,"Vehicle minimum cannot absorb optional fees");
