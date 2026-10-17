import assert from 'node:assert/strict';
import {consent,mockKv,mockConsentNamespace} from './measurement-test-helpers';
import {withConsistentConsentLedger} from '../workers/addresses/src/consent-ledger';
import {eligibleAdvertisingConsent,handleMeasurementWithdrawal,withdrawalKey} from '../workers/addresses/src/measurement-consent';
async function main(){
 const raw=mockKv(),namespace=await mockConsentNamespace();
 const store=withConsistentConsentLedger(raw as unknown as KVNamespace,namespace as unknown as DurableObjectNamespace)!;
 const grant=consent();
 await store.put('operational-booking','fictional');assert.equal(await store.get('operational-booking'),'fictional');
 assert.ok(await eligibleAdvertisingConsent(store,grant));
 const withdraw=()=>handleMeasurementWithdrawal(new Request('https://test.invalid/measurement/withdraw',{method:'POST',body:JSON.stringify({ids:[grant.id]})}),store,null);
 assert.equal((await withdraw()).status,200);
 const alarm=namespace.alarms.get(grant.id);assert.ok(alarm!>Date.now()+179*86400000);
 // Simulate a permanently stale negative KV cache in another region.
 raw.m.delete(withdrawalKey(grant.id));
 assert.equal(await eligibleAdvertisingConsent(store,grant),undefined,'strong denial wins over stale KV');
 assert.equal((await withdraw()).status,200);assert.equal(namespace.alarms.get(grant.id),alarm,'retry cannot extend retention');
 await assert.rejects(()=>store.delete(withdrawalKey(grant.id)));
 const missing=withConsistentConsentLedger(raw as unknown as KVNamespace,undefined)!;
 assert.equal(await eligibleAdvertisingConsent(missing,consent()),undefined,'missing ledger cannot grant');
 assert.equal((await handleMeasurementWithdrawal(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({ids:[grant.id]})}),missing,null)).status,503);
 await missing.put('operational-booking','still works');assert.equal(await missing.get('operational-booking'),'still works');
 const unavailable={idFromName:(id:string)=>id,get:()=>({fetch:async()=>new Response('{}',{status:503})})};
 const failed=withConsistentConsentLedger(raw as unknown as KVNamespace,unavailable as unknown as DurableObjectNamespace)!;
 assert.equal(await eligibleAdvertisingConsent(failed,consent()),undefined);
 console.log('PASS strong withdrawal, stale KV, idempotency, retention, failure closure and operational independence');
}
main().catch(e=>{console.error(e);process.exitCode=1});
