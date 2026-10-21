/** Authenticated in-memory settings and quote/payment preparation only; no network or bookings. */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultOwnerPricingSettings, defaultCollectionTimePricing, DEFAULT_SALOON_FORMULA, toPublicOwnerPricingConfig, validateOwnerPricingInput, type OwnerPricingSettings } from '../shared/owner-pricing-config';
import { applyTripPremium } from '../src/lib/point-to-point-premium';
import { parseLondonLocalDateTime, formatUkDateTimeValue } from '../shared/uk-time';
import { handleOwnerPricingRequest } from '../workers/addresses/src/owner-pricing-handlers';
import { calculateAuthoritativeWebsiteQuote } from '../src/lib/quote-service';
import { SALOON_VEHICLE, ESTATE_VEHICLE } from '../src/lib/vehicle-selection';
import { composeWebsiteFareBreakdown } from '../shared/website-fare-breakdown';
import { resolveSumUpChargeAmountGbp, resolveOpenWebsitePaymentTransferFares } from '../shared/open-website-payment-fares';
import { FinalPayableBreakdown, PromotionalPriceBreakdown } from '../src/components/QuoteFareTrust';
import { workbookDraftRules } from '../src/lib/postcode-pricing-drafts';

Object.assign(globalThis, { React });
const round=(value:number)=>Math.round(value*100)/100;
const enabledBands=()=>({evening:{enabled:true,surchargeRate:.05},overnight:{enabled:true,surchargeRate:.15}});
function premium(pricing:OwnerPricingSettings,date:string,time:string,ret?:{date:string,time:string}) {
  return applyTripPremium(100,{outboundDate:date,outboundTime:time,returnJourney:!!ret,returnDate:ret?.date,returnTime:ret?.time},undefined,{pricing,returnOneWayFare:80});
}
async function main() {
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>{throw Error('External request forbidden in this test');};
  try {
    const defaults=defaultOwnerPricingSettings();
    assert.deepEqual(defaults.collectionTimePricing,defaultCollectionTimePricing());
    assert.deepEqual(defaults.saloonFormula,DEFAULT_SALOON_FORMULA);
    const pricing={...defaults,night:{...defaults.night,enabled:true,surchargeRate:.45},weekend:{...defaults.weekend,enabled:false,surchargeRate:.12},collectionTimePricing:enabledBands()};
    let boundaries=0;
    for(const formula of [false,true]) for(const date of ['2026-01-13','2026-07-14','2026-03-29','2026-10-25']) {
      pricing.saloonFormula={...DEFAULT_SALOON_FORMULA,enabled:formula};
      for(const [time,expected] of [['05:59',15],['06:00',0],['19:59',0],['20:00',5],['23:59',5],['00:00',15]] as const) {
        assert.equal(premium(pricing,date,time).premiumAmount,expected,`${formula} ${date} ${time}`);boundaries++;
      }
    }
    for(const hour of ['00:30','01:30','02:30']) {
      for(const date of ['2026-03-29','2026-10-25']) {
        assert.equal(premium(pricing,date,hour).premiumAmount,15);
        assert.ok(parseLondonLocalDateTime(date,hour)); // Existing DST gap/fold resolution unchanged.
      }
    }
    for(const utc of ['2026-10-25T00:30:00Z','2026-10-25T01:30:00Z']) {
      const local=formatUkDateTimeValue(utc);
      assert.ok(local.includes('01:30'),'both autumn occurrences are 01:30 London');
      assert.equal(premium(pricing,'2026-10-25','01:30').premiumAmount,15);
    }
    pricing.weekend.enabled=true;
    assert.equal(premium(pricing,'2026-11-14','20:00').premiumAmount,12,'weekend wins over evening');
    assert.equal(premium(pricing,'2026-11-14','01:00').premiumAmount,15,'overnight wins over weekend');
    assert.equal(premium(pricing,'2026-11-14','12:00').premiumAmount,12);
    const returned=premium(pricing,'2026-11-13','20:00',{date:'2026-11-14',time:'01:00'});
    assert.equal(returned.premiumAmount,17,'100×5% + 80×15%, no legacy 45%');
    assert.equal(returned.total,188,'5% on base fares only; fees added later');
    pricing.collectionTimePricing.evening.enabled=false;
    assert.equal(premium(pricing,'2026-11-13','23:00').premiumAmount,0,'disabled evening cannot fall back to legacy night');
    pricing.collectionTimePricing.evening.enabled=true;pricing.collectionTimePricing.overnight.enabled=false;
    assert.equal(premium(pricing,'2026-11-13','01:00').premiumAmount,0,'disabled overnight cannot fall back to legacy night');
    pricing.collectionTimePricing.evening.enabled=false;
    assert.equal(premium(pricing,'2026-11-13','23:00').premiumAmount,45,'both OFF restores saved legacy rule');
    const legacy={...pricing};delete legacy.collectionTimePricing;
    assert.equal(premium(legacy,'2026-11-13','23:00').total,premium(pricing,'2026-11-13','23:00').total);
    for(const rate of [-.01,1.01,NaN,Infinity,'']) {
      assert.equal(validateOwnerPricingInput({...pricing,collectionTimePricing:{...enabledBands(),evening:{enabled:true,surchargeRate:rate}}}).ok,false);
    }
    for(const bad of [[],true,'yes',{evening:{enabled:'yes',surchargeRate:.05}}]) assert.equal(validateOwnerPricingInput({...pricing,collectionTimePricing:bad}).ok,false);
    console.log(`PASS ${boundaries} boundary cases, DST gaps/folds, per-leg returns, highest-rate overlap and legacy isolation`);

    const store=new Map<string,string>();
    const kv={async get(k:string,t?:string){const v=store.get(k);return v==null?null:t==='json'?JSON.parse(v):v;},async put(k:string,v:string){store.set(k,v);}} as unknown as KVNamespace;
    const origin='https://www.myairporttaxini.co.uk';
    async function api(method:string,settings?:OwnerPricingSettings,key='isolated-owner') {
      return handleOwnerPricingRequest(new Request(origin+'/owner/pricing',{method,headers:{'Content-Type':'application/json','X-Owner-Key':key,Origin:origin},...(settings?{body:JSON.stringify({settings,expectedVersion:settings.version,postcodeRulesEditorVersion:2})}:{})}),{TRACKING_STORE:kv,OWNER_ACCESS_KEY:'isolated-owner'},origin);
    }
    assert.equal((await api('GET',undefined,'wrong')).status,401);
    const initial=await (await api('GET')).json();assert.equal(initial.collectionTimePricingEditorVersion,1);
    let saved:OwnerPricingSettings=initial.settings;
    saved.postcodeRules=workbookDraftRules().slice(0,172);saved.postcodePricingEnabled=true;
    saved.night={...saved.night,enabled:false,surchargeRate:.27};saved.weekend={...saved.weekend,enabled:true,surchargeRate:.19};saved.estate.upliftGbp=12.75;
    saved.collectionTimePricing={evening:{enabled:true,surchargeRate:.075},overnight:{enabled:false,surchargeRate:.18}};
    assert.equal((await api('POST',saved)).status,200);
    saved=(await (await api('GET')).json()).settings;
    const preserved=structuredClone(saved);
    const older={...saved};delete older.collectionTimePricing;
    assert.equal((await api('POST',older)).status,200);
    saved=(await (await api('GET')).json()).settings;
    assert.deepEqual(saved.collectionTimePricing,preserved.collectionTimePricing);
    assert.equal((await api('POST',older)).status,409);
    for(const key of ['night','weekend','estate','returnDiscount','postcodeRules','saloonFormula','saloon','meetGreet','bankHoliday'] as const) assert.deepEqual(saved[key],preserved[key],key);
    saved.collectionTimePricing={evening:{enabled:false,surchargeRate:.075},overnight:{enabled:true,surchargeRate:.18}};
    assert.equal((await api('POST',saved)).status,200);
    saved=(await (await api('GET')).json()).settings;
    assert.equal(saved.collectionTimePricing?.evening.enabled,false);assert.equal(saved.collectionTimePricing?.overnight.enabled,true);
    assert.equal(saved.collectionTimePricing?.evening.surchargeRate,.075);
    const audit=(await (await api('GET')).json()).audit;
    assert.ok(audit.some((entry:{changes:Array<{setting:string}>})=>entry.changes.some(c=>c.setting==='Evening premium')));
    console.log('PASS authenticated save/reload, independent switches, rates, legacy/stale clients, audit, 172 retained rules and #675 settings');

    let cases=0;
    for(const mode of ['tiers','postcode','formula']) for(const airport of ['BFS','DUB'] as const) for(const vehicle of [SALOON_VEHICLE,ESTATE_VEHICLE]) for(const ret of [false,true]) {
      const config={...saved,collectionTimePricing:enabledBands(),weekend:{...saved.weekend,enabled:true,surchargeRate:.12},saloonFormula:{...DEFAULT_SALOON_FORMULA,enabled:mode==='formula'},postcodePricingEnabled:mode==='postcode',postcodeRules:[{district:'BT1',airportCode:airport,saloonFareGbp:100,enabled:true,direction:'to-airport' as const,approvalStatus:'approved' as const},{district:'BT1',airportCode:airport,saloonFareGbp:80,enabled:true,direction:'from-airport' as const,approvalStatus:'approved' as const}]};
      const input={airportCode:airport,fromAirport:false,pickupAddress:'Belfast City Hall BT1 5GS',dropoffAddress:airport==='BFS'?'Belfast International Airport':'Dublin Airport',passengers:2,suitcases:1,vehicleType:vehicle,returnJourney:ret,routeMetrics:{distanceKm:20/.621371,durationMinutes:40},outboundDate:'2026-11-13',outboundTime:'20:00',returnDate:'2026-11-14',returnTime:'01:00'};
      const quote=calculateAuthoritativeWebsiteQuote({...input,pricing:config});
      const publicQuote=calculateAuthoritativeWebsiteQuote({...input,pricing:toPublicOwnerPricingConfig(config)});
      assert.equal(quote.ok,true);assert.equal(publicQuote.ok,true);if(!quote.ok||!publicQuote.ok)throw Error('quote failed');
      assert.equal(publicQuote.amount,quote.amount);
      const disabled={...config,collectionTimePricing:defaultCollectionTimePricing(),night:{...config.night,enabled:false},weekend:{...config.weekend,enabled:false}};
      const out=calculateAuthoritativeWebsiteQuote({...input,returnJourney:false,pricing:disabled});
      const inbound=calculateAuthoritativeWebsiteQuote({...input,pickupAddress:input.dropoffAddress,dropoffAddress:input.pickupAddress,fromAirport:true,returnJourney:false,pricing:disabled});
      if(!out.ok||!inbound.ok)throw Error('baseline quote failed');
      const baseOut=out.journeyFareGbp!,baseReturn=inbound.journeyFareGbp!;
      const expected=ret?round((baseOut+baseReturn)*.95+(baseOut*.05+baseReturn*.15)):round(baseOut*1.05);
      assert.equal(quote.journeyFareGbp,expected,`${mode} ${airport} ${vehicle} ${ret}`);
      const access=airport==='BFS'?(ret?10:5):0;
      const breakdown=composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:quote.journeyFareGbp!,nightWeekendSurchargeGbp:quote.nightWeekendSurchargeGbp,airportFixedCostsGbp:quote.airportFixedCostsGbp!,airportAccessChargeGbp:access,returnJourney:ret,inclusiveSchedulePricing:true});
      assert.equal(breakdown.finalAmountPayableGbp,Math.round(expected+quote.airportFixedCostsGbp!+access));
      const validation=resolveOpenWebsitePaymentTransferFares({clientTransferAmountGbp:quote.amount,claimedJourneyFareGbp:quote.journeyFareGbp,claimedAirportFixedCostsGbp:quote.airportFixedCostsGbp,booking:{pickupLabel:input.pickupAddress,dropoffLabel:input.dropoffAddress,airportCode:airport,isFromAirport:false,returnJourney:ret,passengers:2,suitcases:1,vehicle},routeMetrics:input.routeMetrics,authoritativeQuote:{amountGbp:quote.amount,journeyFareGbp:quote.journeyFareGbp!,airportFixedCostsGbp:quote.airportFixedCostsGbp!}});
      assert.equal(validation.ok,true);
      assert.equal(resolveSumUpChargeAmountGbp(breakdown.finalAmountPayableGbp,breakdown.finalAmountPayableGbp),breakdown.finalAmountPayableGbp);
      assert.equal(resolveSumUpChargeAmountGbp(breakdown.finalAmountPayableGbp,breakdown.finalAmountPayableGbp+10),null);
      for(const Component of [FinalPayableBreakdown,PromotionalPriceBreakdown]) {
        const html=renderToStaticMarkup(React.createElement(Component,{breakdown}));
        assert.doesNotMatch(html,/Night|Weekend|surcharge|Evening|Overnight/);
        assert.match(html,/Journey fare|Return journey fare/);
      }
      cases++;
    }
    console.log(`PASS ${cases} tier/postcode/formula Saloon/Estate one-way/return public/Worker, airport, booking validation and SumUp preparation cases; inclusive presentation; zero network calls`);
  } finally {globalThis.fetch=previousFetch;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
