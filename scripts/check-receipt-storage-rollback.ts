/** Synthetic storage rehearsal only; not a deployed Worker rollback test. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as currentPending from '../workers/addresses/src/pending-checkout-store';
import * as currentPaid from '../workers/addresses/src/paid-booking-store';
import * as currentReceipt from '../workers/addresses/src/quote-receipt';

async function main() {
  assert.ok(process.env.PR692_BASELINE_ROOT, 'Set PR692_BASELINE_ROOT to the reviewed main checkout');
  const load = (name: string) => import(pathToFileURL(path.join(process.env.PR692_BASELINE_ROOT!, 'workers/addresses/src', `${name}.ts`)).href);
  const oldPending = await load('pending-checkout-store');
  const oldPaid = await load('paid-booking-store');
  const oldReceipt = await load('quote-receipt');
  const memory = new Map<string,string>();
  const kv = {async get(key:string, type?:string) { const value=memory.get(key); return value == null ? null : type === 'json' ? JSON.parse(value) : value; }, async put(key:string,value:string) {memory.set(key,value);}} as unknown as KVNamespace;
  const booking = {customerEmail:'fixture@example.invalid', terminalAccessChoices:{"outbound:BFS:pick-up":"express","return:BFS:drop-off":"free"}, totalFare:65};
  const pending = {checkoutId:'sandbox-fixture',checkoutReference:'fixture-reference',amount:15,totalFare:65,onlineAmountPaid:15,cashBalanceDue:50,paymentMethod:'DEPOSIT_CASH',booking,createdAt:'2026-10-24T12:00:00Z'};
  await currentPending.savePendingCheckout(kv,pending as never);
  assert.deepEqual(await oldPending.getPendingCheckout(kv,pending.checkoutId),pending);
  await oldPending.markPendingCheckoutFinalized(kv,pending.checkoutId,'fixture-paid');
  const restored = await currentPending.getPendingCheckout(kv,pending.checkoutId);
  assert.ok(restored?.finalizedAt);
  assert.deepEqual({...restored, finalizedAt:undefined, paymentReference:undefined},{...pending,finalizedAt:undefined,paymentReference:undefined});
  const paid={paymentReference:'fixture-paid',checkoutId:pending.checkoutId,amount:15,totalFare:65,cashBalanceDue:50,terminalAccessChoices:booking.terminalAccessChoices};
  await currentPaid.savePaidBookingRecord(kv,paid as never);
  const oldRead=await oldPaid.getPaidBookingRecord(kv,'fixture-paid');
  assert.deepEqual(oldRead,paid);
  await oldPaid.savePaidBookingRecord(kv,oldRead);
  assert.deepEqual(await currentPaid.getPaidBookingRecord(kv,'fixture-paid'),paid);
  const claims={pricingVersion:230,pickupPlaceId:'fixture-city',dropoffPlaceId:'fixture-airport',pickupAddress:'City Hall, Belfast',dropoffAddress:'Belfast International Airport',vehicleType:'Standard Saloon (1–4 passengers)',passengers:2,suitcases:1,outboundDate:'2026-12-14',outboundTime:'12:00',returnJourney:false,returnDate:'',returnTime:'',journeyFareGbp:60,airportFixedCostsGbp:0,nightWeekendSurchargeGbp:0,transferAmountGbp:60,distanceKm:25,durationMinutes:30};
  const secret='isolated-compatibility-fixture-only', now=Date.now();
  const oldToken=await oldReceipt.signQuoteReceipt(claims,secret,now);
  const newToken=await currentReceipt.signQuoteReceipt(claims as never,secret,now);
  assert.equal((await oldReceipt.verifyQuoteReceipt(oldToken,secret,now)).ok,true);
  assert.equal((await currentReceipt.verifyQuoteReceipt(newToken,secret,now)).ok,true);
  assert.equal((await oldReceipt.verifyQuoteReceipt(newToken,secret,now)).ok,false);
  assert.equal((await currentReceipt.verifyQuoteReceipt(oldToken,secret,now)).ok,true);
  console.log('PASS synthetic pending/paid record round-trip across old/new storage modules; amounts, access metadata and finalization marker preserved');
  console.log('PASS compatible backend accepts both receipt formats. Pre-compatibility backend rejects v4: retain the compatible backend during frontend rollback. No deployed rollback/provider result is claimed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
