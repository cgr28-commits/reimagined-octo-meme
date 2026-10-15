/** Customer previews read current public modes; explicit owner demos stay isolated. */
import assert from "node:assert/strict";
import { fetchPublicPricingConfig } from "../src/lib/owner-pricing-api";
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from "../shared/owner-pricing-config";

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const stored = new Map<string, string>();
const location = { hostname: "quote-check.vercel.app", pathname: "/", search: "" };
Object.defineProperty(globalThis, "window", { configurable: true, value: {
  location, sessionStorage: { getItem: (key: string) => stored.get(key) ?? null },
} });
let reads = 0;
const live = toPublicOwnerPricingConfig(defaultOwnerPricingSettings());
live.executive.requestQuote = true;
live.minibus = { ...live.minibus, publicEnabled: true, requestQuote: true };
globalThis.fetch = async (_url, init) => {
  assert.ok(!init?.method || init.method === "GET", "Pricing inspection must never write settings");
  reads++;
  return new Response(JSON.stringify({ ok: true, config: live }), { status: 200 });
};

async function main() {
  try {
    for (const hostname of ["quote-check.vercel.app", "localhost", "myairporttaxini.co.uk"]) {
      location.hostname = hostname;
      const config = await fetchPublicPricingConfig();
      assert.equal(config.executive.requestQuote, true);
      assert.equal(config.minibus.requestQuote, true);
      assert.deepEqual(config.estate, live.estate);
    }
    assert.equal(reads, 3);
    location.hostname = "quote-check.vercel.app";
    location.pathname = "/owner/pricing-preview/";
    assert.equal((await fetchPublicPricingConfig()).executive.requestQuote, false);
    assert.equal(reads, 3);
    location.pathname = "/";
    stored.set("matni:preview-pricing-settings", JSON.stringify(defaultOwnerPricingSettings()));
    assert.equal((await fetchPublicPricingConfig()).executive.requestQuote, false);
    assert.equal(reads, 3);
    stored.clear();
    location.search = "?previewMinibus=1";
    assert.equal((await fetchPublicPricingConfig()).minibus.publicEnabled, true);
    assert.equal(reads, 3);
    console.log("OK public quote modes on preview, localhost and production; isolated demos preserved; no pricing writes");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
