/** Offline failure/recovery checks: never contact production. */
import assert from 'node:assert/strict';
import { withRequestDeadline } from '../src/lib/request-deadline';
import { calculateServerQuote } from '../src/lib/quick-quote-api';
import { fetchPublicPricingConfig } from '../src/lib/owner-pricing-api';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';

const journey = {pickupAddress:'Belfast City Hall, BT1 5GS',dropoffAddress:'Belfast International Airport, BT29 4AB',outboundDate:'2026-10-24',outboundTime:'09:59',returnJourney:false,passengers:1,suitcases:1,vehicleType:'Saloon'};
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
// Exercise production budgets quickly, without introducing production test switches.
globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => originalSetTimeout(fn, ms === 20_000 || ms === 10_000 ? 25 : ms, ...args)) as typeof setTimeout;
const never = () => new Promise<never>(() => {});
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {status});
const fare = {ok:true,amount:55,journeyFareGbp:50,nightWeekendSurchargeGbp:5,airportFixedCostsGbp:0,vehicleType:'Saloon',diagnostics:{distanceKm:26.4,routeDurationMinutes:28}};
let checks=0;
async function test(name: string, run:()=>Promise<void>) {await run(); checks++; console.log('PASS',name);}
async function main() {
 try {
  await test('successful operation and cleared deadline', async()=>{assert.equal(await withRequestDeadline(async()=>42,5),42);});
  await test('stalled fetch aborts and returns failure without inventing a fare', async()=>{
   let calls=0, signal:AbortSignal|undefined;
   globalThis.fetch=(async(_url,init)=>{calls++;signal=init?.signal??undefined;return never();}) as typeof fetch;
   const result=await calculateServerQuote(journey);
   assert.equal(result.ok,false); assert.equal('amount' in result,false); assert.equal('distanceKm' in result,false);
   assert.equal(!result.ok&&result.reason,'timeout'); assert.equal(calls,1); assert.equal(signal?.aborted,true);
  });
  await test('stalled response body also times out',async()=>{
   globalThis.fetch=(async()=>({ok:true,json:never})) as typeof fetch;
   const result=await calculateServerQuote(journey);assert.equal(!result.ok&&result.reason,'timeout');
  });
  await test('one transient routing retry uses unchanged journey',async()=>{
   const bodies:string[]=[];globalThis.fetch=(async(_url,init)=>{bodies.push(String(init?.body));return bodies.length===1?json({reason:'routing_unavailable'},422):json(fare);}) as typeof fetch;
   const result=await calculateServerQuote(journey);assert.equal(result.ok,true);assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);
   assert.equal(result.ok&&result.distanceKm,26.4);
  });
  await test('permanent routing failure returns no amount or route',async()=>{
   let calls=0;globalThis.fetch=(async()=>{calls++;return json({reason:'routing_unavailable',message:'Road route unavailable'},422);}) as typeof fetch;
   const result=await calculateServerQuote(journey);assert.equal(!result.ok&&result.reason,'routing_unavailable');assert.equal(calls,2);assert.equal('amount' in result,false);
  });
  await test('transient network failure retries once',async()=>{
   let calls=0;globalThis.fetch=(async()=>{if(++calls===1)throw Error('network');return json(fare);}) as typeof fetch;
   assert.equal((await calculateServerQuote(journey)).ok,true);assert.equal(calls,2);
  });
  await test('malformed fare response exits with failure',async()=>{
   globalThis.fetch=(async()=>new Response('{bad json')) as typeof fetch;
   assert.equal((await calculateServerQuote(journey)).ok,false);
  });
  await test('superseded request stays an AbortError even if fetch ignores abort',async()=>{
   globalThis.fetch=never as typeof fetch;const c=new AbortController();const pending=calculateServerQuote(journey,undefined,c.signal);c.abort();
   await assert.rejects(pending,{name:'AbortError'});
  });
  await test('already cancelled request does not fetch',async()=>{
   let calls=0;globalThis.fetch=(async()=>{calls++;return json(fare);}) as typeof fetch;const c=new AbortController();c.abort();
   await assert.rejects(calculateServerQuote(journey,undefined,c.signal),{name:'AbortError'});assert.equal(calls,0);
  });
  await test('strict pricing failure never returns default settings',async()=>{
   globalThis.fetch=never as typeof fetch;await assert.rejects(fetchPublicPricingConfig({strict:true}),{name:'TimeoutError'});
   globalThis.fetch=(async()=>json({error:'unavailable'},503)) as typeof fetch;await assert.rejects(fetchPublicPricingConfig({strict:true}));
   globalThis.fetch=(async()=>({ok:true,json:never})) as typeof fetch;await assert.rejects(fetchPublicPricingConfig({strict:true}),{name:'TimeoutError'});
   globalThis.fetch=(async()=>json({config:{}})) as typeof fetch;await assert.rejects(fetchPublicPricingConfig({strict:true}),/Invalid pricing/);
  });
  await test('retry recovers current configured minimum',async()=>{
   const settings=defaultOwnerPricingSettings();settings.bfsMinimumSaloonFareGbp=47.25;
   globalThis.fetch=(async()=>json({config:toPublicOwnerPricingConfig(settings)})) as typeof fetch;
   assert.equal((await fetchPublicPricingConfig({strict:true})).bfsMinimumSaloonFareGbp,47.25);
   globalThis.fetch=(async()=>json(fare)) as typeof fetch;assert.equal((await calculateServerQuote(journey)).ok,true);
  });
  await test('non-quote callers retain their fallback behaviour',async()=>{
   globalThis.fetch=(async()=>{throw Error('offline');}) as typeof fetch;
   assert.deepEqual(await fetchPublicPricingConfig(),toPublicOwnerPricingConfig(defaultOwnerPricingSettings()));
  });
  console.log(`PASS ${checks} request deadline and recovery scenarios`);
 } finally {globalThis.fetch=originalFetch;globalThis.setTimeout=originalSetTimeout;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
