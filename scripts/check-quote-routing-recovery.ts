import assert from 'node:assert/strict';
import { fetchOsrmTripRouteMetrics } from '../src/lib/trip-route';
import { calculateServerQuote } from '../src/lib/quick-quote-api';
const originalFetch = globalThis.fetch;
const journey={pickupAddress:"citizenM Dublin St. Patrick's, 67-69 Bride St, Dublin, D08 C8CN, Ireland",dropoffAddress:'Europa Hotel, Great Victoria St, Belfast BT2 7AP, UK',passengers:1,suitcases:1,vehicleType:'Standard Saloon (1–4 passengers)',vehicleChoice:'Saloon' as const,returnJourney:false,outboundDate:'',outboundTime:''};
const fare={ok:true,amount:282,journeyFareGbp:282,airportFixedCostsGbp:0,amountLabel:'£282',vehicleType:journey.vehicleType};
async function main(){
 let calls=0;let timedOut=false;
 globalThis.fetch=(async (_url,init)=>{
  calls++;
  assert.ok(init?.signal);
  if(calls===1)return new Promise<Response>((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>{timedOut=true;reject(new DOMException('Timeout','AbortError'))},{once:true}));
  return Response.json({code:'Ok',routes:[{distance:166900,duration:7170}]});
 }) as typeof fetch;
 const routed=await fetchOsrmTripRouteMetrics(53.339,-6.271,54.594,-5.935,{timeoutMs:10});
 assert.equal(timedOut,true);assert.equal(calls,2);assert.equal(routed?.source,'osrm');assert.equal(routed?.distanceKm,166.9);
 // Both providers down must never substitute an estimated fare.
 globalThis.fetch=(async()=>new Response('',{status:503})) as typeof fetch;
 assert.equal(await fetchOsrmTripRouteMetrics(53.339,-6.271,54.594,-5.935,{timeoutMs:10}),null);
 calls=0;const bodies:string[]=[];
 globalThis.fetch=(async (_url,init)=>{calls++;bodies.push(String(init?.body));return calls===1?Response.json({ok:false,reason:'routing_unavailable'},{status:422}):Response.json(fare);}) as typeof fetch;
 const recovered=await calculateServerQuote(journey);assert.equal(recovered.ok,true);assert.equal(calls,2);assert.equal(bodies[0],bodies[1]);
 calls=0;globalThis.fetch=(async()=>{calls++;if(calls===1)throw new TypeError('Network error');return Response.json(fare);}) as typeof fetch;
 assert.equal((await calculateServerQuote(journey)).ok,true);assert.equal(calls,2);
 calls=0;globalThis.fetch=(async()=>{calls++;return Response.json({ok:false,reason:'routing_unavailable'},{status:422});}) as typeof fetch;
 assert.equal((await calculateServerQuote(journey)).ok,false);assert.equal(calls,2);
 calls=0;globalThis.fetch=(async()=>{calls++;return Response.json({ok:false,reason:'personal_quote_required'},{status:409});}) as typeof fetch;
 assert.equal((await calculateServerQuote(journey)).ok,false);assert.equal(calls,1);
 calls=0;globalThis.fetch=(async()=>{calls++;return Response.json({ok:false,reason:'incomplete'},{status:422});}) as typeof fetch;
 assert.equal((await calculateServerQuote(journey)).ok,false);assert.equal(calls,1);
 calls=0;const controller=new AbortController();globalThis.fetch=(async()=>{calls++;controller.abort();throw new DOMException('Cancelled','AbortError');}) as typeof fetch;
 await assert.rejects(calculateServerQuote(journey,undefined,controller.signal),{name:'AbortError'});assert.equal(calls,1);
 console.log('PASS: stalled routing mirror falls back; no estimates; one same-input retry; no retry for request-only/validation/abort');
}
main().finally(()=>{globalThis.fetch=originalFetch;});
