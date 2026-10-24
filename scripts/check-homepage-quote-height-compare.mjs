/** Compare the reviewed inline form with its mobile Safari rendering/spacing fix. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const baselineUrl = process.env.QUOTE_BASELINE_URL;
const updatedUrl = process.env.QUOTE_UPDATED_URL;
if (!baselineUrl || !updatedUrl) throw new Error('Set QUOTE_BASELINE_URL and QUOTE_UPDATED_URL.');
const engine = process.env.PLAYWRIGHT_BROWSER || 'chromium';
const output = `test-results/homepage-layout-compare/${engine}`;
await fs.mkdir(output, { recursive: true });
const browser = await ({ chromium, webkit }[engine]).launch();
const measurements = [];

async function measure(label, url, width) {
  const mobile = width < 768;
  // Synthetic content viewport: browser chrome is outside these 640px.
  // Neither this nor Linux WebKit is a physical iPhone Safari test.
  const context = await browser.newContext({
    viewport: { width, height: mobile ? 640 : 800 },
    isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1,
    reducedMotion: 'reduce', locale: 'en-GB', timezoneId: 'Europe/London',
  });
  const page = await context.newPage();
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin
    ? route.continue() : route.abort());
  await page.goto(url);
  await page.getByRole('button', { name: 'Reject optional', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  const card = page.locator('[data-quote-presentation="homepage"].quote-flow').first();
  // Align the card below the unchanged sticky header, not behind it.
  await card.evaluate(element => {
    const header = document.querySelector('header').getBoundingClientRect();
    window.scrollTo({ top: scrollY + element.getBoundingClientRect().top - header.height - 8, behavior: 'instant' });
  });
  const dimensions = await card.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const button = element.querySelector('[data-get-fixed-price]');
    const b = button.getBoundingClientRect();
    const ids = ['date', 'time', 'quote-section-passengers', 'quote-section-suitcases'];
    return {
      cardHeight: +rect.height.toFixed(2), cardTop: +rect.top.toFixed(2),
      buttonTop: +b.top.toFixed(2), buttonBottom: +b.bottom.toFixed(2),
      buttonHeight: b.height, buttonPosition: getComputedStyle(button).position,
      viewportHeight: innerHeight, viewportWidth: innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      buttonVisibleAfterQuoteScroll: b.top >= document.querySelector('header').getBoundingClientRect().bottom && b.bottom <= innerHeight,
      controls: ids.map(id => {
        const el = document.getElementById(id), r = el.getBoundingClientRect();
        return { id, height:r.height, top:r.top, fontSize:getComputedStyle(el).fontSize };
      }),
    };
  });
  await page.screenshot({ path: `${output}/${label}-${width}.png` });
  if (label === 'after' && mobile) {
    assert.ok(await page.getByText('Select date', {exact:true}).isVisible());
    assert.ok(await page.getByText('Select time', {exact:true}).isVisible());
    // Resizing approximates browser chrome expanding; it does not simulate native Safari UI.
    await page.setViewportSize({width, height:520});
    await page.locator('[data-get-fixed-price]').scrollIntoViewIfNeeded();
    dimensions.shortViewport = await page.locator('[data-get-fixed-price]').evaluate(el => {
      const r=el.getBoundingClientRect();
      return {height:innerHeight, top:r.top, bottom:r.bottom, headerBottom:document.querySelector('header').getBoundingClientRect().bottom};
    });
    // Chromium rounds the scroll offset to whole CSS pixels while DOMRect keeps
    // fractional coordinates (e.g. bottom 520.297 in a 520px viewport).
    const tolerance = 1;
    assert.ok(dimensions.shortViewport.top >= dimensions.shortViewport.headerBottom - tolerance, JSON.stringify(dimensions.shortViewport));
    assert.ok(dimensions.shortViewport.bottom <= dimensions.shortViewport.height + tolerance, JSON.stringify(dimensions.shortViewport));
    await page.screenshot({path:`${output}/after-${width}-short-viewport.png`});
  }
  await context.close();
  return dimensions;
}

try {
  for (const width of [320, 360, 375, 390, 1280]) {
    const before = await measure('before', baselineUrl, width);
    const after = await measure('after', updatedUrl, width);
    const delta = +(after.cardHeight - before.cardHeight).toFixed(2);
    measurements.push({width, before, after, delta});
    console.log(`MEASURE ${engine} ${width}px: ${before.cardHeight}px → ${after.cardHeight}px (${delta}px); CTA visible below header: ${after.buttonVisibleAfterQuoteScroll}`);
    assert.equal(after.horizontalOverflow, false);
    assert.ok(after.controls.every(c => c.height >= 44));
    assert.ok(after.buttonHeight >= 44);
    assert.notEqual(after.buttonPosition, 'fixed');
    assert.equal(Math.round(after.controls[0].top), Math.round(after.controls[1].top));
    if (width < 768) {
      assert.ok(delta < 0, 'mobile card must be shorter');
      assert.ok(after.controls.slice(0,2).every(c => parseFloat(c.fontSize) >= 16));
    } else {
      assert.ok(delta <= 0.5, 'compact desktop card must not grow');
    }
    console.log(`PASS ${engine} ${width}px: native controls, touch targets, spacing and overflow`);
  }
} finally {
  await fs.writeFile(`${output}/measurements.json`, JSON.stringify(measurements, null, 2));
  await browser.close();
}
