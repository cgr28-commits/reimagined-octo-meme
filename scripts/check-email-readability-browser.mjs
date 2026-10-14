import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const output = 'test-results/email-readability';
const files = (await fs.readdir(output)).filter(file => file.endsWith('.html'));
const logo = await fs.readFile('public/logo.png');
const map = await fs.readFile('public/maps/belfast-international-pick-up-drop-off.jpg');
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme });
    await context.route('**/*', route => route.request().url().endsWith('/logo.png')
      ? route.fulfill({ contentType: 'image/png', body: logo }) : route.request().url().endsWith('/belfast-international-pick-up-drop-off.jpg') ? route.fulfill({contentType:'image/jpeg',body:map}) : route.abort());
    const page = await context.newPage();
    for (const file of files) {
      const html = await fs.readFile(`${output}/${file}`, 'utf8');
      await page.setContent(html);
      if (!html.includes('class="matni-light"')) continue;
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${file}: mobile overflow`);
      const colours = await page.evaluate(() => ({
        background: getComputedStyle(document.body).backgroundColor,
        paragraphs: [...document.querySelectorAll('p, h1, h2, td, div')].filter(node => !node.closest('[data-matni-customer-header]')).map(node => getComputedStyle(node).color),
        cells: [...document.querySelectorAll('td')].filter(node => !node.closest('[data-matni-customer-header]')).map(node => getComputedStyle(node).backgroundColor),
      }));
      assert.equal(colours.background, 'rgb(255, 255, 255)', file);
      assert.ok(colours.paragraphs.every(colour => colour === 'rgb(7, 28, 56)'), `${file}: text must be brand navy`);
      assert.ok(colours.cells.every(colour => colour === 'rgb(255, 255, 255)'), `${file}: cells must stay white`);
      const header = page.locator('[data-matni-customer-header]');
      assert.equal(await header.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(7, 28, 56)', file);
      assert.equal(await page.locator('img[alt="My Airport Taxi NI"]').evaluate(img => Math.round(img.getBoundingClientRect().width)), 124, file);
      assert.equal(await page.locator('img[alt="My Airport Taxi NI"]').count(), 1, file);
      await page.locator('img[alt="My Airport Taxi NI"]').evaluate(img => img.decode());
      assert.equal(await page.locator('img[alt="My Airport Taxi NI"]').evaluate(img => img.naturalWidth), 697, file);
      if (['review-request.html', 'journey-reminder.html', 'driver-details.html'].includes(file)) {
        await page.screenshot({ path: `${output}/${file.replace('.html', '')}-${colorScheme}.png`, fullPage: true });
      }
      // Email clients that remove head CSS still receive explicit readable inline colours.
      await page.locator('head').evaluate(node => node.remove());
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)', file);
      assert.equal(await header.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(7, 28, 56)', file);
    }
    console.log(`PASS ${colorScheme}: white/navy text, mobile layout, logo and inline fallback across all non-paid previews`);
    await context.close();
  }
} finally {
  await browser.close();
}
