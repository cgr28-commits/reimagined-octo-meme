import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";

const outDir = "test-results/dublin-city-transfer-page";
await mkdir(outDir, { recursive: true });

const html = await readFile("out/transfers/belfast-to-dublin-city/index.html", "utf8");
for (const needle of [
  "https://www.myairporttaxini.co.uk/transfers/belfast-to-dublin-city/",
  '"@type":"Service"',
  '"@type":"FAQPage"',
  '"@type":"BreadcrumbList"',
  'id="quote"',
  "dublin-beckett-bridge",
]) assert.ok(html.includes(needle), `Missing ${needle}`);
const sitemap = await readFile("public/sitemap.xml", "utf8");
assert.ok(sitemap.includes("/transfers/belfast-to-dublin-city/"));

const browser = await chromium.launch();
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return route.abort();
      return route.continue();
    });
    await page.goto("http://127.0.0.1:3000/transfers/belfast-to-dublin-city/", { waitUntil: "networkidle" });
    const reject = page.getByRole("button", { name: "Reject optional", exact: true });
    if (await reject.count()) await reject.first().click();
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(await page.locator("h1").innerText(), "Belfast to Dublin City Taxi");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal scroll");
    const images = await page.locator("[data-landing-hero] img").evaluateAll((imgs) => imgs.map((img) => img.complete && img.naturalWidth > 0));
    assert.ok(images.length > 0 && images.every(Boolean), "Hero image must load");
    await page.screenshot({ path: `${outDir}/${width}-top.png` });
    await page.screenshot({ path: `${outDir}/${width}-full.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("Belfast to Dublin city page checks passed.");
