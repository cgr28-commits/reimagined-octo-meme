/** Offline configured premium boundaries, persistence and quote/checkout parity. */
import assert from 'node:assert/strict';
import {defaultOwnerPricingSettings,DEFAULT_EVENING_PRICING,validateOwnerPricingInput,toPublicOwnerPricingConfig,nightWeekendSurchargeLabel,nightWeekendSurchargeExplanation} from '../shared/owner-pricing-config';
import {applyTripPremium} from '../src/lib/point-to-point-premium';
import {getOwnerPricingSettings,saveOwnerPricingSettings,listOwnerPricingAudit} from '../workers/addresses/src/owner-pricing-store';
import {calculateServerQuote} from '../src/lib/quick-quote-api';
import {handleQuoteCalculateRequest} from '../workers/addresses/src/quote-handlers';
import worker from '../workers/addresses/src/index';
import {createPaymentCheckout} from '../src/lib/create-payment';
import {composeWebsiteFareBreakdown} from '../shared/website-fare-breakdown';
import {resolveExpressDropOff} from '../shared/express-drop-off';
import {quoteAirportAccessCharges} from '../shared/meet-greet';
import {SERVED_AIRPORTS} from '../shared/served-airports';
import {SALOON_VEHICLE} from '../src/lib/vehicle-selection';

const settings=defaultOwnerPricingSettings();
settings.night.surchargeRate=.25;
settings.evening={enabled:true,surchargeRate:.15,startMinutes:18*60,endMinutes:22*60};
let checks=0;
const eq=(actual:unknown,expected:unknown,label:string)=>{assert.deepEqual(actual,expected,label);checks++;};
const premium=(date:string,time:string,pricing=settings)=>applyTripPremium(100,{outboundDate:date,outboundTime:time},undefined,{pricing}).premiumAmount;
async function main(){
 eq(defaultOwnerPricingSettings().evening,DEFAULT_EVENING_PRICING,'new controls preserve legacy prices');
 const old={...settings};delete old.evening;const legacy=validateOwnerPricingInput(old);assert.ok(legacy.ok);eq(legacy.settings.evening,DEFAULT_EVENING_PRICING,'missing Evening migrates disabled');
 for(const [time,expected] of [['17:59',0],['18:00',15],['21:59',15],['22:00',25],['05:59',25],['06:00',0]] as const)eq(premium('2026-10-26',time),expected,time);
 for(const date of ['2026-10-24','2026-10-25','2026-03-29']){
  eq(premium(date,'12:00'),10,'weekend daytime');eq(premium(date,'19:00'),15,'highest Evening/Weekend');eq(premium(date,'23:00'),25,'highest Night/Weekend, including DST');
 }
 for(const rate of [.2,.25,.375])eq(premium('2026-10-26','23:00',{...settings,night:{...settings.night,surchargeRate:rate}}),100*rate,'configured night rate');
 const overlapping={...settings,evening:{...settings.evening!,endMinutes:60,surchargeRate:.3}};
 eq(premium('2026-10-24','23:00',overlapping),30,'three overlaps apply once');
 eq(premium('2026-10-26','00:59',overlapping),30,'Evening window wraps midnight');
 eq(premium('2026-10-26','01:00',overlapping),25,'end is exclusive');
 eq(premium('2026-10-26','19:00',{...settings,evening:{...settings.evening!,enabled:false}}),0,'disabled Evening');
 const returning=applyTripPremium(100,{outboundDate:'2026-10-26',outboundTime:'19:00',returnDate:'2026-10-27',returnTime:'23:00',returnJourney:true},undefined,{pricing:settings});
 eq(returning.premiumAmount,40,'different rate on each original base');eq(returning.total,230,'5% discount only on base');
 for(const bad of [-.1,1.01,NaN,'',null])eq(validateOwnerPricingInput({...settings,evening:{...settings.evening,surchargeRate:bad}}).ok,false,'invalid rate');
 for(const bad of [-1,1440,1080])eq(validateOwnerPricingInput({...settings,evening:{...settings.evening,endMinutes:bad}}).ok,false,'invalid/equal time');
 eq(nightWeekendSurchargeLabel(settings),'Evening 15% / Night 25% / Weekend 10% surcharge','configured label');
 assert.match(nightWeekendSurchargeExplanation(settings),/highest surcharge/);
 const store=new Map<string,string>();
 const kv={async get(k:string,t?:string){const v=store.get(k);return v==null?null:t==='json'?JSON.parse(v):v;},async put(k:string,v:string){store.set(k,v);},async delete(k:string){store.delete(k);},async list(){return {keys:[],list_complete:true};}} as unknown as KVNamespace;
 await saveOwnerPricingSettings(kv,settings);eq((await getOwnerPricingSettings(kv)).evening,settings.evening,'save/reload');
 const saved=await getOwnerPricingSettings(kv),oldClient={...saved};delete oldClient.evening;
 await saveOwnerPricingSettings(kv,oldClient);eq((await getOwnerPricingSettings(kv)).evening,settings.evening,'old clients preserve Evening');
 eq(toPublicOwnerPricingConfig(await getOwnerPricingSettings(kv)).evening,settings.evening,'public snapshot');
 assert.ok((await listOwnerPricingAudit(kv)).some(row=>row.changes.some(c=>c.setting.includes('Evening'))));
 console.log('PASS',checks,'premium boundary, percentage, validation and persistence checks');

 const originalFetch=globalThis.fetch,originalNow=Date.now;let now=Date.parse('2026-10-22T12:00:00Z');Date.now=()=>now;
 const origin='https://www.myairporttaxini.co.uk';
 const env={TRACKING_STORE:kv,GOOGLE_PLACES_API_KEY:'mock-google',SUMUP_API_KEY:'mock-sumup',SUMUP_MERCHANT_CODE:'mock-merchant',PUBLIC_SITE_ORIGIN:origin};
 let charge=0,checkouts=0;
 const hall={address:'Belfast City Hall, Belfast BT1 5GS, UK',placeId:'test-city-hall',lat:54.5966472,lng:-5.9300677};
 globalThis.fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url);
  if(url.pathname==='/quote/calculate')return handleQuoteCalculateRequest(req,origin,env);
  if(url.pathname==='/payments')return worker.fetch(new Request(req,{headers:{...Object.fromEntries(req.headers),Origin:origin}}),env as never);
  if(url.hostname==='places.googleapis.com')return Response.json({id:hall.placeId,formattedAddress:hall.address,displayName:{text:'Belfast City Hall'},location:{latitude:hall.lat,longitude:hall.lng},addressComponents:[{longText:'BT1 5GS',types:['postal_code']},{longText:'United Kingdom',shortText:'GB',types:['country']}]});
  if(url.pathname.includes('/route/v1/driving/'))return Response.json({code:'Ok',routes:[{distance:25830,duration:1506}]});
  if(url.hostname==='api.mailchannels.net')return Response.json({ok:true});
  if(url.hostname==='api.sumup.com'&&req.method==='POST'){
   const body=await req.json() as {amount:number;checkout_reference:string};charge=body.amount;checkouts++;
   return Response.json({id:`isolated-${checkouts}`,checkout_reference:body.checkout_reference,hosted_checkout_url:'https://checkout.sumup.com/isolated',status:'PENDING',amount:charge},{status:201});
  }
  throw Error(`Unexpected external call: ${req.method} ${url.hostname}${url.pathname}`);
 };
 try{
  for(const code of ['BFS','BHD','DUB'])for(const reverse of [false,true])for(const returning of [false,true])for(const time of ['19:00','23:00']){
   now+=20_000;store.clear();store.set('owner:pricing-settings',JSON.stringify(settings));
   const airport=SERVED_AIRPORTS.find(a=>a.code===code)!;
   const pickupAddress=reverse?airport.formattedAddress:hall.address,dropoffAddress=reverse?hall.address:airport.formattedAddress;
   const pickupPlaceId=reverse?airport.placeId:hall.placeId,dropoffPlaceId=reverse?hall.placeId:airport.placeId;
   const journey={pickupAddress,dropoffAddress,pickupPlaceId,dropoffPlaceId,vehicleType:SALOON_VEHICLE,passengers:1,suitcases:1,returnJourney:returning,outboundDate:'2026-10-26',outboundTime:time,returnDate:'2026-10-27',returnTime:'23:00'};
   const quoted=await calculateServerQuote(journey);assert.ok(quoted.ok,JSON.stringify(quoted));
   const noon=await calculateServerQuote({...journey,returnJourney:false,outboundTime:'12:00'});assert.ok(noon.ok);
   const base=noon.journeyFareGbp!;
   const expectedSurcharge=Math.round(base*((time==='19:00'?.15:.25)+(returning?.25:0))*100)/100;
   eq(quoted.nightWeekendSurchargeGbp,expectedSurcharge,'configured per-leg rate reaches Worker response');
   eq(quoted.nightWeekendSurchargeLabel,nightWeekendSurchargeLabel(settings),'response copy uses same settings');
   const express=resolveExpressDropOff({airportCode:code,fromAirport:reverse,returnJourney:returning,selected:true,outboundSelected:true,returnSelected:true});
   const access=quoteAirportAccessCharges({airportCode:code,fromAirport:reverse,returnJourney:returning,expressLegs:express.legs,fees:settings.meetGreet});
   const breakdown=composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:quoted.journeyFareGbp!,nightWeekendSurchargeGbp:quoted.nightWeekendSurchargeGbp,nightWeekendSurchargeLabel:quoted.nightWeekendSurchargeLabel,airportFixedCostsGbp:quoted.airportFixedCostsGbp,airportAccessChargeGbp:access.airportAccessChargeGbp,returnJourney:returning});
   const total=breakdown.finalAmountPayableGbp;
   const booking={estimatedPrice:`£${total.toFixed(2)}`,customerName:'Isolated Test',customerEmail:'test@example.invalid',mobileNumber:'07700900123',pickupLabel:pickupAddress,dropoffLabel:dropoffAddress,tripLabel:reverse?'Airport pickup':'Airport drop-off',tripDate:journey.outboundDate,tripTime:time,returnDate:journey.returnDate,returnTime:journey.returnTime,returnJourney:returning,passengers:1,suitcases:1,vehicle:SALOON_VEHICLE,isAirportTrip:true,isFromAirport:reverse,airportCode:code,flightNumber:'BA1234',returnFlightNumber:'BA1234',termsAcceptedAt:new Date(now).toISOString()};
   await createPaymentCheckout({booking,pickupPlaceId,dropoffPlaceId,amount:quoted.amount,acceptedFinalAmountGbp:total,journeyFareGbp:quoted.journeyFareGbp,airportFixedCostsGbp:quoted.airportFixedCostsGbp,description:'Isolated test',redirectUrl:origin+'/booking-confirmed/'});
   eq(charge,total,'mock SumUp amount equals displayed fare');
  }
  eq(checkouts,24,'all journeys exercised');console.log('PASS 24 configured Evening/Night quote → mocked SumUp cases: BFS/BHD/DUB, both directions, one-way/return');
 }finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
