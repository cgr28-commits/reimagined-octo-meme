import assert from "node:assert/strict";
import { EXECUTIVE_CUSTOMER_CAPACITY } from "../shared/vehicle-display";
import { getPaymentBookingBlockers } from "../shared/paid-booking-gate";
import { EXECUTIVE_VEHICLE, SALOON_VEHICLE, ESTATE_VEHICLE, MINIBUS_VEHICLE, vehicleFitsParty, resolvePublicVehicleChoice, keepOrSmallestSuitableVehicle } from "../src/lib/vehicle-selection";
import { createA2aQuoteRequest, handleCreateA2aQuoteRequest, handleOwnerApproveA2aQuote } from "../workers/addresses/src/a2a-quote-handlers";
import { saveA2aQuoteRequest } from "../workers/addresses/src/a2a-quote-store";
import worker from "../workers/addresses/src/index";
import type { PaidBookingDetails } from "../shared/booking-notifications";

async function main() {
assert.equal(EXECUTIVE_CUSTOMER_CAPACITY, "1–3 passengers");
assert.equal(vehicleFitsParty(EXECUTIVE_VEHICLE, 3, 2), true);
assert.equal(vehicleFitsParty(EXECUTIVE_VEHICLE, 4, 2), false);
assert.equal(vehicleFitsParty(EXECUTIVE_VEHICLE, 3, 3), false);
assert.equal(vehicleFitsParty(SALOON_VEHICLE, 4, 2), true);
assert.equal(vehicleFitsParty(ESTATE_VEHICLE, 4, 4), true);
assert.equal(vehicleFitsParty(MINIBUS_VEHICLE, 7, 4), true);
for (const ownerMode of [false, true]) {
 assert.equal(resolvePublicVehicleChoice({requested: EXECUTIVE_VEHICLE, passengers: 3, suitcases: 2, ownerMode}).ok, true);
 assert.equal(resolvePublicVehicleChoice({requested: EXECUTIVE_VEHICLE, passengers: 4, suitcases: 2, ownerMode}).ok, false);
}
assert.equal(keepOrSmallestSuitableVehicle({current: EXECUTIVE_VEHICLE, passengers: 4, suitcases: 2}), SALOON_VEHICLE);
const date = new Date(Date.now()+10*86400000).toISOString().slice(0,10);
const booking: PaidBookingDetails = {customerName:"Test Customer", customerEmail:"test@example.com", mobileNumber:"07700900123", pickupLabel:"Belfast International Airport (BFS)", dropoffLabel:"Belfast City Hall", tripLabel:"Airport pickup", tripDate:date, tripTime:"12:00", passengers:4, suitcases:2, vehicle:EXECUTIVE_VEHICLE, isAirportTrip:true, isFromAirport:true, airportCode:"BFS", flightNumber:"BA1234", termsAcceptedAt:new Date().toISOString()};
assert.match(getPaymentBookingBlockers(booking).join(" "), /Business Class accommodates up to 3/);
assert.deepEqual(getPaymentBookingBlockers({...booking, passengers:3}), []);
const data = new Map<string,string>();
const store = { async get(key:string, mode?:string) {const v=data.get(key);return v==null?null:mode==="json"?JSON.parse(v):v}, async put(key:string,v:string){data.set(key,v)}, async delete(key:string){data.delete(key)}, async list(){return {keys:[], list_complete:true}}} as unknown as KVNamespace;
const env = {TRACKING_STORE:store, OWNER_ACCESS_KEY:"test-owner", SUMUP_API_KEY:"test-key", SUMUP_MERCHANT_CODE:"test-merchant", PUBLIC_SITE_ORIGIN:"https://www.myairporttaxini.co.uk"};
const realFetch=globalThis.fetch; let calls=0;
globalThis.fetch=async()=>{calls++;throw new Error("Unexpected external request")};
try {
 const invalid=await handleCreateA2aQuoteRequest(env, {booking});
 assert.ok("error" in invalid); assert.equal(invalid.status,400); assert.equal(data.size,0);
 const legacy=await createA2aQuoteRequest({store,booking});
 const approval=await handleOwnerApproveA2aQuote(new Request("https://worker.example/owner/a2a-quotes/approve",{headers:{"X-Owner-Key":"test-owner"}}),env,{reference:legacy.reference,quotedPrice:123,validityMinutes:60});
 assert.ok("error" in approval);assert.equal(approval.status,400);
 // A legacy approved quote with an existing checkout must also be blocked before checkout reuse.
 await saveA2aQuoteRequest(store,{...legacy,status:"QUOTE_APPROVED_AWAITING_PAYMENT",quotedPrice:123,quoteExpiresAt:new Date(Date.now()+3600000).toISOString(),checkoutId:"existing-checkout",paymentUrl:"https://checkout.sumup.com/test"});
 const response=await worker.fetch(new Request("https://worker.example/payments",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://www.myairporttaxini.co.uk"},body:JSON.stringify({a2aQuoteToken:legacy.paymentToken,amount:123,description:"Approved quote",redirectUrl:"https://www.myairporttaxini.co.uk/booking-confirmed/"})}),env as never);
 assert.equal(response.status,400,await response.clone().text());assert.match(await response.text(),/Business Class accommodates up to 3/);assert.equal(calls,0);
} finally {globalThis.fetch=realFetch}
console.log("OK Business Class 3-person boundary, other vehicle capacities, selection fallback, request/approval/payment guards and existing-checkout protection");
}
void main().catch(e=>{console.error(e);process.exitCode=1});
