import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service.ts";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection.ts";
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
    // getByLabel includes the decorative % in label text; the accessible
    // textbox name correctly excludes that aria-hidden span.
    assert.ok(await page.getByRole("textbox", { name: "Night surcharge", exact: true }).isVisible());
    assert.ok(await page.getByRole("textbox", { name: "Weekend surcharge", exact: true }).isEditable());
    await page.getByRole("textbox", { name: "Night surcharge", exact: true }).fill("20");
    await page.getByRole("textbox", { name: "Weekend surcharge", exact: true }).fill("30");
    await page.getByRole("button", { name: "Discard Changes", exact: true }).click();
    assert.equal(await page.getByRole("textbox", { name: "Night surcharge", exact: true }).inputValue(), "10");
    await page.getByRole("textbox", { name: "Night surcharge", exact: true }).fill("20");
    await page.getByRole("textbox", { name: "Weekend surcharge", exact: true }).fill("30");
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
    assert.equal(await page.getByRole("textbox", { name: "Night surcharge", exact: true }).inputValue(), "20");
    assert.equal(await page.getByRole("textbox", { name: "Weekend surcharge", exact: true }).inputValue(), "30");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator("#night-enabled").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/long-distance-tiers/${width}-controls.png` });
    // Exercise both toggles independently, then restore the original disabled
    // flags. These saves are session-only preview data, never production writes.
    for (const [nightEnabled, weekendEnabled] of [[true, false], [false, true], [true, true], [false, false]]) {
      await page.locator("#night-enabled").setChecked(nightEnabled);
      await page.locator("#weekend-enabled").setChecked(weekendEnabled);
      const save = page.getByRole("button", { name: "Save Changes", exact: true });
      if (await save.isEnabled()) {
        await save.click();
        await page.getByRole("dialog", { name: "Confirm pricing changes" }).getByRole("button", { name: "Save Pricing", exact: true }).click();
        await page.getByRole("dialog", { name: "Confirm pricing changes" }).waitFor({ state: "hidden" });
      }
      await page.reload({ waitUntil: "networkidle" });
      const pricing = await page.evaluate(() => JSON.parse(sessionStorage.getItem("matni:preview-pricing-settings")));
      assert.equal(await page.locator("#night-enabled").isChecked(), nightEnabled);
      assert.equal(await page.locator("#weekend-enabled").isChecked(), weekendEnabled);
      assert.equal(pricing.night.surchargeRate, .2);
      assert.equal(pricing.weekend.surchargeRate, .3);
      for (const [date, time, rate] of [["2026-11-10", "12:00", 0], ["2026-11-10", "23:00", nightEnabled ? .2 : 0], ["2026-11-14", "12:00", weekendEnabled ? .3 : 0]]) {
        const quote = calculateAuthoritativeWebsiteQuote({ pickupAddress: "Belfast City Hall, Belfast", dropoffAddress: "Airport", airportCode: "BFS", fromAirport: false, returnJourney: false, passengers: 2, suitcases: 1, vehicleType: SALOON_VEHICLE, routeMetrics: { distanceKm: 20 / .621371, durationMinutes: 35 }, outboundDate: date, outboundTime: time, pricing });
        assert.ok(quote.ok);
        assert.equal(quote.journeyFareGbp, Math.round(54 * (1 + rate) * 100) / 100);
      }
    }
    await page.getByRole("textbox", { name: "Night surcharge", exact: true }).fill("900");
    assert.equal(await page.getByRole("button", { name: "Save Changes", exact: true }).isDisabled(), true);
    assert.equal(externalWrites, 0);
    console.log(`PASS ${width}px: independent schedule controls, discard, reviewed preview-only save, reload, mileage tariff preserved, invalid fare blocked, no overflow or live writes`);
    await context.close();
  }
} finally { await browser.close(); }
