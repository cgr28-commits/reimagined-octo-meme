// Focused quote-reveal regression. All external requests are intercepted; no live API writes.
// Run: node --import tsx scripts/check-mobile-result-action-browser.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } = require('../shared/owner-pricing-config.ts');
const { stopTestProcess } = require('./postcode-legacy-harness.cjs');
const settings = defaultOwnerPricingSettings();
settings.executive.requestQuote = true;
settings.minibus = { ...settings.minibus, publicEnabled: true, requestQuote: true };
const config = toPublicOwnerPricingConfig(settings);
config.executive.requestQuote = true; config.minibus = { ...config.minibus, publicEnabled: true, requestQuote: true };
const server = spawn('python3', ['-m', 'http.server', '3094', '--bind', '127.0.0.1', '--directory', 'out'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '', browser;
server.stdout.on('data', b => serverLog += b); server.stderr.on('data', b => serverLog += b);
const errors = [];
async function main() {
 try {
  for (let i = 0; i < 80; i++) { try { const r = await fetch('http://127.0.0.1:3094/?previewJourney=bfs', { signal: AbortSignal.timeout(1500) }); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('https://**/*', async r => {
   const u = r.request().url();
   if (u.includes('/pricing/public')) return r.fulfill({ json: { ok: true, config } });
   if (u.includes('/quote/calculate')) { const q = r.request().postDataJSON(); await new Promise(r => setTimeout(r, 450)); return r.fulfill({ json: { ok: true, amount: 50, journeyFareGbp: 50, airportFixedCostsGbp: 0, nightWeekendSurchargeGbp: 0, vehicleType: q.vehicleType, distanceKm: 25, durationMinutes: 25 } }); }
   if (u.includes('/route/v1/')) return r.fulfill({ json: { code: 'Ok', routes: [{ distance: 25000, duration: 1500, geometry: { coordinates: [] } }] } });
   if (u.includes('workers.dev')) return r.fulfill({ json: { ok: true, available: true, blocked: false, settings: {} } });
   return r.abort();
  });
  await context.addInitScript(settings => {
   localStorage.clear(); // Each case begins with a fresh customer journey.
   localStorage.setItem('matni:preview-pricing-settings', JSON.stringify(settings));
   // Emulate iPhone browser bars reducing the visible viewport without resizing layout.
   window.testBrowserBarHeight = 0;
   if (window.visualViewport) Object.defineProperty(window.visualViewport, 'height', { get: () => innerHeight - window.testBrowserBarHeight });
  }, settings);
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  async function quote(width, height, { bars = 0, lateBars = 0, reduced = false, vehicle = 'Standard Saloon (1–4 passengers)' } = {}) {
   await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
   await page.goto('http://127.0.0.1:3094/?previewJourney=bfs');
   await page.locator('#quote-section-passengers').waitFor();
   await page.waitForTimeout(150);
   const consent = page.getByRole('button', { name: 'Essential only', exact: true }); if (await consent.isVisible()) await consent.click();
   await page.evaluate(({ bars, vehicle }) => { window.testBrowserBarHeight = bars; window.dispatchEvent(new CustomEvent('quote-prefill-draft', { detail: { passengers: 1, suitcases: 1, vehicle, returnJourney: false, tripDate: new Date(Date.now()+10*86400000).toISOString().slice(0,10), tripTime: '12:00' } })); }, { bars, vehicle });
   await page.getByRole('button', { name: 'Get My Fixed Price', exact: false }).click();
   await page.locator('[data-quote-result-card]').waitFor();
   if (lateBars) await page.evaluate(value => setTimeout(() => { window.testBrowserBarHeight = value; }, 650), lateBars);
   await page.waitForTimeout(1900);
   const m = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[data-quote-result-card] #quote-book-now-button')].find(e => e.getClientRects().length);
    const rect = btn.getBoundingClientRect(), heading = document.querySelector('[data-quote-vehicle-options-heading]').getBoundingClientRect();
    const header = document.querySelector('header.fixed, header[class*="fixed"]');
    return { top: rect.top, bottom: rect.bottom, header: header?.getBoundingClientRect().bottom || 0, heading: heading.top, height: visualViewport.height, inset: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--matni-cookie-banner-offset')) || 0, y: scrollY, label: btn.innerText, stacked: new Set([...document.querySelectorAll('[data-vehicle-category]')].map(e => Math.round(e.getBoundingClientRect().left))).size === 1, overflow: document.documentElement.scrollWidth > innerWidth };
   });
   assert.equal(m.overflow, false); assert.ok(m.header > 0, 'Real fixed site header must be mounted');
   if (width < 768) { assert.ok(m.stacked, 'Original stacked vehicle layout must be preserved'); assert.ok(Math.abs(m.heading - m.header - 12) <= 9, 'Mobile must start at the full vehicle list: ' + JSON.stringify(m));  }
   else { assert.ok(Math.abs(m.heading - m.header - 12) <= 9, 'Desktop heading stop changed: ' + JSON.stringify(m)); assert.ok(await page.locator('[data-quote-result-art]').isVisible()); assert.ok(await page.locator('[data-quote-result-capacity]').isVisible()); }
   assert.match(m.label, /BOOK THIS TRANSFER|REQUEST A QUOTE/);
   // Once the initial responses settle, the result must not keep scrolling.
   await page.waitForTimeout(250); assert.ok(Math.abs(await page.evaluate(() => scrollY) - m.y) <= 2);
   fs.mkdirSync(path.join(root, 'test-results/mobile-result'), { recursive: true });
   await page.screenshot({ path: path.join(root, `test-results/mobile-result/${width}-${height}-${bars}-${lateBars}-${reduced}-${vehicle.split(' ')[0]}.png`) });
   if (width < 768) {
    assert.equal(await page.locator('[data-quote-result-art]').isVisible(), false);
    assert.equal(await page.locator('[data-quote-result-capacity]').isVisible(), false);
    for (const name of ['View route', 'Save Quote', 'Start over']) assert.ok(await page.getByRole('button', { name, exact: true }).isVisible());
    assert.ok(await page.getByRole('link', { name: 'Need help? WhatsApp us', exact: true }).isVisible());
    const manual = /Executive|Minibus/.test(vehicle);
    if (manual) assert.equal(await page.getByText('View price breakdown', { exact: true }).count(), 0, 'Unpriced requests must not show a fare breakdown');
    assert.equal(await page.getByRole('button', { name: 'Save Quote', exact: true }).isDisabled(), manual, 'Unpriced requests cannot be saved as confirmed fares');
    await page.getByRole('button', { name: 'View route', exact: true }).click();
    await page.locator('[data-quote-route-map] .leaflet-container').waitFor();
    await page.getByRole('button', { name: 'Hide route', exact: true }).click();
    await page.locator('[data-quote-result-card] #quote-book-now-button').scrollIntoViewIfNeeded();
    // A customer can scroll the unchanged stacked list; account for simulated browser bars.
    await page.evaluate(() => {
     const button = document.querySelector('[data-quote-result-card] #quote-book-now-button');
     const overflow = button.getBoundingClientRect().bottom - visualViewport.height + 24;
     if (overflow > 0) window.scrollBy({ top: overflow, behavior: 'instant' });
    });
    const action = await page.locator('[data-quote-result-card] #quote-book-now-button').boundingBox();
    assert.ok(action.y >= m.header && action.y + action.height <= m.height - m.inset, 'Action accessible on mobile');
    await page.screenshot({ path: path.join(root, `test-results/mobile-result/${width}-${height}-${vehicle.split(' ')[0]}-action.png`) });
   }

   console.log('OK result landing ' + JSON.stringify({ width, height, bars, lateBars, reduced, vehicle, ...m }));
  }
  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932]]) await quote(width, height, { bars: 100 });
  await quote(390, 844, { lateBars: 160 });
  await quote(375, 667, { bars: 100, reduced: true });
  for (const vehicle of ['Estate Car (1–4 passengers)', 'Executive Saloon (1–4 passengers)', 'Minibus (5–7 passengers)']) await quote(390, 844, { bars: 100, vehicle });
  // Switch through instant, pending and manual states without moving either action row.
  for (const width of [320, 375, 390, 430]) {
   await quote(width, 844, { reduced: width === 375 });
   const positions = () => page.evaluate(() => ['[data-quote-result-main-action]', '[data-quote-result-actions]'].map(selector => document.querySelector(selector).getBoundingClientRect().top + scrollY));
   const baseline = await positions();
   for (const id of ['estate', 'executive', 'minibus', 'saloon']) {
    await page.locator(`[data-vehicle-category="${id}"]`).click();
    await page.waitForTimeout(100);
    for (const [i, top] of (await positions()).entries()) assert.ok(Math.abs(top - baseline[i]) <= 2, `${width}px ${id} pending: action ${i} moved ${top - baseline[i]}px`);
    await page.waitForTimeout(600);
    for (const [i, top] of (await positions()).entries()) assert.ok(Math.abs(top - baseline[i]) <= 2, `${width}px ${id} ready: action ${i} moved ${top - baseline[i]}px`);
    const duration = await page.locator('[data-quote-changing-info]').evaluate(el => getComputedStyle(el).animationDuration);
    assert.equal(duration, width === 375 ? '0s' : '0.36s');
   }
   console.log(`OK ${width}px: both action rows stationary through all four vehicles; gentle fade respects Reduce Motion`);
  }
  await quote(1280, 900);
  // The booking control still opens the existing details flow.
  await quote(390, 844); await page.locator('[data-quote-result-card] #quote-book-now-button').click(); await page.getByPlaceholder('John Smith').waitFor();
  assert.deepEqual(errors, []); console.log('OK original stacked options retained, duplicate mobile art/capacity hidden, all result actions retained, desktop unchanged, booking works; no JS exceptions or live API calls');
 } catch (error) {
  console.error(serverLog.slice(-5000));
  throw error;
 } finally {
  if (browser) await browser.close(); await stopTestProcess(server);
  if (process.exitCode) console.error(serverLog.slice(-5000));
 }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
