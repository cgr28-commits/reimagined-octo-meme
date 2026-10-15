import assert from 'node:assert/strict';
import { approvedQuoteFlightBlockers, approvedQuoteFlightRequirements, completeApprovedQuoteFlights } from '../shared/approved-quote-flights';
import { validateUnpaidBookingRequest } from '../shared/booking-request-validation';
import { publicVehicleRequiresPersonalQuote, defaultOwnerPricingSettings } from '../shared/owner-pricing-config';
import { createA2aQuoteRequest, handleOwnerApproveA2aQuote, publicA2aQuoteSummary } from '../workers/addresses/src/a2a-quote-handlers';
import { getA2aQuoteByReference } from '../workers/addresses/src/a2a-quote-store';
import worker from '../workers/addresses/src/index';
import { getPendingCheckout } from '../workers/addresses/src/pending-checkout-store';
import type { PaidBookingDetails } from '../shared/booking-notifications';

const airports = ['Belfast International Airport (BFS)', 'George Best Belfast City Airport (BHD)', 'Dublin Airport (DUB)'];
const address='Belfast City Hall, Belfast BT1 5GS';
const now=new Date();
const tripDate=new Date(now.getTime()+10*86400000).toISOString().slice(0,10);
const returningDate=new Date(now.getTime()+12*86400000).toISOString().slice(0,10);
function booking(overrides: Partial<PaidBookingDetails>={}): PaidBookingDetails {
 return {customerName:'Test Customer',customerEmail:'test@example.com',mobileNumber:'07700900123',pickupLabel:airports[0],dropoffLabel:address,tripLabel:'Airport pickup',tripDate,tripTime:'12:00',returnDate:returningDate,returnTime:'12:00',returnJourney:false,flightNumber:'',passengers:1,suitcases:1,vehicle:'Executive Saloon (1–4 passengers)',isAirportTrip:true,isFromAirport:true,airportCode:'BFS',termsAcceptedAt:now.toISOString(),...overrides};
}
const settings=defaultOwnerPricingSettings();settings.executive.requestQuote=true;settings.minibus={...settings.minibus,publicEnabled:true,requestQuote:true};
for(const vehicle of ['Executive Saloon (1–4 passengers)','Minibus (5–7 passengers)']) for(const airport of airports) for(const returning of [false,true]) {
 const b=booking({vehicle,pickupLabel:airport,returnJourney:returning});
 assert.equal(validateUnpaidBookingRequest({customerName:b.customerName,message:'Please quote',booking:b as unknown as Record<string,unknown>,publicMinibusEnabled:true,deferFlightNumbers:publicVehicleRequiresPersonalQuote(vehicle,settings),now}).ok,true);
 assert.equal(approvedQuoteFlightRequirements(b).outbound,true);
 assert.ok(approvedQuoteFlightBlockers(b).length>0);
 assert.equal(completeApprovedQuoteFlights(b,{flightNumber:'BA1234'}).ok,true);
 const drop=booking({vehicle,pickupLabel:address,dropoffLabel:airport,isFromAirport:false,returnJourney:returning});
 assert.equal(approvedQuoteFlightRequirements(drop).inbound,returning);
 assert.equal(completeApprovedQuoteFlights(drop,{}).ok,!returning);
 if(returning)assert.equal(completeApprovedQuoteFlights(drop,{returnFlightNumber:'EZY456'}).ok,true);
}
assert.equal(validateUnpaidBookingRequest({customerName:'Test Customer',message:'Book',booking:booking({vehicle:'Standard Saloon (1–4 passengers)'}) as unknown as Record<string,unknown>,publicMinibusEnabled:true,now}).ok,false);
const both=booking({dropoffLabel:airports[2],returnJourney:true});
assert.equal(completeApprovedQuoteFlights(both,{flightNumber:'BA1234'}).ok,false);
const complete=completeApprovedQuoteFlights(both,{flightNumber:'ba 1234',returnFlightNumber:'ezy456',pickupLabel:'tampered',amount:1});
assert.equal(complete.ok,true);if(complete.ok){assert.equal(complete.booking.flightNumber,'BA1234');assert.equal(complete.booking.returnFlightNumber,'EZY456');assert.equal(complete.booking.pickupLabel,both.pickupLabel)}
assert.equal(completeApprovedQuoteFlights(booking(),{flightNumber:'nonsense'}).ok,false);
console.log('OK initial manual requests, instant booking gates, all airports/directions/returns, format and locked-journey checks');

const data=new Map<string,string>();
const store={async get(key:string,mode?:string){const value=data.get(key);return value==null?null:mode==='json'?JSON.parse(value):value},async put(key:string,value:string){data.set(key,value)},async delete(key:string){data.delete(key)},async list(){return {keys:[],list_complete:true}}} as unknown as KVNamespace;
let checkoutCalls=0;
const emails: string[]=[];
const realFetch=globalThis.fetch;
globalThis.fetch=async (input,init)=>{
 const url=String(input);
 if(url.includes('api.resend.com/emails') || url.includes('api.mailchannels.net/')) {
  emails.push(String(init?.body));
  return new Response(JSON.stringify({id:'isolated-test-email'}),{status:200});
 }
 if(url==='https://api.sumup.com/v0.1/checkouts'&&init?.method==='POST'){
  checkoutCalls++;const body=JSON.parse(String(init.body));assert.equal(body.amount,123);
  return new Response(JSON.stringify({id:'test-checkout-'+checkoutCalls,checkout_reference:body.checkout_reference,hosted_checkout_url:'https://checkout.sumup.com/test-checkout-'+checkoutCalls,status:'PENDING',amount:123}),{status:201});
 }
 if(url.startsWith('https://api.sumup.com/v0.1/checkouts/'))return new Response(JSON.stringify({id:url.split('/').pop(),status:'PENDING',amount:123,hosted_checkout_url:'https://checkout.sumup.com/test'}));
 throw new Error('Unexpected external request in isolated test: '+url);
};
async function main(){try{
 const env={TRACKING_STORE:store,OWNER_ACCESS_KEY:'test-owner',SUMUP_API_KEY:'test-sumup',SUMUP_MERCHANT_CODE:'test-merchant',RESEND_API_KEY:'test-resend',PUBLIC_SITE_ORIGIN:'https://www.myairporttaxini.co.uk'};
 const created=await createA2aQuoteRequest({store,booking:booking()});
 const approved=await handleOwnerApproveA2aQuote(new Request('https://worker.example/owner/a2a-quotes/approve',{headers:{'X-Owner-Key':'test-owner'}}),env,{reference:created.reference,quotedPrice:123,validityMinutes:60});
 assert.ok('ok' in approved);if(!('ok'in approved))throw new Error(approved.error);
 assert.equal(checkoutCalls,0,'approval must not create a checkout before required flight details');
 assert.match(approved.payUrl,/\/pay\/a2a-quote\/\?token=/);
 assert.ok(emails.some((message)=>message.includes('/pay/a2a-quote/')));
 const stored=await getA2aQuoteByReference(store,created.reference);assert.ok(stored);
 const summary=publicA2aQuoteSummary(stored!);assert.equal(summary.payable,true);assert.equal(summary.paymentUrl,null);assert.equal(summary.flightNumber,'');
 const pay=async(details?:Record<string,unknown>)=>worker.fetch(new Request('https://worker.example/payments',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://www.myairporttaxini.co.uk'},body:JSON.stringify({a2aQuoteToken:created.paymentToken,amount:1,description:'Approved quote',redirectUrl:'https://www.myairporttaxini.co.uk/booking-confirmed/?payment=return',quoteFlightDetails:details})}),env as never);
 const missing=await pay();assert.equal(missing.status,400,await missing.clone().text());assert.equal(checkoutCalls,0);
 const invalid=await pay({flightNumber:'bad'});assert.equal(invalid.status,400);assert.equal(checkoutCalls,0);
 const valid=await pay({flightNumber:'BA1234'});const payload=await valid.json() as Record<string,unknown>;assert.equal(valid.status,200,JSON.stringify(payload));assert.equal(checkoutCalls,1);
 const pending=await getPendingCheckout(store,String(payload.checkoutId));assert.ok(pending);assert.equal(pending!.amount,123);assert.equal(pending!.booking.flightNumber,'BA1234');assert.equal(pending!.booking.pickupLabel,created.booking.pickupLabel);
 const saved=await getA2aQuoteByReference(store,created.reference);assert.equal(saved!.booking.flightNumber,'BA1234');assert.equal(saved!.quotedPrice,123);
 const reused=await pay({flightNumber:'EZY456'});assert.equal(reused.status,200,await reused.clone().text());assert.equal(checkoutCalls,1);
 assert.equal((await getPendingCheckout(store,String(payload.checkoutId)))!.booking.flightNumber,'EZY456');
 const addressOnly=await createA2aQuoteRequest({store,booking:booking({pickupLabel:address,dropoffLabel:'12 High Street, Belfast BT1 2BG',isAirportTrip:false,isFromAirport:false,airportCode:undefined})});
 const approvedAddress=await handleOwnerApproveA2aQuote(new Request('https://worker.example/owner/a2a-quotes/approve',{headers:{'X-Owner-Key':'test-owner'}}),env,{reference:addressOnly.reference,quotedPrice:123,validityMinutes:60});
 assert.ok('ok' in approvedAddress);if('ok'in approvedAddress)assert.match(approvedAddress.payUrl,/checkout.sumup.com/);
 assert.equal(checkoutCalls,2,'address-only approval retains its existing hosted checkout path');
 console.log('OK approval -> booking-page link -> reject absent/malformed flight -> locked-price checkout -> persisted flight -> reused checkout');
 }finally{globalThis.fetch=realFetch}}
void main().catch(e=>{console.error(e);process.exitCode=1});
