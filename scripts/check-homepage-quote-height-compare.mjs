/** Compare the homepage quote card on main and the PR build at compact visible viewports. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const baselineUrl = process.env.QUOTE_BASELINE_URL;
const updatedUrl = process.env.QUOTE_UPDATED_URL;
if (!baselineUrl || !updatedUrl) throw new Error('Set QUOTE_BASELINE_URL and QUOTE_UPDATED_URL.');

const output = 'test-results/homepage-layout-compare';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
const measurements = [];

async function measure(label, url, width) {
  const mobile = width < 768;
  const visibleHeight = mobile ? 640 : 800;
  const context = await browser.newContext({
    viewport: { width, height: visibleHeight },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.route('**/*', (route) => {
    const urlOrigin = new URL(route.request().url()).origin;
    if (urlOrigin === new URL(url).origin) return route.continue();
    return route.abort();
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const card = page.locator('[data-quote-presentation="homepage"].quote-flow').first();
  await card.waitFor({ state: 'visible' });
  const cookieButton = page.getByRole('button', { name: 'Reject optional', exact: true });
  if (await cookieButton.isVisible().catch(() => false)) await cookieButton.click();
  const dimensions = await card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      height: Math.round(rect.height * 100) / 100,
      width: Math.round(rect.width * 100) / 100,
      top: Math.round(rect.top * 100) / 100,
      bottom: Math.round(rect.bottom * 100) / 100,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
  const passenger = page.locator('#quote-section-passengers');
  await passenger.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/${label}-${width}.png`, fullPage: false });
  await context.close();
  return { label, width, syntheticVisibleHeight: visibleHeight, ...dimensions };
}

try {
  for (const width of [320, 360, 375, 390, 1280]) {
    const baseline = await measure('main-before', baselineUrl, width);
    const updated = await measure('popup-after', updatedUrl, width);
    assert.ok(updated.height <= baseline.height + 1,
      `${width}px quote card grew from ${baseline.height}px to ${updated.height}px`);
    assert.ok(updated.documentScrollWidth <= updated.viewportWidth,
      `${width}px updated homepage has horizontal overflow`);
    assert.ok(updated.height <= updated.syntheticVisibleHeight,
      `${width}px quote card exceeds the ${updated.syntheticVisibleHeight}px visible viewport`);
    measurements.push({ width, before: baseline, after: updated,
      cardHeightDeltaPx: Math.round((updated.height - baseline.height) * 100) / 100,
      passed: true });
    console.log(`PASS ${width}px: ${baseline.height}px → ${updated.height}px (${measurements.at(-1).cardHeightDeltaPx >= 0 ? '+' : ''}${measurements.at(-1).cardHeightDeltaPx}px)`);
  }
} finally {
  await fs.writeFile(`${output}/measurements.json`, JSON.stringify(measurements, null, 2));
  await browser.close();
}
