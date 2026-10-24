/** Isolated settings/quote/payment preparation tests. No external requests or payments. */
import assert from 'node:assert/strict';
import { defaultOwnerPricingSettings, DEFAULT_SALOON_FORMULA, toPublicOwnerPricingConfig, calculateConfiguredSaloonFareGbp, validateOwnerPricingInput } from '../shared/owner-pricing-config';
import { handleOwnerPricingRequest } from '../workers/addresses/src/owner-pricing-handlers';
import { getOwnerPricingSettings } from '../workers/addresses/src/owner-pricing-store';
import { calculateAuthoritativeWebsiteQuote } from '../src/lib/quote-service';
import { SALOON_VEHICLE, ESTATE_VEHICLE } from '../src/lib/vehicle-selection';
import { workbookDraftRules } from '../src/lib/postcode-pricing-drafts';
import { composeWebsiteFareBreakdown } from '../shared/website-fare-breakdown';
import { resolveSumUpChargeAmountGbp, checkoutAmountsMatch, resolveOpenWebsitePaymentTransferFares } from '../shared/open-website-payment-fares';
import { applyProfitabilityProtection } from '../workers/addresses/src/profitability';
async function main() {
const data = new Map<string,string>();
const kv = { async get(k:string,t?:string) { const v=data.get(k);return v==null?null:t==='json'?JSON.parse(v):v; },async put(k:string,v:string){data.set(k,v);} } as unknown as KVNamespace;
const env={TRACKING_STORE:kv,OWNER_ACCESS_KEY:'isolated-owner'};
const origin='https://www.myairporttaxini.co.uk';
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Unexpected external request');};
async function api(method:string,settings?:unknown,key='isolated-owner') {
 return handleOwnerPricingRequest(new Request(origin+'/owner/pricing',{method,headers:{'X-Owner-Key':key,'Content-Type':'application/json',Origin:origin},...(settings?{body:JSON.stringify({settings,postcodeRulesEditorVersion:2,expectedVersion:(settings as {version:number}).version})}:{})}),env,origin);
}
try {
 assert.equal((await api('GET',undefined,'wrong')).status,401);
 let saved=(await (await api('GET')).json()).settings;
 assert.deepEqual(saved.saloonFormula,DEFAULT_SALOON_FORMULA);
 saved.postcodeRules=workbookDraftRules().slice(0,172);
 saved.postcodeRules[0]={...saved.postcodeRules[0],enabled:true,approvalStatus:'approved',saloonFareGbp:100};
 saved.postcodePricingEnabled=true;saved.night={...saved.night,enabled:false,surchargeRate:.17};saved.weekend={...saved.weekend,enabled:false,surchargeRate:.23};
 assert.equal((await api('POST',saved)).status,200);
 saved=await getOwnerPricingSettings(kv);const retained=JSON.stringify(saved.postcodeRules);
 const legacy={...saved};delete legacy.saloonFormula;
 assert.equal((await api('POST',legacy)).status,200);
 saved=await getOwnerPricingSettings(kv);
 assert.deepEqual(saved.saloonFormula,DEFAULT_SALOON_FORMULA);
 for(const bad of ['',-1,Infinity,NaN]) assert.equal(validateOwnerPricingInput({...saved,saloonFormula:{...saved.saloonFormula,ratePerMileGbp:bad}}).ok,false);
 for (const rate of [2.35, 2.50, 2.75]) {
  const before=JSON.parse(JSON.stringify(saved));
  saved.saloonFormula.ratePerMileGbp=rate;
  assert.equal((await api('POST',saved)).status,200);
  saved=(await (await api('GET')).json()).settings;
  assert.equal(saved.saloonFormula.ratePerMileGbp,rate);
  assert.equal(toPublicOwnerPricingConfig(saved).saloonFormula?.ratePerMileGbp,rate);
  const withoutMileageAndMetadata=(value:typeof saved)=>{
   const {version,updatedAt,saloonFormula,...rest}=value;
   const {ratePerMileGbp,...formula}=saloonFormula!;
   return {...rest,saloonFormula:formula};
  };
  assert.deepEqual(withoutMileageAndMetadata(saved),withoutMileageAndMetadata(before),'only mileage rate and audit metadata change');
 }
 const baseline=calculateConfiguredSaloonFareGbp(20,saved);
 saved.saloonFormula={enabled:true,startingChargeGbp:12,ratePerMileGbp:2.35,minimumFareGbp:32};
 assert.equal((await api('POST',saved)).status,200);saved=(await (await api('GET')).json()).settings;
 assert.equal(calculateConfiguredSaloonFareGbp(20,saved),59);
 assert.equal(calculateConfiguredSaloonFareGbp(1,saved),32);
 saved.saloonFormula={...DEFAULT_SALOON_FORMULA,enabled:true};
 assert.equal((await api('POST',saved)).status,200);saved=await getOwnerPricingSettings(kv);
 const oldEditor={...saved};delete oldEditor.saloonFormula;
 assert.equal((await api('POST',oldEditor)).status,200);saved=await getOwnerPricingSettings(kv);
 assert.equal(saved.saloonFormula!.enabled,true,'old clients must not turn an enabled formula off');
 assert.equal((await api('POST',oldEditor)).status,409,'stale save must not overwrite settings');
 assert.equal(toPublicOwnerPricingConfig(saved).postcodePricingEnabled,false);
 assert.equal(saved.postcodePricingEnabled,true);assert.equal(JSON.stringify(saved.postcodeRules),retained);
 assert.equal(saved.night.enabled,false);assert.equal(saved.weekend.enabled,false);
 assert.equal(saved.night.surchargeRate,.17);assert.equal(saved.weekend.surchargeRate,.23);
 const q=(pricing:typeof saved,airportCode:'BFS'|'BHD'|'DUB',miles:number,vehicleType= SALOON_VEHICLE,returnJourney=false,outboundDate='2026-11-10',outboundTime='12:00')=>{
  const result=calculateAuthoritativeWebsiteQuote({airportCode,fromAirport:false,pickupAddress:'Belfast City Hall BT1 5GS',dropoffAddress:airportCode==='DUB'?'Dublin Airport':airportCode==='BHD'?'Belfast City Airport':'Belfast International Airport',returnJourney,passengers:2,suitcases:1,vehicleType,routeMetrics:{distanceKm:miles/.621371,durationMinutes:40},outboundDate,outboundTime,returnDate:'2026-11-12',returnTime:'12:00',pricing});assert.equal(result.ok,true);if(!result.ok)throw Error(result.error);return result;
 };
 let cases=0;
 for(const [airport,miles,fee] of [['BFS',16.218181818,5],['BHD',4.6,4],['DUB',98.6,0]] as const) {
  for(const vehicle of [SALOON_VEHICLE,ESTATE_VEHICLE])for(const ret of [false,true]) {
   const quote=q(saved,airport,miles,vehicle,ret);
   const publicQuote=q(toPublicOwnerPricingConfig(saved) as typeof saved,airport,miles,vehicle,ret);assert.equal(publicQuote.amount,quote.amount);
   const raw=Math.round(Math.max(30,10+2.2*miles))+(vehicle===ESTATE_VEHICLE?saved.estate.upliftGbp:0);
   const expectedJourney=Math.round(raw*(ret?1.9:1)*100)/100;assert.equal(quote.journeyFareGbp,expectedJourney);
   const breakdown=composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:quote.journeyFareGbp!,airportFixedCostsGbp:quote.airportFixedCostsGbp!,airportAccessChargeGbp:fee*(ret?2:1)});
   const total=breakdown.finalAmountPayableGbp;
   assert.equal(total,Math.round(expectedJourney+quote.airportFixedCostsGbp!+fee*(ret?2:1)));
   assert.equal(resolveSumUpChargeAmountGbp(total,total),total);assert.equal(checkoutAmountsMatch(total,total+10),false);assert.equal(resolveSumUpChargeAmountGbp(total,total+10),null);
   const validation=resolveOpenWebsitePaymentTransferFares({clientTransferAmountGbp:quote.amount,claimedJourneyFareGbp:quote.journeyFareGbp,claimedAirportFixedCostsGbp:quote.airportFixedCostsGbp,booking:{pickupLabel:'Belfast City Hall BT1 5GS',dropoffLabel:airport==='DUB'?'Dublin Airport':airport==='BHD'?'Belfast City Airport':'Belfast International Airport',airportCode:airport,isFromAirport:false,returnJourney:ret,passengers:2,suitcases:1,vehicle:vehicle},routeMetrics:{distanceKm:miles/.621371,durationMinutes:40},authoritativeQuote:{amountGbp:quote.amount,journeyFareGbp:quote.journeyFareGbp!,airportFixedCostsGbp:quote.airportFixedCostsGbp!}});assert.equal(validation.ok,true);cases++;
  }
 }
 const day=q(saved,'BFS',20).journeyFareGbp!;
 assert.equal(q({...saved,night:{...saved.night,enabled:true}},'BFS',20,SALOON_VEHICLE,false,'2026-11-10','23:00').journeyFareGbp,Math.round(day*1.17*100)/100);
 assert.equal(q({...saved,weekend:{...saved.weekend,enabled:true}},'BFS',20,SALOON_VEHICLE,false,'2026-11-14','12:00').journeyFareGbp,Math.round(day*1.23*100)/100);
 assert.equal(q({...saved,estate:{upliftGbp:12.75}},'BFS',20,ESTATE_VEHICLE).journeyFareGbp,day+12.75);
 const protectedResult=await applyProfitabilityProtection({pricing:saved,vehicleType:SALOON_VEHICLE,routeMetrics:{distanceKm:20/.621371,durationMinutes:40},pickup:null,dropoff:null,returnJourney:false,schedule:{},existing:{amountGbp:54,journeyFareGbp:54,airportFixedCostsGbp:0,nightWeekendSurchargeGbp:0}});assert.equal(protectedResult.amountGbp,54);assert.equal(protectedResult.fallbackReason,'analysis_only');
 saved.saloonFormula!.enabled=false;assert.equal((await api('POST',saved)).status,200);saved=await getOwnerPricingSettings(kv);
 assert.equal(toPublicOwnerPricingConfig(saved).postcodePricingEnabled,true);assert.equal(JSON.stringify(saved.postcodeRules),retained);assert.equal(calculateConfiguredSaloonFareGbp(20,saved),baseline);
 assert.notEqual(q(saved,'BFS',20).amount,q({...saved,saloonFormula:{...DEFAULT_SALOON_FORMULA,enabled:true}},'BFS',20).amount);
 console.log(`PASS authenticated save/reload, default OFF, validation, legacy save, 172 synthetic rules, ON/OFF precedence, independent premiums, configurable Estate, 5% discount, ${cases} quote/payment-preparation cases; zero network calls`);
} finally {globalThis.fetch=originalFetch;}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
