import assert from "node:assert/strict";
import { defaultOwnerPricingSettings, validateOwnerPricingInput, toPublicOwnerPricingConfig, diffOwnerPricingSettings, publicVehicleRequiresPersonalQuote } from "../shared/owner-pricing-config";
import { saveOwnerPricingSettings, getOwnerPricingSettings } from "../workers/addresses/src/owner-pricing-store";
import { handleQuoteCalculateRequest } from "../workers/addresses/src/quote-handlers";
import { handleCreateA2aQuoteRequest } from "../workers/addresses/src/a2a-quote-handlers";
import { suitableVehicleTypesForParty, EXECUTIVE_VEHICLE, SALOON_VEHICLE, MINIBUS_VEHICLE } from "../src/lib/vehicle-selection";
const data = new Map<string,string>();
const store = { async get(k:string,type?:string){const v=data.get(k);return v==null?null:type==="json"?JSON.parse(v):v;}, async put(k:string,v:string){data.set(k,v);}, async delete(k:string){data.delete(k);}, async list(){return {keys:[...data.keys()].map(name=>({name})),list_complete:true,cursor:""};} } as unknown as KVNamespace;
async function main(){
 const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
 const defaults=defaultOwnerPricingSettings();
 assert.equal(publicVehicleRequiresPersonalQuote(EXECUTIVE_VEHICLE,defaults),false);
 assert.equal(validateOwnerPricingInput({...defaults,executive:{...defaults.executive,requestQuote:"yes"}}).ok,false);
 const choices=suitableVehicleTypesForParty(2,2,{publicMinibusEnabled:true});
 for(const v of [SALOON_VEHICLE,EXECUTIVE_VEHICLE,MINIBUS_VEHICLE]) assert.ok(choices.includes(v));
 assert.ok(!suitableVehicleTypesForParty(2,3,{publicMinibusEnabled:true}).includes(EXECUTIVE_VEHICLE));
 assert.ok(!suitableVehicleTypesForParty(5,1,{publicMinibusEnabled:true}).includes(EXECUTIVE_VEHICLE));
 for(const businessRequest of [false,true]) for(const minibusRequest of [false,true]){
  clock+=11000;
  const settings={...defaults,executive:{...defaults.executive,requestQuote:businessRequest},minibus:{...defaults.minibus,publicEnabled:true,requestQuote:minibusRequest}};
  await saveOwnerPricingSettings(store,settings,{actor:"test-owner"});
  const loaded=await getOwnerPricingSettings(store);const config=toPublicOwnerPricingConfig(loaded);
  assert.equal(config.executive.requestQuote,businessRequest);
  assert.equal(publicVehicleRequiresPersonalQuote(SALOON_VEHICLE,config),false);
  assert.equal(publicVehicleRequiresPersonalQuote(EXECUTIVE_VEHICLE,config),businessRequest);
  assert.equal(publicVehicleRequiresPersonalQuote(MINIBUS_VEHICLE,config),minibusRequest);
  assert.equal(publicVehicleRequiresPersonalQuote(EXECUTIVE_VEHICLE,config,true),false);
  for(const vehicle of [SALOON_VEHICLE,EXECUTIVE_VEHICLE,MINIBUS_VEHICLE]){
   const response=await handleQuoteCalculateRequest(new Request("https://example.com/quote/calculate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pickupAddress:"Belfast City Hall, Belfast BT1 5GS",dropoffAddress:"Dublin Airport, Ireland",airportCode:"DUB",fromAirport:false,returnJourney:false,passengers:2,suitcases:2,vehicleType:vehicle,routeMetrics:{distanceKm:160,durationMinutes:110,source:"osrm"},outboundDate:"2026-11-01",outboundTime:"14:00"})}),null,{TRACKING_STORE:store});
   const payload=await response.json();
   const request=vehicle===EXECUTIVE_VEHICLE?businessRequest:vehicle===MINIBUS_VEHICLE?minibusRequest:false;
   assert.equal(response.status,request?409:200,JSON.stringify(payload));
   if(request) {assert.equal(payload.code,"personal_quote_required");assert.match(payload.message,vehicle===EXECUTIVE_VEHICLE?/Business Class/:/7 Seater/);}
  }
 }
 assert.ok(diffOwnerPricingSettings(defaults,{...defaults,executive:{...defaults.executive,requestQuote:true}}).some(c=>c.setting==="Business Class quote mode"));
 await saveOwnerPricingSettings(store,{...defaults,executive:{...defaults.executive,requestQuote:true}},{actor:"test-owner"});
 await saveOwnerPricingSettings(store,{},{actor:"test-owner",restoreDefaults:true});
 assert.equal((await getOwnerPricingSettings(store)).executive.requestQuote,true);
 const result=await handleCreateA2aQuoteRequest({TRACKING_STORE:store,OWNER_ACCESS_KEY:"test-owner"},{booking:{customerName:"Business Test",customerEmail:"test@example.com",mobileNumber:"07700900123",pickupLabel:"Dublin Airport",dropoffLabel:"Belfast",tripDate:"2026-11-01",tripTime:"14:00",passengers:2,suitcases:2,vehicle:EXECUTIVE_VEHICLE,isAirportTrip:true,airportCode:"DUB",flightNumber:"EI123",returnJourney:false}});
 assert.ok("ok" in result && result.ok);
 const record=[...data.values()].map(v=>{try{return JSON.parse(v)}catch{return null}}).find(v=>v?.booking?.customerName==="Business Test");
 assert.equal(record.status,"AWAITING_QUOTE");assert.equal(record.booking.vehicle,EXECUTIVE_VEHICLE);assert.equal(record.booking.isAirportTrip,true);
 Date.now=realNow;
 console.log("PASS: independent modes, persisted/public config, real quote API instant/request matrix, fit criteria, restore, Business Class dashboard request");
}
void main();
