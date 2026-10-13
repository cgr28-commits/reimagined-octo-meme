import assert from 'node:assert/strict';
import {handleOwnerSavedQuotes} from '../workers/addresses/src/owner-saved-quote-handlers';
import {saveSavedQuoteRecord,getSavedQuoteByToken} from '../workers/addresses/src/saved-quote-store';
import type {SavedQuoteRecord} from '../shared/saved-quote';
class Store {
 data=new Map<string,string>();async get(key:string,mode?:string){const s=this.data.get(key);return s==null?null:mode==='json'?JSON.parse(s):s;}async put(key:string,value:string){this.data.set(key,value);}async delete(key:string){this.data.delete(key);}async list({prefix}: {prefix:string}){return {keys:[...this.data.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true};}
}
const store=new Store() as unknown as KVNamespace;
const env={TRACKING_STORE:store,OWNER_ACCESS_KEY:'owner',RESEND_API_KEY:'test',BOOKING_FROM_EMAIL:'bookings@example.com',SITE_ORIGIN:'https://example.com'};
const fixture:SavedQuoteRecord={id:'test',reference:'MAT-TEST',token:'a'.repeat(48),customerName:'Demo Customer',customerEmail:'demo@example.com',status:'expired',createdAt:'2026-01-01T10:00:00Z',expiresAt:'2026-01-08T10:00:00Z',firstReminderSentAt:'old',finalReminderSentAt:'old',journey:{pickupLabel:'Dublin hotel',dropoffLabel:'Amended Belfast address',isAirportTrip:false,tripDate:'',tripTime:'',returnJourney:false,passengers:4,suitcases:4,vehicle:'Estate',tripLabel:'Address to Address'},pricing:{totalAmount:80,amountLabel:'£80.00',currency:'GBP'}};
function req(body?:Record<string,unknown>,key='owner'){return new Request('https://example.com/owner/saved-quotes?search=MAT-TEST',{method:body?'POST':'GET',headers:{'X-Owner-Key':key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
let emailOk=true,sends=0,lastEmail='';const orig=globalThis.fetch;
globalThis.fetch=async(input,init)=>{const url=String(input);if(url.includes('api.resend.com')){sends++;lastEmail=String(init?.body);return Response.json(emailOk?{id:'test'}:{message:'failed'},{status:emailOk?200:500});}throw Error(`Unexpected network ${url}`);};
async function main(){try {
 await saveSavedQuoteRecord(store,fixture);
 assert.equal((await handleOwnerSavedQuotes(req(undefined,'wrong'),env,null)).status,401);
 let result=await handleOwnerSavedQuotes(req(),env,null);assert.equal(result.status,200);assert.equal((await result.json()).quotes[0].status,'expired');
 result=await handleOwnerSavedQuotes(req({token:fixture.token,action:'resend'}),env,null);assert.equal(result.status,409);assert.equal(sends,0);
 const before=Date.now();result=await handleOwnerSavedQuotes(req({token:fixture.token,action:'reopen',validityDays:7}),env,null);assert.equal(result.status,200);assert.equal((await result.json()).emailSent,true);
 const saved=(await getSavedQuoteByToken(store,fixture.token))!;assert.equal(saved.status,'saved');assert.deepEqual(saved.journey,fixture.journey);assert.deepEqual(saved.pricing,fixture.pricing);assert.equal(saved.firstReminderSentAt,undefined);assert.equal(saved.finalReminderSentAt,undefined);assert.equal(saved.originalCreatedAt,fixture.createdAt);assert.ok(new Date(saved.expiresAt).getTime()>=before+7*86400000);assert.match(lastEmail,/Hi Demo/);assert.match(lastEmail,/Amended Belfast address/);assert.match(lastEmail,/MAT-TEST/);
 result=await handleOwnerSavedQuotes(req({token:fixture.token,action:'resend'}),env,null);assert.equal(result.status,200);assert.equal(sends,2);
 await saveSavedQuoteRecord(store,{...fixture,bookedAt:'2026-01-02',status:'booked',paymentReference:'PAID'});result=await handleOwnerSavedQuotes(req({token:fixture.token,action:'reopen'}),env,null);assert.equal(result.status,409);assert.equal(sends,2);
 await saveSavedQuoteRecord(store,fixture);result=await handleOwnerSavedQuotes(req({token:fixture.token,action:'reopen',validityDays:0}),env,null);assert.equal(result.status,400);assert.equal(sends,2);
 emailOk=false;result=await handleOwnerSavedQuotes(req({token:fixture.token,action:'reopen'}),env,null);assert.equal((await result.json()).emailSent,false);assert.ok((await getSavedQuoteByToken(store,fixture.token))?.lastEmailError);
 emailOk=true;result=await handleOwnerSavedQuotes(req({token:fixture.token,action:'resend'}),env,null);assert.equal((await result.json()).emailSent,true);
 console.log('PASS: owner lookup finds retained expired quotes; reopen preserves amended addresses and locked fare; fresh expiry/reminder window; first name and reference email; resend retry; paid, expired-resend, invalid-validity and unauthorised protection. No real emails or payments.');
 }finally{globalThis.fetch=orig;}}
main().catch(e=>{console.error(e);process.exitCode=1;});
