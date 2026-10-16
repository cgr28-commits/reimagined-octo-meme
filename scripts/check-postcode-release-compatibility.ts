import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { defaultOwnerPricingSettings, normalizeOwnerPricingSettings, toPublicOwnerPricingConfig } from "../shared/owner-pricing-config";
import { APPROVED_POSTCODE_RULES, postcodePricingIsEnabled, postcodeRuleApproved } from "../shared/postcode-pricing";
import { calculateQuote } from "../src/lib/quote";
import { SALOON_VEHICLE as S, ESTATE_VEHICLE as E } from "../src/lib/vehicle-selection";
import { approvedProductionProfitabilitySettings } from "../src/lib/owner-profitability-settings";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { quoteAirportAccessCharges } from "../shared/meet-greet";
import { resolveExpressDropOff } from "../shared/express-drop-off";
import { getOwnerPricingSettings } from "../workers/addresses/src/owner-pricing-store";
import { getPendingCheckout } from "../workers/addresses/src/pending-checkout-store";
import worker from "../workers/addresses/src/index";
const { startLegacyHarness } = createRequire(import.meta.url)("./postcode-legacy-harness.cjs");

async function main() {
 const base=defaultOwnerPricingSettings();base.night.enabled=false;base.weekend.enabled=false;
 const legacy={...base,version:205,updatedAt:"2026-10-16T03:35:06.718Z",estate:{upliftGbp:10},postcodeRules:APPROVED_POSTCODE_RULES.map(r=>({...r})),profitability:approvedProductionProfitabilitySettings()};
 delete legacy.postcodePricingEnabled;
 const normal=normalizeOwnerPricingSettings(legacy);assert.equal(normal.postcodePricingEnabled,true);assert.equal(normal.version,205);assert.deepEqual(normal.postcodeRules,legacy.postcodeRules);
 assert.equal(postcodePricingIsEnabled(undefined,[]),false);assert.equal(postcodePricingIsEnabled(false,legacy.postcodeRules),false);
 const inactive=legacy.postcodeRules.map(r=>({...r,enabled:false}));assert.equal(postcodePricingIsEnabled(undefined,inactive),false);assert.ok(inactive.every(r=>!postcodeRuleApproved(r)));
 const drafts=legacy.postcodeRules.map(r=>({...r,enabled:false,direction:"from-airport" as const,approvalStatus:"needs-verification" as const}));
 assert.equal(postcodePricingIsEnabled(undefined,drafts),false);assert.equal(postcodeRuleApproved({...legacy.postcodeRules[0],direction:"from-airport"}),false);
 assert.equal(toPublicOwnerPricingConfig({...legacy,postcodePricingEnabled:false}).postcodeRules!.length,0);
 assert.equal(toPublicOwnerPricingConfig({...legacy,postcodePricingEnabled:true,postcodeRules:[...legacy.postcodeRules,...drafts]}).postcodeRules!.length,6);
 for(const approvalStatus of ["draft","needs-verification"] as const)assert.equal(postcodePricingIsEnabled(undefined,[{...legacy.postcodeRules[0],approvalStatus}]),false);

 const data=new Map<string,string>([["owner:pricing-settings",JSON.stringify(legacy)]]);
 const store={async get(k:string,t?:string){const v=data.get(k);return v==null?null:t==="json"?JSON.parse(v):v},async put(k:string,v:string){data.set(k,v)},async delete(k:string){data.delete(k)},async list(){return{keys:[],list_complete:true}}} as unknown as KVNamespace;
 const env={TRACKING_STORE:store,OWNER_ACCESS_KEY:"test-owner",DRIVER_ACCESS_KEY:"test-driver",GOOGLE_PLACES_API_KEY:"test-google",SUMUP_API_KEY:"test-only",SUMUP_MERCHANT_CODE:"test-only",PUBLIC_SITE_ORIGIN:"https://www.myairporttaxini.co.uk"};
 const amounts:number[]=[];const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  const u=String(input);if(u.includes("maps.googleapis.com")||u.includes("places.googleapis.com"))return new Response(JSON.stringify({status:"OK",result:{geometry:{location:{lat:54.5964,lng:-5.9302}}},results:[{geometry:{location:{lat:54.5964,lng:-5.9302}}}],location:{latitude:54.5964,longitude:-5.9302}}),{headers:{"Content-Type":"application/json"}});
  if(u.includes("/route/v1/"))return new Response(JSON.stringify({code:"Ok",routes:[{distance:159000,duration:6720}]}),{headers:{"Content-Type":"application/json"}});
  if(u==="https://api.sumup.com/v0.1/checkouts"&&init?.method==="POST"){const b=JSON.parse(String(init.body));amounts.push(b.amount);return new Response(JSON.stringify({id:"compat-test-"+amounts.length,checkout_reference:b.checkout_reference,hosted_checkout_url:"https://checkout.sumup.com/test-only",status:"PENDING",amount:b.amount}),{status:201})}
  if(u.includes("api.mailchannels.net/")||u.includes("api.resend.com/emails"))return new Response(JSON.stringify({id:"isolated-message"}));
  throw new Error("Unexpected external request blocked: "+u);
 };
 const request=async(path:string,body?:unknown)=>{const r=await worker.fetch(new Request("https://worker.example"+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",Origin:"https://www.myairporttaxini.co.uk",...(path.startsWith("/owner/")?{"X-Owner-Key":"test-owner"}:{})},...(body?{body:JSON.stringify(body)}:{})}),env as never);return{status:r.status,body:await r.json() as any}};
 const historical=await startLegacyHarness(process.cwd());
 try{
  await historical.call({kind:"init",settings:legacy});
  const before=data.get("owner:pricing-settings");const config=await request("/pricing/public");assert.equal(config.body.config.postcodePricingEnabled,true);assert.equal(data.get("owner:pricing-settings"),before,"Read must not migrate/write production-shaped config");
  const oldConfig=(await historical.call({path:"/pricing/public"})).body.config;
  const date=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
  for(const district of ["BT1","BT2"])for(const [airport,saloon] of [["BHD",35],["BFS",55],["DUB",245]] as const)for(const vehicle of [S,E]){
   const address=district==="BT1"?"Belfast City Hall, Belfast BT1 5GS":"Grand Central Hotel, Belfast BT2 7FF";
   const airportAddress=airport==="BHD"?"Belfast City Airport (BHD)":airport==="BFS"?"Belfast International Airport (BFS)":"Dublin Airport (DUB)";
   const expected=saloon+(vehicle===E?10:0);
   const oldToNew=await historical.call({kind:"frontend",address,airport,vehicle,pricing:config.body.config});assert.equal(oldToNew.final,expected,"Old frontend + new Worker config");
   const newToOld=calculateQuote(address,airport,vehicle,false,{}, {distanceKm:159,durationMinutes:112},false,oldConfig)!;
   const access=quoteAirportAccessCharges({expressLegs:resolveExpressDropOff({airportCode:airport,fromAirport:false,selected:true}).legs,airportCode:airport,fromAirport:false});
   assert.equal(composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:newToOld.journeyFareGbp!,airportFixedCostsGbp:newToOld.airportFixedCostsGbp,airportAccessChargeGbp:access.airportAccessChargeGbp}).finalAmountPayableGbp,expected,"New frontend + old Worker config");
   const quoteBody={pickupAddress:address,dropoffAddress:airportAddress,returnJourney:false,passengers:2,suitcases:1,vehicleType:vehicle,pickupPlaceId:"ChIJ-isolated-test",dropoffPlaceId:`quickselect-${airport}`,pickupLat:54.5964,pickupLng:-5.9302,dropoffLat:53.4264,dropoffLng:-6.2499};
   const modern=await request("/quote/calculate",quoteBody),old=await historical.call({path:"/quote/calculate",method:"POST",body:quoteBody});assert.equal(modern.status,200);assert.equal(old.status,200);assert.equal(modern.body.amount,old.body.amount);
   const booking={customerName:"Test Customer",customerEmail:"test@example.com",mobileNumber:"07700900123",pickupLabel:address,dropoffLabel:airportAddress,tripLabel:"Airport drop-off",tripDate:date,tripTime:"12:00",returnJourney:false,passengers:2,suitcases:1,vehicle,isAirportTrip:true,isFromAirport:false,airportCode:airport,termsAcceptedAt:new Date().toISOString()};
   const payload={booking,pickupPlaceId:"ChIJ-isolated-test",dropoffPlaceId:`quickselect-${airport}`,amount:modern.body.amount,acceptedFinalAmountGbp:expected,journeyFareGbp:modern.body.journeyFareGbp,airportFixedCostsGbp:modern.body.airportFixedCostsGbp,description:"Airport transfer",redirectUrl:"https://www.myairporttaxini.co.uk/booking-confirmed/"};
   const paid=await request("/payments",payload),oldPaid=await historical.call({path:"/payments",method:"POST",body:payload});assert.equal(paid.status,200,JSON.stringify(paid.body));assert.equal(oldPaid.status,200,JSON.stringify(oldPaid.body));assert.equal(amounts.at(-1),expected);assert.equal(oldPaid.checkoutAmounts.at(-1),expected);assert.equal((await getPendingCheckout(store,paid.body.checkoutId))?.amount,expected);
   for(const fromAirport of [false,true])for(const returnJourney of [false,true]){
    const current=calculateQuote(address,airport,vehicle,returnJourney,{}, {distanceKm:159,durationMinutes:112},fromAirport,legacy)!;
    const previous=await historical.call({kind:"frontend",address,airport,vehicle,pricing:oldConfig,fromAirport,returnJourney});assert.equal(current.amount,previous.quote.amount,"Legacy one-way/return/both directions remain identical");
   }
  }
  assert.equal(data.get("owner:pricing-settings"),before,"Quotes and checkout cannot rewrite pricing");
  console.log("OK exact production-shaped v205 legacy config: both deployment orders, 12 Saloon/Estate quotes and real Worker payment flows vs actual pre-upgrade code, same persisted totals, returns/reverse unchanged, no settings write");

  // Old editors omit the switch/records or strip metadata. No destructive reinterpretation.
  const rich={...legacy,postcodePricingEnabled:false,postcodeRules:[...legacy.postcodeRules,...drafts]};data.set("owner:pricing-settings",JSON.stringify(rich));
  const oldClient={...legacy};delete (oldClient as any).postcodeRules;
  const saved=await request("/owner/pricing",{settings:oldClient,expectedVersion:205});assert.equal(saved.status,200);assert.equal(saved.body.settings.postcodePricingEnabled,false);assert.equal(saved.body.settings.postcodeRules.length,12);
  const stripped={...saved.body.settings,postcodeRules:legacy.postcodeRules};
  const refused=await request("/owner/pricing",{settings:stripped,expectedVersion:saved.body.settings.version});assert.equal(refused.status,409);assert.equal(refused.body.code,"postcode_editor_upgrade_required");assert.equal((await getOwnerPricingSettings(store)).postcodeRules!.length,12);
  const latest=await getOwnerPricingSettings(store);
  const on=await request("/owner/pricing",{settings:{...latest,postcodePricingEnabled:true},expectedVersion:latest.version,postcodeRulesEditorVersion:2});assert.equal(on.status,200);assert.equal(on.body.settings.postcodePricingEnabled,true);assert.equal((await request("/pricing/public")).body.config.postcodeRules.length,6);
  const off=await request("/owner/pricing",{settings:{...on.body.settings,postcodePricingEnabled:false},expectedVersion:on.body.settings.version,postcodeRulesEditorVersion:2});assert.equal(off.status,200);assert.equal((await request("/pricing/public")).body.config.postcodeRules.length,0);
  console.log("OK explicit OFF/ON, only six approved enabled outbound rules, legacy-client omitted fields preserved, metadata/record-erasing older saves rejected without mutation");
 }finally{try{await historical.close();}finally{globalThis.fetch=original;}}
}
void main().catch(e=>{console.error(e);process.exitCode=1});
