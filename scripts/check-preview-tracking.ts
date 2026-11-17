/**
 * Google Ads tracking stays off on every preview copy of the site (owner rule, 10 Nov 2026):
 * Vercel previews and the Cloudflare Pages preview links. The live site is never matched.
 * Run: npx tsx scripts/check-preview-tracking.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { previewNotificationsDisabled } from "../src/lib/preview-notifications";
import { previewPaymentsDisabled } from "../src/lib/preview-payments";
import { previewTrackingDisabled } from "../src/lib/preview-tracking";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

console.log("=== 1. Preview links: no Google tag ===");
for (const host of [
  "claude-home-bigger-quote.my-airport-taxi-ni-preview.pages.dev",
  "my-airport-taxi-ni-preview.pages.dev",
  "0a1b2c3d.my-airport-taxi-ni-preview.pages.dev",
  "CLAUDE-HOME-BIGGER-QUOTE.MY-AIRPORT-TAXI-NI-PREVIEW.PAGES.DEV",
  "feature-x.my-airport-taxi-ni-preview.pages.dev:443",
  "matni-dashboard-staging.pages.dev",
  "my-airport-taxi-ni-quote.vercel.app",
  "my-airport-taxi-ni-quote-git-some-branch-colin15.vercel.app",
]) {
  assert.equal(previewTrackingDisabled(host), true, `${host} must not load Google tracking`);
}
console.log("OK  Cloudflare Pages preview links and Vercel previews are tracking-free");

console.log("\n=== 2. Live site and local development: unchanged ===");
for (const host of [
  "www.myairporttaxini.co.uk",
  "myairporttaxini.co.uk",
  "localhost",
  "127.0.0.1",
  "",
  // Look-alikes are not previews.
  "pages.dev.example.com",
  "notpages.dev",
  "pages.dev",
]) {
  assert.equal(previewTrackingDisabled(host), false, `"${host}" keeps normal tracking behaviour`);
}
// Outside a browser (build time, tests) nothing is matched.
assert.equal(previewTrackingDisabled(), false);
console.log("OK  the live domain, localhost and look-alike hosts are not matched");

console.log("\n=== 3. Tracking only: payments and notifications keep their own switches ===");
{
  const host = "claude-home-bigger-quote.my-airport-taxi-ni-preview.pages.dev";
  assert.equal(previewPaymentsDisabled(host), false);
  assert.equal(previewNotificationsDisabled(host), false, "forms on preview links still reach the preview Worker");
  console.log("OK  the Cloudflare preview switch does not touch payments or notifications");
}

console.log("\n=== 4. The Google tag and every conversion go through the switch ===");
{
  const tag = read("src/components/GoogleAdsTag.tsx");
  assert.equal(
    (tag.match(/if \(!config\.tagEnabled \|\| previewTrackingDisabled\(\)\) return;/g) ?? []).length,
    2,
    "tag loader and contact-click tracking both stop on previews",
  );
  assert.match(read("src/lib/google-ads-client.ts"), /typeof window === "undefined" \|\| previewTrackingDisabled\(\)/);
  console.log("OK  GoogleAdsTag and the Ads client both check previewTrackingDisabled()");
}

console.log("\nAll preview tracking checks passed.");
