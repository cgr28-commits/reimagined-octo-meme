import assert from 'node:assert/strict';
import { calculateUniversalJourneyFareGbp, calculateUniversalSaloonJourneyFareGbp } from '../shared/universal-distance-pricing';
import { defaultOwnerPricingSettings, normalizeOwnerPricingSettings, ownerPricingEngineOptions } from '../shared/owner-pricing-config';
import { postcodePricingIsEnabled } from '../shared/postcode-pricing';
import { isProfitabilityProtectionActive } from '../src/lib/owner-profitability-settings';
import { festivePremiumRate, applyTripPremium } from '../src/lib/point-to-point-premium';
import { calculateQuote } from '../src/lib/quote';
import { SALOON_VEHICLE, ESTATE_VEHICLE } from '../src/lib/vehicle-selection';
import { composeWebsiteFareBreakdown } from '../shared/website-fare-breakdown';

const pricing = defaultOwnerPricingSettings();
pricing.night.enabled = false;
pricing.weekend.enabled = false;
const legacy = {...pricing, saloon: {minimumFareGbp: 80, floorMiles:4, knots:[{miles:4,fareGbp:80},{miles:100,fareGbp:400}]}, estate:{upliftGbp:11}, dublinAirportFareAdjustment:{rate:0.3}, postcodePricingEnabled:true};
const migrated = normalizeOwnerPricingSettings(legacy);
assert.equal(migrated.estate.upliftGbp,11);
assert.equal(migrated.returnDiscount.rate,pricing.returnDiscount.rate);
assert.equal(ownerPricingEngineOptions(migrated).dublinAirportFareAdjustmentRate,0);
assert.equal(postcodePricingIsEnabled(true),false);
assert.equal(isProfitabilityProtectionActive({vehicleMpg:47}),false);
for (const [miles, fare] of [[0,30],[5,30],[10,32],[15,43],[30,76],[60,142],[100,230],[200,450]]) {
 assert.ok(Math.abs(calculateUniversalSaloonJourneyFareGbp(miles)-fare)<1e-9);
 const vehicle = calculateUniversalJourneyFareGbp(miles, ESTATE_VEHICLE,ownerPricingEngineOptions(migrated));
 assert.ok(Math.abs(vehicle.journeyFareGbp-(fare+11))<1e-9);
}
for (const [date,time,rate] of [
 ['2026-12-24','13:59',0],['2026-12-24','14:00',.5],['2026-12-25','12:00',.5],
 ['2026-12-26','23:59',.5],['2026-12-27','05:59',.5],['2026-12-27','06:00',0],
 ['2026-12-31','19:59',0],['2026-12-31','20:00',.5],['2027-01-01','23:59',.5],['2027-01-02','00:00',0],
 ['2027-12-24','14:00',.5],['2026-08-31','12:00',0],
] as const) assert.equal(festivePremiumRate(date,time),rate,`${date} ${time}`);
const nightPricing = {...pricing,night:{...pricing.night,enabled:true,surchargeRate:.1}};
assert.equal(applyTripPremium(100,{outboundDate:'2026-12-25',outboundTime:'23:00'},undefined,{pricing:nightPricing}).total,150);
assert.equal(applyTripPremium(100,{outboundDate:'2026-12-23',outboundTime:'23:00'},undefined,{pricing:nightPricing}).total,110);
function payable(miles:number, date='2026-11-02', time='12:00', back=false) {
 const quote = calculateQuote('Belfast BT1 5GS','BFS',SALOON_VEHICLE,back,{outboundDate:date,outboundTime:time,returnDate:'2027-01-02',returnTime:'12:00'}, {distanceKm:miles/.621371,durationMinutes:60},false,pricing)!;
 return composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:quote.journeyFareGbp!,nightWeekendSurchargeGbp:quote.nightWeekendSurchargeGbp,airportFixedCostsGbp:quote.airportFixedCostsGbp,airportAccessChargeGbp:back?10:5,returnJourney:back}).finalAmountPayableGbp;
}
assert.equal(payable(5),35,'minimum before access');
assert.equal(payable(15),48);
assert.equal(payable(58),143);
assert.equal(payable(15,'2026-12-25'),70,'43 × 1.5 + 5, round once');
assert.equal(payable(15,'2026-12-25','12:00',true),113,'5% off base only, festive outbound only, access full price');
assert.equal(payable(10.24,'2026-12-25'),54,'do not round base to pounds before festive premium');
console.log('PASS mileage, legacy overrides, configurable uplift, festive boundaries, no stacking, return discount, separate fees and final rounding');
