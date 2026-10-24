/** Authorized staging target only. Never invokes the production deployment workflow. */
import './check-pr692-staging-credentials.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {ACCOUNT_ID,STAGING_NAME,RELEASE_SHA,FORBIDDEN_IDS,stagingConfig} from './pr692-staging-config.mjs';
import {defaultOwnerPricingSettings} from '../shared/owner-pricing-config.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workerDir=path.join(root,'workers/addresses');
const token=process.env.PR692_STAGING_CLOUDFLARE_API_TOKEN.trim();
const base=`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`;
async function api(suffix,method='GET',body) {
  const response=await fetch(base+suffix,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(30000)});
  const data=await response.json();
  if(!response.ok||data.success!==true)throw Error(`Staging provisioning failed (${method}, HTTP ${response.status}); response body withheld`);
  return data.result;
}
assert.equal(process.env.GITHUB_REF ?? 'refs/heads/staging/pr692-isolation','refs/heads/staging/pr692-isolation');
stagingConfig('a'.repeat(32),'b'.repeat(32),process.env.PR692_STAGING_FRONTEND_ORIGIN.trim());
const namespaces=await api('/storage/kv/namespaces?per_page=1000'); // Metadata only, no namespace contents.
async function namespace(suffix) {
  const title=`${STAGING_NAME}-${suffix}`;
  const matches=namespaces.filter(item=>item.title===title);
  assert.ok(matches.length<=1,'Ambiguous staging namespace');
  if (matches[0]) {
    assert.ok(!FORBIDDEN_IDS.includes(matches[0].id),'Forbidden storage namespace');
    const existing = await fetch(`${base}/storage/kv/namespaces/${matches[0].id}/values/staging%3Aidentity`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(15000)});
    assert.ok(existing.ok,'Existing namespace has no staging identity; refusing adoption');
    const marker=await existing.json();
    assert.equal(marker.name,STAGING_NAME);assert.equal(marker.releaseSha,RELEASE_SHA);
    return matches[0].id;
  }
  const created=await api('/storage/kv/namespaces','POST',{title});
  const marked=await fetch(`${base}/storage/kv/namespaces/${created.id}/values/staging%3Aidentity`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'text/plain'},body:JSON.stringify({name:STAGING_NAME,releaseSha:RELEASE_SHA}),redirect:'error',signal:AbortSignal.timeout(15000)});
  assert.ok(marked.ok,'Failed to mark new isolated namespace');
  return created.id;
}
const tracking=await namespace('tracking');
const counter=await namespace('counter');
const config=stagingConfig(tracking,counter,process.env.PR692_STAGING_FRONTEND_ORIGIN.trim());
const file=path.join(workerDir,'.pr692-staging.generated.json');
fs.writeFileSync(file,JSON.stringify(config,null,2),{mode:0o600});
const cli=path.join(workerDir,'node_modules/wrangler/bin/wrangler.js');
function wrangler(args,input) {
  const result=spawnSync(process.execPath,[cli,...args,'--config',file],{
    cwd:workerDir,env:{...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:ACCOUNT_ID,WRANGLER_SEND_METRICS:'false'},
    input,encoding:'utf8',stdio:input===undefined?'inherit':['pipe','pipe','pipe'],
  });
  if(result.status!==0)throw Error('Staging-only Wrangler command failed; secret-bearing output withheld');
}
async function putFixtureIfAbsent(key,value) {
  const suffix=`/storage/kv/namespaces/${tracking}/values/${encodeURIComponent(key)}`;
  const existing=await fetch(base+suffix,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(existing.ok)return;
  assert.equal(existing.status,404,'Cannot establish staging fixture state');
  const response=await fetch(base+suffix,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'text/plain'},body:JSON.stringify(value),redirect:'error',signal:AbortSignal.timeout(15000)});
  assert.ok(response.ok,'Could not seed isolated fixture');
}
const pricing=defaultOwnerPricingSettings();
pricing.saloonFormula={enabled:true,startingChargeGbp:10,ratePerMileGbp:2.5,minimumFareGbp:30};
pricing.bfsMinimumSaloonFareGbp=45;pricing.estate.upliftGbp=7;pricing.returnDiscount.rate=0.05;
pricing.terminalAccess={bfsGbp:5,bhdGbp:4};
await putFixtureIfAbsent('staging:identity',{name:STAGING_NAME,releaseSha:RELEASE_SHA});
await putFixtureIfAbsent('owner:pricing-settings',pricing);
await putFixtureIfAbsent('booking:settings',{depositCash:{enabled:true,percent:20,minimumGbp:15}});
try {
  wrangler(['deploy']); // Exact separate config, no inherited production routes/cron/bindings.
  const secrets={};
  for(const name of ['SUMUP_API_KEY','SUMUP_MERCHANT_CODE','GOOGLE_PLACES_API_KEY','OWNER_ACCESS_KEY','QUOTE_RECEIPT_SECRET'])secrets[name]=process.env[`PR692_STAGING_${name}`].trim();
  wrangler(['secret','bulk'],JSON.stringify(secrets));
  const subdomain=(await api('/workers/subdomain')).subdomain;
  const url=`https://${STAGING_NAME}.${subdomain}.workers.dev`;
  const health=await fetch(`${url}/__staging/health`,{redirect:'error',signal:AbortSignal.timeout(20000)});
  assert.equal(health.status,200,'Staging deployment is not ready');
  const status=await health.json();
  assert.equal(status.environment,STAGING_NAME);assert.equal(status.sandboxVerified,true);
  fs.writeFileSync(path.join(root,'staging-deployment-report.json'),JSON.stringify({workerUrl:url,frontendOrigin:config.vars.PUBLIC_SITE_ORIGIN,releaseSha:RELEASE_SHA,trackingNamespace:tracking,counterNamespace:counter,status},null,2));
  console.log(`Staging Worker ready: ${url}. Full sandbox booking verification still required.`);
} finally {fs.rmSync(file,{force:true});}
