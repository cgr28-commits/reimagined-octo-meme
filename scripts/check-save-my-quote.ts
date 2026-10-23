/** Isolated storage/email integration. Every network request is mocked. */
import assert from 'node:assert/strict';
import { handleCreateSavedQuote, handleGetSavedQuote, buildAuthoritativeSavedQuotePricing, processSavedQuoteReminders } from '../workers/addresses/src/saved-quote-handlers';
import { getBookingSettings, updateSaveQuoteSettings, updateDepositCashSettings } from '../workers/addresses/src/booking-settings-store';
import { DEFAULT_SAVE_QUOTE_SETTINGS, parseSaveQuoteSettings } from '../shared/save-quote-settings';
import { defaultOwnerPricingSettings } from '../shared/owner-pricing-config';
import { SAVED_QUOTE_TTL_SECONDS, normalizeSavedQuoteToken, savedQuoteTokenKey, isSavedQuoteExpired } from '../shared/saved-quote';
import { savedQuoteWhatsAppUrl } from '../src/lib/saved-quote-share';
import { SALOON_VEHICLE, ESTATE_VEHICLE } from '../src/lib/vehicle-selection';
import worker from '../workers/addresses/src/index';

async function main() {
 const data = new Map<string,string>(); const ttls = new Map<string,number>();
 const store = {
  async get(k:string,type?:string) { const v=data.get(k); return v==null?null:type==='json'?JSON.parse(v):v; },
  async put(k:string,v:string,opts?:{expirationTtl?:number}) { data.set(k,v); ttls.set(k,opts?.expirationTtl || 0); },
  async delete(k:string) { data.delete(k); },
  async list() { return {keys:[],list_complete:true}; },
 } as unknown as KVNamespace;
 const origin='https://www.myairporttaxini.co.uk';
 const env={TRACKING_STORE:store, GOOGLE_PLACES_API_KEY:'mock-google',RESEND_API_KEY:'mock-resend', SITE_ORIGIN:origin};
 const pricing=defaultOwnerPricingSettings();
 data.set('owner:pricing-settings',JSON.stringify(pricing));
 const journey={pickupLabel:'Belfast City Hall, Belfast BT1 5GS, UK', dropoffLabel:'Belfast International Airport', pickupPlaceId:'test-city-hall',dropoffPlaceId:'airport-bfs', pickupLat:0,pickupLng:0,dropoffLat:0,dropoffLng:0, airportCode:'BFS',isAirportTrip:true,isFromAirport:false, tripDate:'2026-12-01',tripTime:'12:00',returnJourney:true,returnDate:'2026-12-05',returnTime:'12:00',passengers:2,suitcases:1,vehicle:ESTATE_VEHICLE,tripLabel:'Airport transfer'};
 let sends=0; let mail:Record<string,unknown>={}; let failEmail=false;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async (input,init) => {
  const req=new Request(input,init), u=new URL(req.url);
  if(u.hostname==='places.googleapis.com')return Response.json({id:'test-city-hall',formattedAddress:journey.pickupLabel,location:{latitude:54.5966472,longitude:-5.9300677},addressComponents:[{longText:'United Kingdom',shortText:'GB',types:['country']}]});
  if(u.pathname.includes('/route/v1/driving/')) { assert.ok(!u.pathname.includes('/0,0'),'client coordinates are not trusted'); return Response.json({code:'Ok',routes:[{distance:25830,duration:1506}]}); }
  if(u.hostname==='api.mailchannels.net') return Response.json({message:'mock failure'},{status:500});
  if(u.hostname==='api.resend.com'){sends++;mail=await req.json() as Record<string,unknown>;return failEmail?Response.json({message:'mock failure'},{status:500}):Response.json({id:'mock-email'});}
  throw new Error(`Unexpected network request: ${u.hostname}${u.pathname}`);
 };
 let ip=0;
 const create=(body:unknown,addr=String(++ip))=>handleCreateSavedQuote(new Request(origin+'/saved-quotes',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':addr},body:JSON.stringify(body)}),env,origin);
 try {
  assert.equal(SAVED_QUOTE_TTL_SECONDS,604800);
  assert.deepEqual((await getBookingSettings(store)).saveQuote,DEFAULT_SAVE_QUOTE_SETTINGS);
  assert.throws(()=>parseSaveQuoteSettings({...DEFAULT_SAVE_QUOTE_SETTINGS,validityDays:8}));
  await updateSaveQuoteSettings(store,{...DEFAULT_SAVE_QUOTE_SETTINGS,popupDelaySeconds:30,validityDays:3});
  await updateDepositCashSettings(store,{enabled:true,percent:20,minimumGbp:15});
  assert.equal((await getBookingSettings(store)).saveQuote.popupDelaySeconds,30,'unrelated setting updates preserve Save My Quote');
  await updateSaveQuoteSettings(store,DEFAULT_SAVE_QUOTE_SETTINGS);
  const res=await create({channel:'email',customerEmail:'save@example.invalid',journey,pricing:{totalAmount:1}});
  assert.equal(res.status,200,await res.clone().text());
  const saved=await res.json() as any;
  assert.ok(saved.amount>1); assert.equal(saved.quote.journey.vehicle,ESTATE_VEHICLE);
  assert.equal(saved.emailSent,true);assert.equal(sends,1);
  assert.equal(mail.subject,'Your Airport Transfer Quote — My Airport Taxi NI');
  for(const value of ['7 days','recalculated','Vehicle:','Passengers:','Suitcases:','Airport charges included:','Return saving included:','Return to My Quote']) assert.ok(String(mail.text).includes(value),value);
  assert.equal((Date.parse(saved.expiresAt)-Date.parse(saved.quote.createdAt))/86400000,7);
  assert.ok(ttls.get(savedQuoteTokenKey(saved.token))! <= 604800);
  assert.match(saved.quoteUrl, /\/quote\/#t=[a-f0-9]{48}$/);
  assert.equal(normalizeSavedQuoteToken(saved.token+'!'),'');
  assert.ok(!saved.quoteUrl.includes('save@'));
  assert.ok(![...data.keys()].some(k=>k.includes('save@example.invalid')));
  for(const mobile of [true,false]) {
    const link=new URL(savedQuoteWhatsAppUrl(saved,mobile));
    assert.equal(link.hostname,mobile?'wa.me':'web.whatsapp.com');
    assert.equal(link.searchParams.has('phone'),false,'customer chooses recipient');
    assert.ok(link.searchParams.get('text')?.includes(saved.reference));
  }
  const lookup=await handleGetSavedQuote(new Request(origin+'/saved-quotes/by-token?t='+saved.token),env,origin);
  assert.equal(lookup.status,200);assert.equal(lookup.headers.get('Cache-Control'),'no-store');
  assert.deepEqual((await lookup.json() as any).quote.journey,saved.quote.journey);
  const before=await buildAuthoritativeSavedQuotePricing({journey,googlePlacesApiKey:'mock-google',pricing});assert.ok(before.ok);
  const changed=structuredClone(pricing);changed.estate.upliftGbp+=10;
  const after=await buildAuthoritativeSavedQuotePricing({journey,googlePlacesApiKey:'mock-google',pricing:changed});assert.ok(after.ok);
  assert.ok(after.pricing.totalAmount>before.pricing.totalAmount,'same schedule recalculates changed pricing');
  const saloon=await buildAuthoritativeSavedQuotePricing({journey:{...journey,vehicle:SALOON_VEHICLE},googlePlacesApiKey:'mock-google',pricing});assert.ok(saloon.ok);
  assert.ok(saloon.pricing.totalAmount<before.pricing.totalAmount,'selected Estate retained');
  const inbound={...journey, pickupLabel:journey.dropoffLabel,dropoffLabel:journey.pickupLabel,pickupPlaceId:journey.dropoffPlaceId,dropoffPlaceId:journey.pickupPlaceId,isFromAirport:true,returnJourney:false};
  const pickupFare=await buildAuthoritativeSavedQuotePricing({journey:inbound,googlePlacesApiKey:'mock-google',pricing});assert.ok(pickupFare.ok);
  const meetFare=await buildAuthoritativeSavedQuotePricing({journey:{...inbound,optionalMeetGreetSelected:true},googlePlacesApiKey:'mock-google',pricing});assert.ok(meetFare.ok);
  assert.equal(meetFare.pricing.totalAmount-pickupFare.pricing.totalAmount,pricing.meetGreet.bfsGbp,'saved Meet & Greet uses configured charge exactly once');
  data.set('owner:pricing-settings',JSON.stringify(changed));
  const requote=await worker.fetch(new Request(origin+'/saved-quotes/requote',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({token:saved.token})}),env as never);
  assert.equal(requote.status,200,await requote.clone().text());
  assert.equal((await requote.json() as any).amount,after.pricing.totalAmount);
  assert.equal(JSON.parse(data.get(savedQuoteTokenKey(saved.token))!).pricing.totalAmount,saved.amount,'original snapshot unchanged');
  const whatsapp=await create({channel:'whatsapp',journey});assert.equal(whatsapp.status,200);assert.equal(sends,1,'WhatsApp does not send email');
  assert.equal((await whatsapp.json() as any).quote.customerEmail,'');
  const cron=await processSavedQuoteReminders(env);assert.equal(cron.firstReminders+cron.finalReminders,0);assert.equal(sends,1);
  failEmail=true;
  const failed=await create({channel:'email',customerEmail:'failure@example.invalid',journey});assert.equal(failed.status,200);
  const failure=await failed.json() as any;assert.equal(failure.emailSent,false);assert.ok(failure.quoteUrl);
  failEmail=false;
  for(let i=0;i<3;i++) assert.equal((await create({channel:'email',customerEmail:'limit@example.invalid',journey})).status,200);
  assert.equal((await create({channel:'email',customerEmail:'limit@example.invalid',journey})).status,429,'recipient limit applies across IPs');
  for(let i=0;i<10;i++) assert.equal((await create({channel:'whatsapp',journey},'fixed-ip')).status,200);
  assert.equal((await create({channel:'whatsapp',journey},'fixed-ip')).status,429);
  await updateSaveQuoteSettings(store,{...DEFAULT_SAVE_QUOTE_SETTINGS,whatsappEnabled:false});
  assert.equal((await create({channel:'whatsapp',journey})).status,403);
  await updateSaveQuoteSettings(store,{...DEFAULT_SAVE_QUOTE_SETTINGS,enabled:false});
  assert.equal((await create({channel:'email',customerEmail:'x@example.invalid',journey})).status,403);
  const record=JSON.parse(data.get(savedQuoteTokenKey(saved.token))!);
  assert.equal(isSavedQuoteExpired(record,new Date(record.expiresAt)),true);
  record.expiresAt=new Date(Date.now()-1000).toISOString();data.set(savedQuoteTokenKey(saved.token),JSON.stringify(record));
  const expired=await handleGetSavedQuote(new Request(origin+'/saved-quotes/by-token?t='+saved.token),env,origin);
  assert.equal(expired.status,409);assert.equal((await expired.json() as any).quote,undefined,'expired links reveal no journey');
  const invalid=await handleGetSavedQuote(new Request(origin+'/saved-quotes/by-token?t='+saved.token+'!'),env,origin);assert.equal(invalid.status,404);
  console.log('PASS settings persistence, selected vehicle, return fares, current repricing, mocked email delivery/failure, WhatsApp URLs, private tokens, expiry/retention, no reminders, IP and recipient abuse limits. No live email or payment sent.');
 } finally {globalThis.fetch=originalFetch;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
