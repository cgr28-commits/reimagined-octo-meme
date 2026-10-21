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
    settings.night.enabled = false; settings.weekend.enabled = false;
    await page.addInitScript(settings => {
      if (!sessionStorage.getItem("matni:preview-pricing-settings")) sessionStorage.setItem("matni:preview-pricing-settings", JSON.stringify(settings));
    }, settings);
    await page.goto("http://127.0.0.1:3000/owner/pricing-preview/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^(Essential only|Reject optional)$/, exact: true }).click();
    assert.equal(await page.locator("[data-add-long-distance-tiers]").count(), 0);
    assert.equal(await page.locator("#night-enabled").isChecked(), false);
    assert.equal(await page.locator("#weekend-enabled").isChecked(), false);
    await page.getByLabel("Night surcharge", { exact: true }).fill("20");
    await page.getByLabel("Weekend surcharge", { exact: true }).fill("30");
    await page.getByRole("button", { name: "Discard Changes", exact: true }).click();
    assert.equal(await page.getByLabel("Night surcharge", { exact: true }).inputValue(), "10");
    await page.getByLabel("Night surcharge", { exact: true }).fill("20");
    await page.getByLabel("Weekend surcharge", { exact: true }).fill("30");
    await page.locator("#night-enabled").check();
    assert.ok(await page.getByRole("button", { name: "Save Changes", exact: true }).isEnabled());
    await page.getByRole("button", { name: "Save Changes", exact: true }).click();
    await page.getByRole("dialog", { name: "Confirm pricing changes" }).getByRole("button", { name: "Save Pricing", exact: true }).click();
    await page.getByRole("dialog", { name: "Confirm pricing changes" }).waitFor({ state: "hidden" });
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("matni:preview-pricing-settings")));
    assert.deepEqual(saved.saloon, settings.saloon);
    assert.equal(saved.night.enabled, true);
    assert.equal(saved.night.surchargeRate, .2);
    assert.equal(saved.weekend.enabled, false);
    assert.equal(saved.weekend.surchargeRate, .3);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("#night-enabled").isChecked(), true);
    assert.equal(await page.locator("#weekend-enabled").isChecked(), false);
    assert.equal(await page.getByLabel("Night surcharge", { exact: true }).inputValue(), "20");
    assert.equal(await page.getByLabel("Weekend surcharge", { exact: true }).inputValue(), "30");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator("#night-enabled").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/long-distance-tiers/${width}-controls.png` });
    await page.getByLabel("Night surcharge", { exact: true }).fill("900");
    assert.equal(await page.getByRole("button", { name: "Save Changes", exact: true }).isDisabled(), true);
    assert.equal(externalWrites, 0);
    console.log(`PASS ${width}px: independent schedule controls, discard, reviewed preview-only save, reload, mileage tariff preserved, invalid fare blocked, no overflow or live writes`);
    await context.close();
  }
} finally { await browser.close(); }
