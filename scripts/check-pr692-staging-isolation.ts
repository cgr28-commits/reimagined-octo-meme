import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {stagingConfig,FORBIDDEN_IDS} from "./pr692-staging-config.mjs";
import {isolatedEnv,verifySandbox,STAGING_NAME,RELEASE_SHA,type StagingEnv} from "../workers/addresses/src/staging-isolation";
import staging from "../workers/addresses/src/staging-entry";
import {trySendEmail,trySendResendOnlyEmail} from "../workers/addresses/src/worker-email";

async function main(){
const origin="https://matni-pr692-staging.vercel.app";
const config=stagingConfig("a".repeat(32),"b".repeat(32),origin);
assert.equal(config.name,STAGING_NAME);assert.deepEqual(config.routes,[]);assert.deepEqual(config.triggers.crons,[]);
assert.equal(config.main,"src/staging-entry.ts");assert.equal(config.durable_objects.bindings.length,4);
assert.ok(config.durable_objects.bindings.every(binding=>!("script_name" in binding)));
assert.ok(!("send_email" in config));assert.ok(!("env" in config));
for(const id of FORBIDDEN_IDS)assert.throws(()=>stagingConfig(id,"b".repeat(32),origin));
assert.throws(()=>stagingConfig("a".repeat(32),"a".repeat(32),origin));
for(const bad of ["https://www.myairporttaxini.co.uk","https://anything.vercel.app",`${origin}/path`,`http://matni-pr692-staging.vercel.app`])assert.throws(()=>stagingConfig("a".repeat(32),"b".repeat(32),bad));
const data=new Map<string,string>();
const store={async get(key:string,type?:string){const v=data.get(key);return v==null?null:type==="json"?JSON.parse(v):v;},async put(key:string,value:string){data.set(key,value);}} as unknown as KVNamespace;
data.set("staging:identity",JSON.stringify({name:STAGING_NAME,releaseSha:RELEASE_SHA}));
const env={STAGING_ENVIRONMENT:STAGING_NAME,STAGING_RELEASE_SHA:RELEASE_SHA,PUBLIC_SITE_ORIGIN:origin,TRACKING_STORE:store,BOOKING_COUNTER:store,
  OWNER_ACCESS_KEY:"fixture-owner",QUOTE_RECEIPT_SECRET:"fixture-signing",GOOGLE_PLACES_API_KEY:"fixture-google",SUMUP_API_KEY:"fixture-sandbox",SUMUP_MERCHANT_CODE:"MTEST",
  RESEND_API_KEY:"must-be-stripped",WEB3FORMS_ACCESS_KEY:"must-be-stripped",GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON:"must-be-stripped",GOOGLE_ADS_REFRESH_TOKEN:"must-be-stripped",BOOKING_TO_EMAIL:"real-recipient@example.com"} as StagingEnv;
const clean=isolatedEnv(env);
for(const field of ["RESEND_API_KEY","WEB3FORMS_ACCESS_KEY","EMAIL","GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON","GOOGLE_ADS_REFRESH_TOKEN"])assert.ok(!(field in clean));
assert.equal(clean.BOOKING_TO_EMAIL,"owner@example.invalid");assert.equal(clean.STAGING_EMAIL_CAPTURE_STORE,store);
assert.throws(()=>isolatedEnv({...env,STAGING_ENVIRONMENT:"reimagined-octo-meme"}));
const native=globalThis.fetch;
let calls=0;
try {
  globalThis.fetch=async()=>{calls++;throw Error("Unexpected external request");};
  for(const send of [trySendEmail,trySendResendOnlyEmail]){
    const result=await send(clean,{to:"customer@example.invalid",subject:"Fixture confirmation",body:"£65",htmlBody:"<p>£65</p>",ownerCopy:true});
    assert.equal(result.provider,"staging-capture");assert.equal(result.sent,true);
  }
  assert.equal(calls,0,"Captured notifications never contact delivery providers");
  const messages=[...data.entries()].filter(([key])=>key.startsWith("staging:email:"));
  assert.equal(messages.length,2,"Capture does not hide duplicate attempts");
  assert.ok(messages.every(([,value])=>JSON.parse(value).delivery==="captured-not-delivered"));
  await assert.rejects(verifySandbox({...env,SUMUP_API_KEY:""}));assert.equal(calls,0);
  for(const profile of [{sandbox:false,merchant_code:"MTEST"},{sandbox:true,merchant_code:"OTHER"},{merchant_code:"MTEST"}]){
    globalThis.fetch=async()=>Response.json(profile);
    await assert.rejects(verifySandbox(env));
    assert.equal((await staging.fetch(new Request("https://staging.invalid/payments",{method:"POST"}),env)).status,503);
  }
  globalThis.fetch=async(input,init)=>{
    const request=new Request(input,init);assert.equal(request.method,"GET");assert.equal(request.url,"https://api.sumup.com/v1/merchants/MTEST");
    assert.equal(request.redirect,"error");return Response.json({sandbox:true,merchant_code:"MTEST"});
  };
  await verifySandbox(env);
  assert.equal((await staging.fetch(new Request("https://staging.invalid/__staging/health"),env)).status,200);
  assert.equal((await staging.fetch(new Request("https://staging.invalid/__staging/health",{headers:{Origin:"https://www.myairporttaxini.co.uk"}}),env)).status,403);
  data.delete("staging:identity");
  assert.equal((await staging.fetch(new Request("https://staging.invalid/__staging/health"),env)).status,503);
} finally{globalThis.fetch=native;}
const workflow=readFileSync(".github/workflows/pr692-isolated-staging.yml","utf8");
assert.ok(workflow.indexOf("Check staging secret slots")<workflow.indexOf("Verify isolated credentials and deploy"));
assert.doesNotMatch(workflow,/secrets\.(?:CLOUDFLARE_API_TOKEN|SUMUP_API_KEY|SUMUP_MERCHANT_CODE|RESEND_API_KEY)\s/);
const missing=spawnSync(process.execPath,["scripts/check-pr692-staging-credentials.mjs"],{env:{PATH:process.env.PATH},encoding:"utf8"});
assert.equal(missing.status,1);assert.match(missing.stderr,/No deployment or payment attempted/);
console.log("PASS staging target/storage isolation, fail-closed sandbox verification, notification capture, origin gates and missing-credential block");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
