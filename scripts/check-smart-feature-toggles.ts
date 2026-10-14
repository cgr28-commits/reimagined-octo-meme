import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React, { createElement } from "react";
import OwnerSmartAvailabilityPanel from "../src/components/OwnerSmartAvailabilityPanel";
import { SMART_OPS_FEATURE_CONTROLS, DEFAULT_SMART_OPS_CONFIG } from "../shared/smart-ops-config";
import { shouldEnforceCustomerSmartAvailability, shouldOfferCustomerAlternativeTimes } from "../shared/customer-smart-availability";
import { defaultSmartOpsState, getSmartOpsState, saveSmartOpsState } from "../workers/addresses/src/smart-ops-store";
import { handleOwnerSaveSmartOps } from "../workers/addresses/src/smart-ops-handlers";
import { buildUnavailableTimeRule } from "../shared/smart-availability";

async function main() {
  // tsx uses the classic JSX transform for the existing Next component sources.
  Object.assign(globalThis, { React });
  const data = new Map<string,string>(); let writes = 0;
  const store = {
    async get(key:string, type?: string) { const value=data.get(key); return value == null ? null : type === "json" ? JSON.parse(value) : value; },
    async put(key:string, value:string) { data.set(key,value); writes++; },
  } as unknown as KVNamespace;
  const initial = defaultSmartOpsState();
  initial.config = structuredClone(DEFAULT_SMART_OPS_CONFIG);
  initial.config.smartReturn.maxDiscountPercent = 27;
  initial.config.buffers.longDistanceBufferMinutes = 60;
  const rule = buildUnavailableTimeRule({id:"preserved-block",repeat:"one_off",date:"2026-10-18",startTime:"09:00",endTime:"10:00"});
  assert.ok(rule); initial.rules=[rule];
  initial.links=[{id:"link-1",parentBookingId:"parent-1",linkedFareGbp:100,linkedMinGbp:80,standaloneMinGbp:120,createdAt:"2026-10-14T00:00:00Z"}];
  await saveSmartOpsState(store,initial);
  const env={OWNER_ACCESS_KEY:"test-owner",DRIVER_ACCESS_KEY:"test-driver",TRACKING_STORE:store};
  const owner=new Request("https://example.invalid/owner/smart-ops",{method:"POST",headers:{"X-Owner-Key":"test-owner"}});
  for(const feature of SMART_OPS_FEATURE_CONTROLS) {
    for(const enabled of [true,false]) {
      const result=await handleOwnerSaveSmartOps(owner,env,{action:"save_config",config:{flags:{[feature.key]:enabled}}});
      assert.ok("state" in result); assert.equal(result.state.config.flags[feature.key],enabled);
      const before=writes;
      const loaded=await getSmartOpsState(store);
      assert.equal(writes,before,"reading must not rewrite owner choices");
      assert.equal(loaded.config.flags[feature.key],enabled);
      assert.deepEqual(loaded.rules,initial.rules);
      assert.deepEqual(loaded.links,initial.links);
      assert.equal(loaded.config.smartReturn.maxDiscountPercent,27);
      assert.equal(loaded.config.buffers.longDistanceBufferMinutes,60);
      if(feature.key === "smartAvailability") {
        assert.equal(shouldEnforceCustomerSmartAvailability({smartAvailabilityFlag:enabled,origin:"https://www.myairporttaxini.co.uk",previewRequested:false}),enabled);
      }
      if(feature.key === "alternativeTimeSuggestions") {
        assert.equal(shouldOfferCustomerAlternativeTimes({alternativeTimeSuggestionsFlag:enabled,origin:"https://www.myairporttaxini.co.uk",previewRequested:false}),enabled);
      }
    }
  }
  const before=writes;
  const denied=await handleOwnerSaveSmartOps(new Request("https://example.invalid/owner/smart-ops",{headers:{"X-Driver-Key":"test-driver"}}),env,{config:{flags:{smartAvailability:true}}});
  assert.ok("status" in denied); assert.equal(denied.status,401); assert.equal(writes,before);
  const reload=await getSmartOpsState(store);
  assert.equal(reload.config.flags.shadowMode,false);
  const markup=renderToStaticMarkup(createElement(OwnerSmartAvailabilityPanel,{ownerKey:"test-owner"}));
  assert.equal((markup.match(/role="switch"/g)||[]).length,6);
  assert.match(markup,/Smart features/);assert.doesNotMatch(markup,/Advanced settings — keep off/);
  assert.match(markup,/Owner testing only/);assert.match(markup,/Not connected yet/);
  assert.match(markup,/Loading smart settings/);
  assert.ok(markup.indexOf("Smart features")<markup.indexOf("Quick controls"));
  console.log("PASS all six ON/OFF save and reload, no read-time reset, partial saves preserve settings/rules/links, driver cannot write, customer gate flags, visible controls and honest readiness labels");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
