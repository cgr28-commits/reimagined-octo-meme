/** Immediate shutdown must not await the advertising-withdrawal service. */
import assert from 'node:assert/strict';
import { memoryStorage } from './measurement-test-helpers';
import { writeCookieConsent, COOKIE_CONSENT_KEY, hasMarketingCookieConsent, flushConsentWithdrawals } from '../src/lib/cookie-consent';
import { consumeConsentQuoteRecovery } from '../src/lib/booking-draft-storage';
import { stopMeasurementAndReload } from '../src/lib/measurement-shutdown';
async function main() {
 const local=memoryStorage(),session=memoryStorage();let reloads=0;
 const policies: Array<{content?:string}> = [];
 Object.assign(globalThis,{window:globalThis,localStorage:local,sessionStorage:session,location:{pathname:'/',href:'https://test.invalid/?checkout_id=TEST',search:'?checkout_id=TEST',hostname:'test.invalid',reload:()=>reloads++,replace:()=>reloads++},dispatchEvent:()=>true,gtag:()=>{throw Error('Old Google function must not run')},dataLayer:[['event','TEST']]});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{cookie:'',createElement:()=>({}),head:{appendChild:(p:object)=>policies.push(p)},querySelectorAll:()=>[]}});
 globalThis.fetch=async()=>new Response('{}',{status:503});
 assert.equal(writeCookieConsent('accepted',true),true);await flushConsentWithdrawals();
 local.setItem('matni-ads-test','optional');local.setItem('operational-booking-draft','TEST-DRAFT');
 assert.equal(writeCookieConsent('rejected',false),true);
 stopMeasurementAndReload();
 assert.equal(reloads,1,'unload starts before failed receipt acknowledgement');
 assert.equal(hasMarketingCookieConsent(),false);
 assert.equal(JSON.parse(local.getItem(COOKIE_CONSENT_KEY)!).advertising,false);
 assert.ok(policies[0].content?.includes("connect-src 'none'"));
 assert.ok(policies[0].content?.includes("script-src 'none'"));
 assert.equal(local.getItem('matni-ads-test'),null);
 assert.equal(local.getItem('operational-booking-draft'),'TEST-DRAFT');
 assert.deepEqual((globalThis as any).dataLayer,[]);
 assert.equal(await flushConsentWithdrawals(),false);
 assert.ok(local.getItem('matni-consent-withdrawals-v1')?.includes('"'));
 stopMeasurementAndReload();assert.equal(reloads,1,'shutdown is idempotent');
 assert.equal(consumeConsentQuoteRecovery(),true,'privacy reload can recover its own current-tab draft');
 assert.equal(consumeConsentQuoteRecovery(),false,'recovery is consumed once');
 session.setItem('matni-consent-quote-recovery-v1',JSON.stringify({path:'/',at:Date.now()-60001}));
 assert.equal(consumeConsentQuoteRecovery(),false,'stale marker cannot restore a later visit');
 session.setItem('matni-consent-quote-recovery-v1',JSON.stringify({path:'/other/',at:Date.now()}));
 assert.equal(consumeConsentQuoteRecovery(),false,'marker does not restore a different route');
 console.log('PASS immediate transport block/unload, failed-receipt retention, operational recovery preservation and idempotency');
}
main().catch(e=>{console.error(e);process.exitCode=1});
