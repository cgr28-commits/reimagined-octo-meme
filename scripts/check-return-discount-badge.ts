/**
 * Owner, 26 Nov 2026: the "5% off" / "Save 5%" badges on the Return buttons hide while the
 * standard return discount is 0% (Black Friday offer running) and come back when it returns.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from "../shared/owner-pricing-config";
import {
  loadReturnDiscountPercent,
  resetReturnDiscountPercentCache,
  returnDiscountBadgeText,
} from "../src/lib/use-return-discount-percent";

async function feed(rate: number) {
  const settings = defaultOwnerPricingSettings();
  const config = toPublicOwnerPricingConfig({ ...settings, returnDiscount: { rate } });
  (globalThis as { fetch: unknown }).fetch = async () =>
    new Response(JSON.stringify({ ok: true, config }), { status: 200, headers: { "Content-Type": "application/json" } });
  resetReturnDiscountPercentCache();
  return loadReturnDiscountPercent();
}

async function main() {
  assert.equal(returnDiscountBadgeText(null, "off"), null, "hidden until the feed has loaded");
  assert.equal(returnDiscountBadgeText(0, "off"), null, "hidden at 0%");
  assert.equal(returnDiscountBadgeText(5, "off"), "5% off");
  assert.equal(returnDiscountBadgeText(5, "save"), "Save 5%");
  assert.equal(returnDiscountBadgeText(7.5, "off"), "7.5% off", "shows the real rate, not a fixed 5");
  console.log("✓ badge wording and hiding rules");

  assert.equal(await feed(0), 0);
  console.log("✓ feed at 0% (offer running) → badge hidden");
  assert.equal(await feed(0.05), 5);
  console.log("✓ feed at 5% (offer over) → badge shows 5%");

  (globalThis as { fetch: unknown }).fetch = async () => { throw new Error("offline"); };
  resetReturnDiscountPercentCache();
  assert.equal(await loadReturnDiscountPercent(), 5, "feed unreachable → the built-in 5% default, as before");
  console.log("✓ feed unreachable → unchanged behaviour");

  for (const file of ["QuoteCard", "QuoteProgressiveRoute", "HomepageQuoteFields"]) {
    const src = readFileSync(`src/components/${file}.tsx`, "utf8");
    assert.doesNotMatch(src, />(5% off|Save 5%)</, `${file} has no hardcoded return badge left`);
  }
  console.log("✓ no hardcoded return badge left in the three quote components");
  console.log("\nAll return-discount badge checks passed");
}

void main().catch((e) => { console.error(e); process.exit(1); });
