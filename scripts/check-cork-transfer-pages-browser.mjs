import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { CORK_TRANSFER_PAGES } from "../src/lib/cork-transfer-content.ts";
await mkdir("test-results/cork-transfer-pages", { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [390, 1280]) {
    for (const direction of ["belfast-to-cork", "cork-to-belfast"]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      const errors = [];
      let writes = 0;
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
          if (route.request().method() !== "GET") writes++;
          return route.abort();
        }
        return route.continue();
      });
      await page.goto(`http://127.0.0.1:3000/transfers/${direction}/`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Essential only", exact: true }).click();
      assert.equal(await page.locator("h1").count(), 1);
      assert.equal(await page.locator("h1").innerText(), CORK_TRANSFER_PAGES[direction].title);
      assert.ok((await page.title()).includes(CORK_TRANSFER_PAGES[direction].title));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const images = await page.locator("[data-landing-hero] img").evaluateAll(images => images.map(img => ({ loaded: img.complete && img.naturalWidth > 0, alt: img.alt })));
      assert.ok(images.length > 0 && images.every(img => img.loaded && img.alt.includes("Belfast")));
      if (width === 390) {
        for (const button of await page.getByRole("button", { name: "Get My Fixed Price", exact: false }).all()) {
          if (!await button.isVisible()) continue;
          const price = await button.boundingBox();
          assert.ok(price && price.y > 844, "No disabled quote button may float over landing-page content");
        }
      }
      await page.screenshot({ path: `test-results/cork-transfer-pages/${width}-${direction}-top.png` });
      await page.waitForTimeout(1500);
      await page.locator("[data-landing-quote-cta]").first().click();
      await page.waitForFunction(() => {
        const heading = document.querySelector('#quote [data-site-nav-heading="quote"]');
        const header = document.querySelector('header.fixed');
        if (!heading) return false;
        const top = heading.getBoundingClientRect().top;
        const bottom = header?.getBoundingClientRect().bottom ?? 0;
        return top >= bottom - 8 && top <= bottom + 90;
      }, undefined, { timeout: 10000 });
      const section = await page.locator("#quote").boundingBox();
      const header = await page.locator("header").first().boundingBox();
      const heading = await page.locator('#quote [data-site-nav-heading="quote"]').boundingBox();
      console.log(JSON.stringify({ direction, width, section, header, heading, scrollY: await page.evaluate(() => scrollY), href: page.url() }));
      await page.screenshot({ path: `test-results/cork-transfer-pages/${width}-${direction}-quote.png` });
      assert.ok(heading && heading.y >= (header ? header.y + header.height - 20 : 0), "Quote heading must clear the fixed header");
      assert.ok(heading.y < 844, "Quote heading must be in the viewport");
      assert.ok(await page.locator("#quote").innerText().then(text => text.includes("Select")));
      await page.screenshot({ path: `test-results/cork-transfer-pages/${width}-${direction}-quote.png` });
      const faq = page.locator("details").first();
      await faq.locator("summary").click();
      assert.equal(await faq.getAttribute("open"), "");
      await page.locator("h1").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/cork-transfer-pages/${width}-${direction}-full.png`, fullPage: true });
      const opposite = direction === "belfast-to-cork" ? "cork-to-belfast" : "belfast-to-cork";
      const link = page.locator(`a[href="/transfers/${opposite}/"]`).first();
      await link.click();
      await page.waitForURL(`**/transfers/${opposite}/`);
      assert.equal(await page.locator("h1").innerText(), CORK_TRANSFER_PAGES[opposite].title);
      assert.equal(errors.length, 0, errors.join("\n"));
      assert.equal(writes, 0);
      console.log(`PASS ${width}px ${direction}: hero, layout, quote navigation below header, new Select form, FAQs, reciprocal link, no overflow/errors/live writes`);
      await context.close();
    }
  }
} finally { await browser.close(); }
