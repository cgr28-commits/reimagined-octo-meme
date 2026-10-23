import assert from 'node:assert/strict';
import { fetchOwnerQuoteStats } from '../src/lib/booking-jobs-api';
import { createSerializedQuoteLeadMarkerStore, type QuoteLeadDetails } from '../shared/quote-lead';
import { mergeQuoteSessionRecord, QUOTE_SESSION_TTL_SECONDS } from '../shared/quote-session';
import { bookingFunnelKey, isBookingFunnelEvent, summarizeBookingFunnel } from '../shared/booking-funnel';
import { recordBookingFunnelEvent, sendBookingStartedAlert, readBookingFunnel } from '../workers/addresses/src/booking-funnel';
import { QuoteLeadCoordinator } from '../workers/addresses/src/quote-lead-coordinator';
import { handleQuoteStatsRequest } from '../workers/addresses/src/quote-stats';

async function main() {
 const originalApi = process.env.NEXT_PUBLIC_BOOKINGS_API_URL;
 const originalFetch = globalThis.fetch;
 try {
   process.env.NEXT_PUBLIC_BOOKINGS_API_URL = '';
   let calls = 0;
   globalThis.fetch = async () => { calls++; throw new Error('No request expected without configuration'); };
   await assert.rejects(fetchOwnerQuoteStats('mock-owner'), /Bookings API is not configured/);
   assert.equal(calls, 0, 'Missing build-time URL prevents the fixture request entirely');
   process.env.NEXT_PUBLIC_BOOKINGS_API_URL = 'https://booking-funnel.test/bookings';
   globalThis.fetch = async (url, init) => {
     assert.equal(String(url), 'https://booking-funnel.test/quote-stats?day=2026-10-23');
     assert.equal(new Headers(init?.headers).get('X-Driver-Key'), 'mock-owner');
     return Response.json({ ok: true, funnel: { day: '2026-10-23', rows: [] } });
   };
   assert.equal((await fetchOwnerQuoteStats('mock-owner', '2026-10-23')).funnel?.day, '2026-10-23');
 } finally {
   globalThis.fetch = originalFetch;
   if (originalApi === undefined) delete process.env.NEXT_PUBLIC_BOOKINGS_API_URL;
   else process.env.NEXT_PUBLIC_BOOKINGS_API_URL = originalApi;
 }
 const details: QuoteLeadDetails = { quoteTransactionId: 'quote_test123', tripLabel: 'Airport transfer', pickupLabel: 'Belfast City Hall', dropoffLabel: 'Dublin Airport', returnJourney: true, tripDate: '2026-11-01', tripTime: '10:00', returnDate: '2026-11-05', returnTime: '12:00', passengers: 2, suitcases: 2, vehicle: 'Saloon', estimatedPrice: '£255', isAirportTrip: true, customerEmail: 'private@example.test', customerName: 'Private', mobileNumber: '07700900000' };
 const markers = createSerializedQuoteLeadMarkerStore();
 const messages: string[] = [];
 const send = async (subject: string, body: string) => { messages.push(subject+'\n'+body); return true; };
 const results = await Promise.all(Array.from({length:20}, () => sendBookingStartedAlert(details, markers, send)));
 assert.equal(results.filter(Boolean).length, 1);
 assert.equal(messages.length, 1);
 for (const value of ['Belfast City Hall', 'Dublin Airport', 'Saloon', '£255', 'quote_test123', 'Return date & time', '10:00', '12:00', 'not a confirmed booking']) assert.ok(messages[0].includes(value), value);
 for (const value of ['private@example.test', 'Private', '07700900000']) assert.ok(!messages[0].includes(value));
 const retry = createSerializedQuoteLeadMarkerStore();
 assert.equal(await sendBookingStartedAlert(details, retry, async () => false), false);
 await assert.rejects(sendBookingStartedAlert(details, retry, async () => {throw Error('offline');}));
 assert.equal(await sendBookingStartedAlert(details, retry, send), true);
 assert.equal(await sendBookingStartedAlert({...details,quoteTransactionId:'invalid!'}, retry, send), false);
 assert.equal(isBookingFunnelEvent('paid'), false, 'Public input cannot confirm payment');
 const data = new Map<string,string>(); const ttls: number[] = [];
 const kv = { get: async (k:string,type?:string) => {const v=data.get(k);return v ? type === 'json' ? JSON.parse(v) : v : null;}, put: async(k:string,v:string,opts:{expirationTtl:number}) => {data.set(k,v);ttls.push(opts.expirationTtl);}, list: async () => ({keys:[],list_complete:false}) } as never;
 const now=new Date('2026-10-23T12:00:00Z');
 await recordBookingFunnelEvent(kv,'quote_test123','paid',now);
 await recordBookingFunnelEvent(kv,'quote_test123','booking_started',now);
 await recordBookingFunnelEvent(kv,'quote_test123','booking_started',new Date('2026-10-23T12:05:00Z'));
 assert.equal(data.get(bookingFunnelKey('quote_test123','booking_started')),now.toISOString());
 assert.equal(data.get(bookingFunnelKey('quote_test123','paid')),now.toISOString());
 assert.ok(ttls.every(v=>v===QUOTE_SESSION_TTL_SECONDS));
 const quote=mergeQuoteSessionRecord(null,{...details,quoteTransactionId:'quote_test123',estimatedPriceLabel:'£255',now});
 let summary=summarizeBookingFunnel('2026-10-23',[{quote,events:{booking_started:now.toISOString()}}],false,now.getTime()+600001);
 assert.equal(summary.started,1);assert.equal(summary.paid,0);assert.equal(summary.rows[0].possiblyAbandoned,true);
 summary=summarizeBookingFunnel('2026-10-23',[{quote,events:{booking_started:now.toISOString(),paid:now.toISOString()}}]);
 assert.equal(summary.paid,1);assert.equal(summary.rows[0].possiblyAbandoned,false);assert.equal(summary.rows[0].lastStage,'Payment confirmed');
 summary=summarizeBookingFunnel('2026-10-23',[{quote:{...quote,booked:true},events:{}}]);
 assert.equal(summary.paid,0,'Booking requests are not paid bookings');
 // Walk every stage using a fixed clock; a later-arriving earlier stage cannot undo payment.
 const stages = ['booking_started', 'details_opened', 'details_submitted', 'payment_opened', 'paid'] as const;
 const labels = ['Booking started', 'Contact stage opened', 'Details submitted', 'SumUp opened', 'Payment confirmed'];
 const eventTimes: Partial<Record<typeof stages[number], string>> = {};
 for (const [index, stage] of stages.entries()) {
   eventTimes[stage] = now.toISOString();
   const step = summarizeBookingFunnel('2026-10-23', [{quote, events: {...eventTimes}}], false, now.getTime() + 599999);
   assert.equal(step.rows[0].lastStage, labels[index]);
   assert.equal(step.rows[0].possiblyAbandoned, false, 'Active attempts are not abandoned');
   assert.equal(step.started, 1);
   assert.equal(step.detailsOpened, index >= 1 ? 1 : 0);
   assert.equal(step.detailsSubmitted, index >= 2 ? 1 : 0);
   assert.equal(step.paymentOpened, index >= 3 ? 1 : 0);
   assert.equal(step.paid, index === 4 ? 1 : 0);
 }
 eventTimes.booking_started = new Date(now.getTime() + 3600000).toISOString();
 assert.equal(summarizeBookingFunnel('2026-10-23', [{quote, events: eventTimes}]).rows[0].lastStage, 'Payment confirmed');

 assert.equal((await readBookingFunnel(kv,'2026-10-23')).truncated,true);
 assert.equal((await handleQuoteStatsRequest(new Request('https://test/quote-stats'),{},null)).status,401);
 const storage = new Map(); let alarm=0;
 const ctx={blockConcurrencyWhile:async(fn:()=>unknown)=>fn(),storage:{get:async(k:string)=>storage.get(k),put:async(k:string,v:unknown)=>{storage.set(k,v);},setAlarm:async(at:number)=>{alarm=at;},deleteAll:async()=>storage.clear(),delete:async(k:string)=>storage.delete(k)}};
 const coordinator=new QuoteLeadCoordinator(ctx as never);
 for(let i=0;i<60;i++) assert.equal((await (await coordinator.fetch(new Request('https://test/limit'))).json()).allowed,true);
 assert.equal((await (await coordinator.fetch(new Request('https://test/limit'))).json()).allowed,false);
 assert.ok(alarm>Date.now());await coordinator.alarm();
 assert.equal((await (await coordinator.fetch(new Request('https://test/limit'))).json()).allowed,true);
 console.log('PASS immediate alert, parallel dedupe, retry after failed/thrown send, no contact data, independent stages, trusted payment counts, 60-day TTL, owner auth, capped reporting, atomic rate limit');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
