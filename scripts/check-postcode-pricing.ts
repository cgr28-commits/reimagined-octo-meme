import assert from "node:assert/strict";
import { PROPOSED_POSTCODE_RULES, APPROVED_POSTCODE_RULES, postcodeTerminalAccessGbp, findPostcodeFare, validatePostcodeRules } from "../shared/postcode-pricing";
import { quoteAirportAccessCharges } from "../shared/meet-greet";
import { resolveExpressDropOff } from "../shared/express-drop-off";
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig, validateOwnerPricingInput, type OwnerPricingSettings } from "../shared/owner-pricing-config";
import type { VehicleType } from "../src/lib/data";
import { calculateQuote, calculateAirportToAirportQuote, roundGbp } from "../src/lib/quote";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { SALOON_VEHICLE as S, ESTATE_VEHICLE as E, EXECUTIVE_VEHICLE as B, MINIBUS_VEHICLE as M } from "../src/lib/vehicle-selection";
import { applyProfitabilityProtection } from "../workers/addresses/src/profitability";
import { approvedProductionProfitabilitySettings } from "../src/lib/owner-profitability-settings";
import { getOwnerPricingSettings, saveOwnerPricingSettings } from "../workers/addresses/src/owner-pricing-store";
import worker from "../workers/addresses/src/index";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { resolveOpenWebsitePaymentTransferFares, resolveSumUpChargeAmountGbp } from "../shared/open-website-payment-fares";
import { getPendingCheckout } from "../workers/addresses/src/pending-checkout-store";

function kv() {
  const data = new Map<string,string>();
  const store = { async get(k:string,t?:string){const v=data.get(k);return v==null?null:t==="json"?JSON.parse(v):v}, async put(k:string,v:string){data.set(k,v)}, async delete(k:string){data.delete(k)}, async list(){return {keys:[],list_complete:true}} } as unknown as KVNamespace;
  return {data,store};
}
const metrics = {distanceKm:159,durationMinutes:112};
const baseline=defaultOwnerPricingSettings(); baseline.night.enabled=false;baseline.weekend.enabled=false;
baseline.minibus.publicEnabled=true;
const pricing={...baseline, postcodePricingEnabled:true, postcodeRules:PROPOSED_POSTCODE_RULES.map(r=>({...r}))};
const addresses=["Belfast City Hall, Donegall Square N, Belfast BT1 5GS, UK", "The Grand Central Hotel, 9-15 Bedford Street, Belfast BT2 7FF, UK"];
const quote=(a:string,vehicle:VehicleType=S,airport="DUB",fromAirport=false,returning=false,p:OwnerPricingSettings=pricing)=>calculateQuote(a,airport,vehicle,returning,{},metrics,fromAirport,p)!;

async function main(){
  assert.deepEqual(defaultOwnerPricingSettings().postcodeRules,[],"No automatic production activation");
  for(const address of addresses) for(const [vehicle,fare] of [[S,245],[E,255]] as const){
    const q=quote(address,vehicle);assert.equal(q.amount,fare);assert.equal(roundGbp(q.journeyFareGbp!+q.airportFixedCostsGbp!),fare);
    assert.equal(q.outboundOneWayBeforeAccessGbp,fare);assert.equal(q.airportFixedCostsGbp,4,"Existing Dublin toll is inside, not on top of, fixed price");
    const service=calculateAuthoritativeWebsiteQuote({pickupAddress:address,dropoffAddress:"Dublin Airport (DUB)",airportCode:"DUB",fromAirport:false,returnJourney:false,passengers:2,suitcases:1,vehicleType:vehicle,routeMetrics:metrics,pricing});
    assert.ok(service.ok);if(service.ok)assert.equal(service.amount,fare);
    const breakdown=composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:q.journeyFareGbp!,airportFixedCostsGbp:q.airportFixedCostsGbp});
    const payment=resolveOpenWebsitePaymentTransferFares({clientTransferAmountGbp:fare,booking:{pickupLabel:address,dropoffLabel:"Dublin Airport (DUB)",vehicle},authoritativeQuote:{amountGbp:q.amount,journeyFareGbp:q.journeyFareGbp!,airportFixedCostsGbp:q.airportFixedCostsGbp!}});
    assert.ok(payment.ok);assert.equal(resolveSumUpChargeAmountGbp(fare,breakdown.finalAmountPayableGbp),fare);
  }
  for(const uplift of [0,6.5,12.75,20])assert.equal(quote(addresses[0],E,"DUB",false,false,{...pricing,estate:{upliftGbp:uplift}}).amount,roundGbp(245+uplift),"Supplement is configurable, never hardcoded");
  for(const a of ["10 Finaghy Road, Belfast BT10 0AA", "12 Road, Belfast BT11 9AA", "1 Road, Belfast BT12 6AA", "Road BT101AA", "Road BT111AA", "Road BT121AA", "Road BT21 1AA", "BT1 Road, Belfast BT10 0AA", "Belfast BT1"]){
    assert.equal(quote(a).amount,quote(a,S,"DUB",false,false,baseline).amount,a);
  }
  for(const a of ["Donegall Square, Belfast bt15gs", "Bedford Street, Belfast bt27ff"]){assert.equal(quote(a).amount,245);}
  for(const airport of ["BFS","BHD","LDY"])for(const a of addresses)for(const vehicle of [S,E])assert.deepEqual(quote(a,vehicle,airport),quote(a,vehicle,airport,false,false,baseline));
  // Arbitrary test-only Belfast prices: not proposed or activated business fares.
  for(const [airportCode,testFare] of [["BFS",50],["BHD",35]] as const) {
    const testPricing={...baseline,postcodePricingEnabled:true,postcodeRules:[{district:"BT1",airportCode,saloonFareGbp:testFare,enabled:true},{district:"BT2",airportCode,saloonFareGbp:testFare,enabled:true}]};
    for(const a of addresses){assert.equal(quote(a,S,airportCode,false,false,testPricing).amount+postcodeTerminalAccessGbp(airportCode),testFare);assert.equal(quote(a,E,airportCode,false,false,testPricing).amount+postcodeTerminalAccessGbp(airportCode),testFare+testPricing.estate.upliftGbp);assert.deepEqual(quote(a,S,airportCode,true,false,testPricing),quote(a,S,airportCode,true,false,baseline));}
  }
  for(const a of addresses)for(const vehicle of [S,E,B,M]){
    assert.deepEqual(quote(a,vehicle,"DUB",true),quote(a,vehicle,"DUB",true,false,baseline),"Reverse one-way unchanged");
    if(vehicle===B||vehicle===M)assert.deepEqual(quote(a,vehicle),quote(a,vehicle,"DUB",false,false,baseline),"Other vehicles unchanged");
  }
  const disabled={...pricing,postcodeRules:pricing.postcodeRules.map(r=>({...r,enabled:false}))};
  assert.deepEqual(quote(addresses[0],S,"DUB",false,false,disabled),quote(addresses[0],S,"DUB",false,false,baseline));
  for(const from of [false,true])for(const vehicle of [S,E]){
    const ret=quote(addresses[0],vehicle,"DUB",from,true);
    const out=quote(addresses[0],vehicle,"DUB",from), back=quote(addresses[0],vehicle,"DUB",!from);
    assert.equal(ret.outboundOneWayBeforeAccessGbp,out.amount);assert.equal(ret.returnOneWayBeforeAccessGbp,back.amount);
    assert.equal(ret.amount,roundGbp((out.journeyFareGbp!+back.journeyFareGbp!)*(1-pricing.returnDiscount.rate)+out.airportFixedCostsGbp!+back.airportFixedCostsGbp!),"Existing 5% journey-only discount; reverse leg priced normally");
  }
  const night={...pricing,night:{...pricing.night,enabled:true},weekend:{...pricing.weekend,enabled:true}};
  assert.equal(calculateQuote(addresses[0],"DUB",S,false,{outboundDate:"2026-10-17",outboundTime:"23:00"},metrics,false,night)!.amount,245,"Fixed price also takes priority over mileage surcharges");
  assert.equal(findPostcodeFare(pricing.postcodeRules,{address:"George Best Belfast City Airport, Belfast BT3 9JH",airportCode:"DUB",fromAirport:false},S,10),null);
  for(const from of ["BFS","BHD"])assert.deepEqual(calculateAirportToAirportQuote(from,"DUB","Belfast Airport","Dublin Airport",S,false,{},metrics,pricing),calculateAirportToAirportQuote(from,"DUB","Belfast Airport","Dublin Airport",S,false,{},metrics,baseline));
  for(const bad of [[{...PROPOSED_POSTCODE_RULES[0],district:"BT1 5GS"}],[{...PROPOSED_POSTCODE_RULES[0],district:"BT0"}],[{...PROPOSED_POSTCODE_RULES[0],airportCode:"FAKE"}],[{...PROPOSED_POSTCODE_RULES[0],saloonFareGbp:-1}],[{...PROPOSED_POSTCODE_RULES[0],saloonFareGbp:245.001}],[{...PROPOSED_POSTCODE_RULES[0],enabled:"yes"}],[PROPOSED_POSTCODE_RULES[0],PROPOSED_POSTCODE_RULES[0]]])assert.ok(validatePostcodeRules(bad).errors.length);
  assert.ok(validateOwnerPricingInput(pricing).ok);assert.equal(validateOwnerPricingInput({...pricing,postcodeRules:[{district:"BT1"}]}).ok,false);
  assert.equal(toPublicOwnerPricingConfig(pricing).postcodeRules?.length,2);
  console.log("OK BT1/BT2 full and compact postcodes: £245 Saloon / £255 Estate; configurable uplift; exact district boundaries; airports/directions/vehicles/fallbacks; return discount; included costs and payment amount");

  const {data,store}=kv();
  const saved=await saveOwnerPricingSettings(store,pricing,{expectedVersion:1,actor:"owner"});
  const quoteEnv={TRACKING_STORE:store,OWNER_ACCESS_KEY:"test-owner",DRIVER_ACCESS_KEY:"test-driver"};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error("Unexpected external request during isolated API pricing test");};
  try {
    for(const address of [...addresses,"10 Finaghy Road, Belfast BT10 0AA","1 Road, Belfast BT12 6AA"])for(const airportCode of ["DUB","BFS","BHD"])for(const fromAirport of [false,true])for(const vehicle of [S,E]) {
      const payload={airportCode,fromAirport,pickupAddress:fromAirport?`${airportCode} Airport`:address,dropoffAddress:fromAirport?address:`${airportCode} Airport`,returnJourney:false,passengers:2,suitcases:1,vehicleType:vehicle,routeMetrics:metrics,amount:1,postcodeRules:[{district:"BT1",airportCode:"DUB",saloonFareGbp:1,enabled:true}]};
      const response=await worker.fetch(new Request("https://worker.example/quote/calculate",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://www.myairporttaxini.co.uk"},body:JSON.stringify(payload)}),quoteEnv as never);
      const body=await response.json() as {amount:number};assert.equal(response.status,200,JSON.stringify(body));
      assert.equal(body.amount,quote(address,vehicle,airportCode,fromAirport).amount,"API must use stored settings, never client prices/rules");
    }
  } finally {globalThis.fetch=originalFetch;}
  console.log("OK Worker quote API matrix: full addresses, airports, both directions, Saloon/Estate; client prices and forged rules ignored");
  assert.ok(saved.audit.some(a=>a.changes.some(c=>c.setting.includes("Postcode"))));
  assert.equal((await getOwnerPricingSettings(store)).postcodeRules?.length,2);
  const legacy={...saved.settings};delete legacy.postcodeRules;
  const kept=await saveOwnerPricingSettings(store,legacy,{expectedVersion:saved.settings.version});assert.equal(kept.settings.postcodeRules?.length,2,"Older client saves preserve rules");
  await assert.rejects(saveOwnerPricingSettings(store,kept.settings,{expectedVersion:1}),/another session/);
  const env={TRACKING_STORE:store,OWNER_ACCESS_KEY:"test-owner",DRIVER_ACCESS_KEY:"test-driver"};
  const req=(key?:string,body:unknown={settings:kept.settings,expectedVersion:kept.settings.version},origin="https://www.myairporttaxini.co.uk")=>new Request("https://worker.example/owner/pricing",{method:"POST",headers:{"Content-Type":"application/json",Origin:origin,...(key?{"X-Owner-Key":key}:{})},body:JSON.stringify({postcodeRulesEditorVersion:2,...body as object})});
  const pricingSnapshot=()=>JSON.stringify([...data].filter(([k])=>k.startsWith("owner:pricing")));
  const before=pricingSnapshot();
  for(const key of [undefined,"wrong","test-driver"])assert.equal((await worker.fetch(req(key),env as never)).status,401);
  const driverSession=req("test-owner");driverSession.headers.set("X-Driver-Session","driver-session");assert.equal((await worker.fetch(driverSession,env as never)).status,401);
  assert.equal((await worker.fetch(req("test-owner",undefined,"https://postcode-preview.vercel.app"),env as never)).status,403);
  assert.equal((await worker.fetch(req("test-owner",{settings:{...kept.settings,postcodeRules:[{district:"BT1"}]},expectedVersion:kept.settings.version}),env as never)).status,400);
  assert.equal(pricingSnapshot(),before,"Rejected requests never mutate pricing settings or audit history");
  const stale=await worker.fetch(req("test-owner",{settings:kept.settings,expectedVersion:1}),env as never);assert.equal(stale.status,409);
  const removed=await worker.fetch(req("test-owner",{settings:{...kept.settings,postcodeRules:[PROPOSED_POSTCODE_RULES[0]]},expectedVersion:kept.settings.version}),env as never);assert.equal(removed.status,200);assert.equal((await getOwnerPricingSettings(store)).postcodeRules?.length,1);
  const updated=await getOwnerPricingSettings(store);
  const disabledResponse=await worker.fetch(req("test-owner",{settings:{...updated,postcodeRules:updated.postcodeRules!.map(r=>({...r,enabled:false}))},expectedVersion:updated.version}),env as never);assert.equal(disabledResponse.status,200);
  console.log("OK owner-only persistence, audit, editing/deletion/disable, validation, stale-save rejection, preview write protection and legacy settings preservation");

  const approvedPricing={...pricing,postcodeRules:APPROVED_POSTCODE_RULES};
  for(const airport of ["BFS","BHD"])for(const fromAirport of [false,true])for(const vehicle of [S,E]){
    const out=quote(addresses[0],vehicle,airport,fromAirport,false,approvedPricing);
    const back=quote(addresses[0],vehicle,airport,!fromAirport,false,approvedPricing);
    const ret=quote(addresses[0],vehicle,airport,fromAirport,true,approvedPricing);
    assert.equal(ret.journeyFareGbp,roundGbp((out.journeyFareGbp!+back.journeyFareGbp!)*(1-approvedPricing.returnDiscount.rate)));
    assert.equal(ret.outboundOneWayBeforeAccessGbp,out.amount);assert.equal(ret.returnOneWayBeforeAccessGbp,back.amount);
    const access=quoteAirportAccessCharges({expressLegs:resolveExpressDropOff({airportCode:airport,fromAirport,returnJourney:true,selected:true}).legs,airportCode:airport,fromAirport,returnJourney:true});
    assert.equal(access.airportAccessChargeGbp,2*postcodeTerminalAccessGbp(airport),"Return access is charged once per leg and is not discounted");
  }
  const realFetch=globalThis.fetch;
  globalThis.fetch=async input=>{
    assert.match(String(input),/route\/v1\//,"No live API, payment or notification requests");
    return new Response(JSON.stringify({code:"Ok",routes:[{distance:150000,duration:7200}]}),{headers:{"Content-Type":"application/json"}});
  };
  try{
    const protectedPricing={...approvedPricing,profitability:{...approvedProductionProfitabilitySettings(),targetHourlyEarningsGbp:100}};
    for(const [airportCode,saloon] of [["DUB",245],["BFS",55],["BHD",35]] as const)for(const vehicle of [S,E])for(const fromAirport of [false,true])for(const returning of [false,true]){
      const q=quote(addresses[0],vehicle,airportCode,fromAirport,returning,approvedPricing);
      const input={pricing:protectedPricing,vehicleType:vehicle,routeMetrics:metrics,pickup:{lat:54.5964,lng:-5.9302},dropoff:{lat:53.4264,lng:-6.2499},returnJourney:returning,dublinAirportJourney:airportCode==="DUB",schedule:{},existing:{amountGbp:q.amount,journeyFareGbp:q.journeyFareGbp!,airportFixedCostsGbp:q.airportFixedCostsGbp!,nightWeekendSurchargeGbp:0,outboundOneWayBeforeAccessGbp:q.outboundOneWayBeforeAccessGbp,returnOneWayBeforeAccessGbp:q.returnOneWayBeforeAccessGbp,outboundFixedGbp:q.outboundFixedGbp,returnFixedGbp:q.returnFixedGbp}};
      const result=await applyProfitabilityProtection({...input,postcodeContext:{address:addresses[0],airportCode,fromAirport}});
      const fare=saloon+(vehicle===E?approvedPricing.estate.upliftGbp:0)-postcodeTerminalAccessGbp(airportCode);
      if(!fromAirport)assert.equal(result.outboundOneWayBeforeAccessGbp,fare);
      if(!fromAirport&&!returning)assert.equal(result.amountGbp,fare,"Fixed postcode fare overrides even a much higher profitability floor");
      if(returning&&fromAirport)assert.equal(result.returnOneWayBeforeAccessGbp,fare);
      if(returning){const normal=await applyProfitabilityProtection({...input,pricing:{...protectedPricing,postcodeRules:[]}});if(fromAirport)assert.equal(result.outboundOneWayBeforeAccessGbp,normal.outboundOneWayBeforeAccessGbp);else assert.equal(result.returnOneWayBeforeAccessGbp,normal.returnOneWayBeforeAccessGbp);}
    }
  }finally{globalThis.fetch=realFetch;}
  console.log("OK active profitability cannot override the fixed leg; unmatched return legs retain ordinary protected pricing");

  const payments=kv();await saveOwnerPricingSettings(payments.store,approvedPricing,{expectedVersion:1});
  const checkoutAmounts:number[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url.includes("maps.googleapis.com")||url.includes("places.googleapis.com"))return new Response(JSON.stringify({status:"OK",results:[{geometry:{location:{lat:54.5964,lng:-5.9302}}}],location:{latitude:54.5964,longitude:-5.9302}}),{headers:{"Content-Type":"application/json"}});
    if(url.includes("/route/v1/"))return new Response(JSON.stringify({code:"Ok",routes:[{distance:159000,duration:6720}]}),{headers:{"Content-Type":"application/json"}});
    if(url.includes("api.mailchannels.net/")||url.includes("api.resend.com/emails"))return new Response(JSON.stringify({id:"isolated-test-message"}),{status:200,headers:{"Content-Type":"application/json"}});
    if(url==="https://api.sumup.com/v0.1/checkouts"&&init?.method==="POST"){
      const b=JSON.parse(String(init.body));checkoutAmounts.push(b.amount);
      return new Response(JSON.stringify({id:`postcode-checkout-${checkoutAmounts.length}`,checkout_reference:b.checkout_reference,hosted_checkout_url:"https://checkout.sumup.com/isolated-test",status:"PENDING",amount:b.amount}),{status:201});
    }
    throw new Error("Unexpected external request in isolated checkout test: "+url);
  };
  try {
    const payEnv={TRACKING_STORE:payments.store,SUMUP_API_KEY:"test-only",SUMUP_MERCHANT_CODE:"test-merchant",GOOGLE_PLACES_API_KEY:"test-google",OWNER_ACCESS_KEY:"test-owner",PUBLIC_SITE_ORIGIN:"https://www.myairporttaxini.co.uk"};
    const date=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
    for(const address of addresses)for(const [airportCode,saloon] of [["DUB",245],["BFS",55],["BHD",35]] as const)for(const vehicle of [S,E]){
      const fare=saloon+(vehicle===E?approvedPricing.estate.upliftGbp:0);
      const q=quote(address,vehicle,airportCode,false,false,approvedPricing);
      const access=quoteAirportAccessCharges({expressLegs:resolveExpressDropOff({airportCode,fromAirport:false,selected:true}).legs,airportCode,fromAirport:false});
      assert.equal(composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:q.journeyFareGbp!,airportFixedCostsGbp:q.airportFixedCostsGbp,airportAccessChargeGbp:access.airportAccessChargeGbp}).finalAmountPayableGbp,fare);
      const booking={customerName:"Test Customer",customerEmail:"test@example.com",mobileNumber:"07700900123",pickupLabel:address,dropoffLabel:airportCode==="DUB"?"Dublin Airport (DUB)":airportCode==="BFS"?"Belfast International Airport (BFS)":"Belfast City Airport (BHD)",tripLabel:"Airport drop-off",tripDate:date,tripTime:"12:00",returnJourney:false,passengers:2,suitcases:1,vehicle,isAirportTrip:true,isFromAirport:false,airportCode,termsAcceptedAt:new Date().toISOString()};
      const payload={booking,pickupPlaceId:"ChIJ-isolated-test",dropoffPlaceId:`quickselect-${airportCode}`,amount:q.amount,acceptedFinalAmountGbp:fare,journeyFareGbp:q.journeyFareGbp,airportFixedCostsGbp:q.airportFixedCostsGbp,description:"Airport transfer",redirectUrl:"https://www.myairporttaxini.co.uk/booking-confirmed/"};
      const response=await worker.fetch(new Request("https://worker.example/payments",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://www.myairporttaxini.co.uk"},body:JSON.stringify(payload)}),payEnv as never);
      const b=await response.json() as {checkoutId:string};assert.equal(response.status,200,JSON.stringify(b));assert.equal(checkoutAmounts.at(-1),fare);
      const pending=await getPendingCheckout(payments.store,b.checkoutId);assert.equal(pending?.amount,fare);assert.equal(pending?.booking.vehicle,vehicle);
      const mismatch=await worker.fetch(new Request("https://worker.example/payments",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://www.myairporttaxini.co.uk"},body:JSON.stringify({...payload,acceptedFinalAmountGbp:1})}),payEnv as never);assert.equal(mismatch.status,409,"Changed accepted fare cannot reach SumUp");
    }
    assert.deepEqual(checkoutAmounts,[245,255,55,65,35,45,245,255,55,65,35,45]);
    // Deliberately test-only reverse prices, not approved/staged business fares.
    const reversePricing={...approvedPricing,postcodeRules:[...approvedPricing.postcodeRules,...approvedPricing.postcodeRules.filter(r=>r.district==="BT1").map(r=>({...r,direction:"from-airport" as const,approvalStatus:"approved" as const,saloonFareGbp:123.45}))]};
    await saveOwnerPricingSettings(payments.store,reversePricing);
    for(const airportCode of ["DUB","BFS","BHD"])for(const vehicle of [S,E]){
      const fare=vehicle===E?133.45:123.45;
      const q=quote(addresses[0],vehicle,airportCode,true,false,reversePricing);
      const airport=airportCode==="DUB"?"Dublin Airport (DUB)":airportCode==="BFS"?"Belfast International Airport (BFS)":"Belfast City Airport (BHD)";
      const booking={customerName:"Test Customer",customerEmail:"test@example.com",mobileNumber:"07700900123",pickupLabel:airport,dropoffLabel:addresses[0],tripLabel:"Airport pickup",tripDate:date,tripTime:"12:00",returnJourney:false,passengers:2,suitcases:1,vehicle,isAirportTrip:true,isFromAirport:true,airportCode,flightNumber:"BA1234",termsAcceptedAt:new Date().toISOString()};
      const payload={booking,pickupPlaceId:`quickselect-${airportCode}`,dropoffPlaceId:"ChIJ-isolated-test",amount:q.amount,acceptedFinalAmountGbp:fare,journeyFareGbp:q.journeyFareGbp,airportFixedCostsGbp:q.airportFixedCostsGbp,description:"Airport transfer",redirectUrl:"https://www.myairporttaxini.co.uk/booking-confirmed/"};
      const response=await worker.fetch(new Request("https://worker.example/payments",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://www.myairporttaxini.co.uk"},body:JSON.stringify(payload)}),payEnv as never);
      const b=await response.json() as {checkoutId:string};assert.equal(response.status,200,JSON.stringify(b));assert.equal(checkoutAmounts.at(-1),fare);assert.equal((await getPendingCheckout(payments.store,b.checkoutId))?.amount,fare);
    }
    assert.deepEqual(checkoutAmounts.slice(12),[123.45,133.45,123.45,133.45,123.45,133.45]);
  } finally {globalThis.fetch=realFetch;}
  console.log("OK BT1/BT2 actual /payments → exact totals Dublin £245/£255, International £55/£65, City £35/£45, with terminal charges once; persisted amounts and mismatch rejection; no live payments");
  console.log("OK independently configured reverse test fares reach exact pence SumUp amounts for all three airports/Saloon/Estate; included arrival charges not duplicated");
}
void main().catch(e=>{console.error(e);process.exitCode=1});
