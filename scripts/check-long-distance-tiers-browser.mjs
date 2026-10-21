import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { defaultOwnerPricingSettings } from "../shared/owner-pricing-config.ts";
import { approvedProductionProfitabilitySettings } from "../src/lib/owner-profitability-settings.ts";
await mkdir("test-results/long-distance-tiers", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    let externalWrites = 0;
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
        if (route.request().method() !== "GET") externalWrites++;
        return route.abort();
      }
      return route.continue();
    });
    const settings = { ...defaultOwnerPricingSettings(), profitability: approvedProductionProfitabilitySettings() };
    await page.addInitScript(settings => {
      if (!sessionStorage.getItem("matni:preview-pricing-settings")) sessionStorage.setItem("matni:preview-pricing-settings", JSON.stringify(settings));
    }, settings);
    await page.goto("http://127.0.0.1:3000/owner/pricing-preview/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Reject optional", exact: true }).click();
    const add = page.locator("[data-add-long-distance-tiers]");
    await add.waitFor();
    await add.click();
    for (const miles of [125, 150, 200, 250, 300]) assert.equal(await page.locator(`[data-mileage-tier="${miles}"]`).count(), 1);
    assert.equal(await add.isDisabled(), true);
    await page.getByRole("button", { name: "Discard Changes", exact: true }).click();
    assert.equal(await page.locator('[data-mileage-tier="125"]').count(), 0);
    await add.click();
    await page.locator('[data-mileage-tier="250"] input').last().fill("700");
    assert.ok(await page.getByRole("button", { name: "Save Changes", exact: true }).isEnabled());
    await page.getByRole("button", { name: "Save Changes", exact: true }).click();
    await page.getByRole("dialog", { name: "Confirm pricing changes" }).getByRole("button", { name: "Save Pricing", exact: true }).click();
    await page.getByRole("dialog", { name: "Confirm pricing changes" }).waitFor({ state: "hidden" });
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("matni:preview-pricing-settings")));
    assert.equal(saved.saloon.knots.find(knot => knot.miles === 250).fareGbp, 700);
    assert.deepEqual(saved.saloon.knots.filter(knot => knot.miles <= 100), settings.saloon.knots);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator('[data-mileage-tier="250"] input').last().inputValue(), "700");
    assert.equal(await page.locator('[data-mileage-tier="300"]').count(), 1);
    assert.equal(await add.isDisabled(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('[data-mileage-tier="100"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/long-distance-tiers/${width}-tiers.png` });
    await page.locator('[data-mileage-tier="300"] input').last().fill("900");
    assert.equal(await page.getByRole("button", { name: "Save Changes", exact: true }).isDisabled(), true);
    assert.equal(externalWrites, 0);
    console.log(`PASS ${width}px: add, edit, discard, reviewed preview-only save, reload, existing tiers preserved, invalid fare blocked, no overflow or live writes`);
    await context.close();
  }
} finally { await browser.close(); }
