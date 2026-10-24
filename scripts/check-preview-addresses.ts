import assert from "node:assert/strict";
import { handlePreviewAddressRequest } from "../src/lib/preview-address-handler";
import { isPreciseQuotePlace } from "../shared/precise-quote-place";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "preview-route-test-"));
fs.mkdirSync(path.join(temp,"src/lib"),{recursive:true});
fs.copyFileSync("src/lib/preview-address-route.ts",path.join(temp,"src/lib/preview-address-route.ts"));
const prepare = path.resolve("scripts/prepare-preview-address-route.mjs");
const env = {...process.env,VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feat/optional-terminal-access",GITHUB_PAGES:"false"};
execFileSync(process.execPath,[prepare],{cwd:temp,env});
assert.ok(fs.existsSync(path.join(temp,"src/app/api/preview-addresses/route.ts")));
for (const overrides of [{GITHUB_PAGES:"true"},{VERCEL_ENV:"production"}]) {
  execFileSync(process.execPath,[prepare],{cwd:temp,env:{...env,...overrides}});
  assert.equal(fs.existsSync(path.join(temp,"src/app/api/preview-addresses/route.ts")),false);
}
fs.rmSync(temp,{recursive:true});
const originalFetch = globalThis.fetch;
let types = ["city_hall", "local_government_office", "point_of_interest", "establishment"];
let requests = 0;
globalThis.fetch = async (input, init) => {
  assert.match(String(input), /^https:\/\/places.googleapis.com\/v1\/places\//);
  assert.match(new Headers(init?.headers).get("X-Goog-FieldMask") || "", /displayName,types/);
  requests++;
  return Response.json({ id: "ChIJt6AjMVYIYUgR-Ml4fjZw-TE", formattedAddress: "City Hall, Belfast BT1 5GS, UK",
    displayName: { text: "Belfast City Hall" }, types, location: { latitude: 54.5971287, longitude: -5.929932 },
    addressComponents: [{longText:"Belfast",shortText:"Belfast",types:["postal_town"]},
      {longText:"United Kingdom",shortText:"GB",types:["country"]},
      {longText:"BT1 5GS",shortText:"BT1 5GS",types:["postal_code"]}] });
};
const call = (params: string, key: string | undefined = "test-key") =>
  handlePreviewAddressRequest(new Request(`https://preview.example/api/preview-addresses?${params}`), key);
async function main() { try {
  const result = await call("id=ChIJt6AjMVYIYUgR-Ml4fjZw-TE&airport=BFS");
  assert.equal(result.status, 200);
  const place = await result.json();
  assert.equal(place.placeName, "Belfast City Hall");
  assert.equal(isPreciseQuotePlace(place), true);
  assert.equal(isPreciseQuotePlace({...place, types: [], placeName: null}), false, "Old Worker response must not bypass validation");
  types = ["route"];
  assert.equal((await call("id=street-only&airport=BFS")).status, 422);
  assert.equal((await call("q=BT1%205GS&airport=BFS")).status, 200);
  assert.equal((await (await call("q=BT1%205GS&airport=BFS")).json()).needsHouseNumber, true);
  assert.equal((await call("q=city%20hall&airport=INVALID")).status, 400);
  assert.equal((await call("q=city%20hall", "")).status, 503);
  assert.equal((await handlePreviewAddressRequest(new Request("https://preview.example/api/preview-addresses", {method:"POST"}),"test")).status,405);
  assert.equal(requests, 2);
  console.log("PASS preview-only route discovery, City Hall strict place evidence, area rejection, postcode prompt, missing key and method/input validation; no real requests");
} finally { globalThis.fetch = originalFetch; } }
void main().catch(error => { console.error(error); process.exitCode = 1; });
