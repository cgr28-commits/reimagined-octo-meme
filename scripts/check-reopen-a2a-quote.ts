import assert from 'node:assert/strict';
import { calculateA2aReturnOffer, type A2aQuoteRequestRecord } from '../shared/a2a-personalised-quote';
import { saveA2aQuoteRequest, getA2aQuoteByReference, getA2aQuoteByToken } from '../workers/addresses/src/a2a-quote-store';
import { handleOwnerApproveA2aQuote, handleOwnerUpdateA2aQuoteJourney, handleOwnerResendA2aPaymentEmail, type A2aQuoteEnv } from '../workers/addresses/src/a2a-quote-handlers';
class MemoryKV {
  data = new Map<string,string>();
  async get(key: string, mode?: string) { const value=this.data.get(key); return value == null ? null : mode==='json' ? JSON.parse(value) : value; }
  async put(key: string,value: string) { this.data.set(key,value); }
  async delete(key: string) { this.data.delete(key); }
}
const store=new MemoryKV() as unknown as KVNamespace;
const env={ TRACKING_STORE:store, OWNER_ACCESS_KEY:'owner-test', SUMUP_API_KEY:'test', SUMUP_MERCHANT_CODE:'test', RESEND_API_KEY:'test', BOOKING_FROM_EMAIL:'bookings@example.com', PUBLIC_SITE_ORIGIN:'https://example.com' } as A2aQuoteEnv;
const request=new Request('https://example.com/owner/a2a-quotes/approve',{headers:{'X-Owner-Key':'owner-test'}});
let oldStatus='PENDING', emailOk=true, retireOk=true, createOk=true;
let created=0, sends=0, deletes=0; const requests: Array<{url:string;method:string;body:any}>=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async (input,init)=>{
 const url=String(input),method=init?.method ?? 'GET',body=init?.body ? JSON.parse(String(init.body)) : null;
 requests.push({url,method,body});
 if(url.includes('api.sumup.com') && method==='GET') return Response.json({id:'old-checkout',status:oldStatus});
 if(url.includes('api.sumup.com') && method==='DELETE') {deletes++;if(retireOk) oldStatus='EXPIRED';return Response.json({}, {status:retireOk?200:409});}
 if(url.includes('api.sumup.com') && method==='POST') {created++;return Response.json({id:`new-${created}`,hosted_checkout_url:`https://checkout.example.com/new-${created}`},{status:createOk?201:502});}
 if(url.includes('api.resend.com')) {sends++;return Response.json(emailOk?{id:`email-${sends}`}:{message:'Email unavailable'},{status:emailOk?200:500});}
 throw new Error(`Unexpected network call ${url}`);
};
function expired(reference: string,extra: Partial<A2aQuoteRequestRecord>={}): A2aQuoteRequestRecord {
 return {reference,paymentToken:`old-token-${reference}`,status:'EXPIRED',createdAt:'2026-01-01T10:00:00Z',updatedAt:'2026-01-01T10:00:00Z',quoteExpiresAt:'2026-01-01T11:00:00Z',expiredAt:'2026-01-01T11:00:00Z',quotedPrice:80,checkoutId:'old-checkout',paymentLinkEmailSentAt:'2026-01-01T10:00:00Z',booking:{customerName:'Demo Customer',customerEmail:'demo@example.com',mobileNumber:'07700900000',pickupLabel:'Dublin hotel',dropoffLabel:'Belfast hotel',tripLabel:'Address to Address',returnJourney:false,tripDate:'2030-12-20',tripTime:'10:00',passengers:4,suitcases:4,vehicle:'Estate',isAirportTrip:false},...extra};
}
async function reject(reference: string,expected: number,extra: Partial<A2aQuoteRequestRecord>) {
 await saveA2aQuoteRequest(store,expired(reference,extra));const before=created;
 const result=await handleOwnerApproveA2aQuote(request,env,{reference,quotedPrice:80,validityMinutes:60});
 assert.ok('error' in result);assert.equal(result.status,expected);assert.equal(created,before);
}
async function main() {
try {
 assert.deepEqual(calculateA2aReturnOffer(80,80,5),{outboundFare:80,returnFare:80,accessCharges:5,discount:8,total:157});
 assert.equal(calculateA2aReturnOffer('',80),null);assert.equal(calculateA2aReturnOffer(4000,4000),null);
 await saveA2aQuoteRequest(store,expired('EDIT'));
 const original=(await getA2aQuoteByReference(store,'EDIT'))!;
 const edit=await handleOwnerUpdateA2aQuoteJourney(request,env,{reference:'EDIT',pickupLabel:'Dublin hotel',dropoffLabel:'Amended Belfast address',tripDate:'2030-12-20',tripTime:'10:00',returnJourney:true,returnDate:'2030-12-24',returnTime:'12:00',passengers:4,suitcases:4});
 assert.ok('ok' in edit);assert.equal(edit.record.status,'EXPIRED');assert.equal(edit.record.dropoffLabel,'Amended Belfast address');
 const badReturn=await handleOwnerUpdateA2aQuoteJourney(request,env,{reference:'EDIT',pickupLabel:'Dublin hotel',dropoffLabel:'Amended Belfast address',tripDate:'2030-12-20',tripTime:'10:00',returnJourney:true,returnDate:'2030-12-19',returnTime:'12:00'});
 assert.ok('error' in badReturn);assert.equal(badReturn.status,400);
 const before=Date.now();
 const reopened=await handleOwnerApproveA2aQuote(request,env,{reference:'EDIT',quotedPrice:152,validityMinutes:30,returnOfferFares:{outbound:80,inbound:80}});
 assert.ok('ok' in reopened);assert.equal(reopened.paymentEmailSent,true);assert.equal(reopened.record.quotedPrice,152);assert.equal(deletes,1);
 const saved=(await getA2aQuoteByReference(store,'EDIT'))!;
 assert.equal(saved.booking.dropoffLabel,'Amended Belfast address');assert.equal(saved.booking.customerName,'Demo Customer');assert.equal(saved.booking.passengers,4);assert.equal(saved.booking.suitcases,4);assert.equal(saved.booking.vehicle,'Estate');
 assert.equal(saved.expiredAt,undefined);assert.ok(saved.reopenedAt);assert.notEqual(saved.paymentToken,original.paymentToken);
 assert.equal(await getA2aQuoteByToken(store,original.paymentToken),null);assert.ok(await getA2aQuoteByToken(store,saved.paymentToken));
 assert.ok(new Date(saved.quoteExpiresAt!).getTime()>=before+30*60000);
 const pendingPost=requests.find(x=>x.method==='POST'&&x.url.includes('api.sumup.com'))!;assert.equal(pendingPost.body.amount,152);
 const email=requests.find(x=>x.url.includes('api.resend.com'))!;assert.match(JSON.stringify(email.body),/Hi Demo/);assert.match(JSON.stringify(email.body),/Amended Belfast address/);assert.match(JSON.stringify(email.body),/5% return booking discount/);assert.match(JSON.stringify(email.body),/152\.00/);
 const resent=await handleOwnerResendA2aPaymentEmail(request,env,{reference:'EDIT'});assert.ok('ok' in resent);assert.equal(resent.record.quotedPrice,152);
 // Reopening the same discounted offer again keeps £152; no repeated 5% deduction.
 await saveA2aQuoteRequest(store,{...saved,status:'EXPIRED',quoteExpiresAt:'2026-01-01T11:00:00Z'});oldStatus='PENDING';
 const again=await handleOwnerApproveA2aQuote(request,env,{reference:'EDIT',quotedPrice:152,validityMinutes:60});assert.ok('ok' in again);assert.equal(again.record.quotedPrice,152);
 await reject('PAID',409,{paymentReference:'paid'});await reject('PAID-AT',409,{paidAt:new Date().toISOString()});await reject('CANCELLED',409,{status:'CANCELLED'});
 oldStatus='PAID';await reject('SUMUP-PAID',409,{});oldStatus='PENDING';
 await reject('PAST',400,{booking:{...expired('X').booking,tripDate:'2020-01-01'}});
 retireOk=false;await reject('RETIRE-FAIL',502,{});retireOk=true;
 emailOk=false;await saveA2aQuoteRequest(store,expired('EMAIL-FAIL'));oldStatus='PENDING';
 const failed=await handleOwnerApproveA2aQuote(request,env,{reference:'EMAIL-FAIL',quotedPrice:80,validityMinutes:60});assert.ok('ok' in failed);assert.equal(failed.paymentEmailSent,false);assert.equal(failed.record.paymentLinkEmailSentAt,null);
 emailOk=true;const retry=await handleOwnerResendA2aPaymentEmail(request,env,{reference:'EMAIL-FAIL'});assert.ok('ok' in retry);
 const unauth=await handleOwnerApproveA2aQuote(new Request('https://example.com'),env,{reference:'EDIT',quotedPrice:152,validityMinutes:60});assert.ok('error' in unauth);assert.equal(unauth.status,401);
 console.log('PASS: expired edit/reopen, amended address/party preservation, new expiry and link, retired checkout, first-name email and 5% breakdown, no discount stacking, resend retry, return chronology, paid/cancelled/past/unauthorised protection. All external calls mocked.');
} finally {globalThis.fetch=originalFetch;}

}
main().catch(error => { console.error(error); process.exitCode=1; });
