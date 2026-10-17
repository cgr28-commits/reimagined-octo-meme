/** Actual local workerd Durable Object storage; no Cloudflare account or network provider. */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../workers/addresses/package.json',import.meta.url));
const {build}=require('esbuild'),{Miniflare}=require('miniflare');
const entry=`import {ConsentLedger,withConsistentConsentLedger} from './workers/addresses/src/consent-ledger';export {ConsentLedger};export default{async fetch(request,env){const s=withConsistentConsentLedger(env.KV,env.CONSENT_LEDGER);if(new URL(request.url).pathname==='/withdraw'){await s.put('measurement:withdrawn:11111111-1111-4111-8111-111111111111','1');return new Response('ok')}return new Response(String(await s.get('measurement:withdrawn:11111111-1111-4111-8111-111111111111')))}}`;
const result=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',write:false,platform:'browser',target:'es2022'});
const mf=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2025-08-01',kvNamespaces:['KV'],durableObjects:{CONSENT_LEDGER:{className:'ConsentLedger',useSQLite:true}}});
try{assert.equal(await(await mf.dispatchFetch('http://test/status')).text(),'null');assert.equal((await mf.dispatchFetch('http://test/withdraw')).status,200);for(let i=0;i<5;i++)assert.equal(await(await mf.dispatchFetch('http://test/status')).text(),'1');console.log('PASS actual workerd + SQLite Durable Object withdrawal and repeated consistent reads');}finally{await mf.dispose()}
