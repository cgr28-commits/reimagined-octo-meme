// Focused quote-reveal regression. All external requests are intercepted; no live API writes.
// Run: node --import tsx scripts/check-mobile-result-action-browser.cjs
const { chromium, webkit, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.QUOTE_TEST_BROWSER || 'chromium';
assertEngine();
function assertEngine() { if (!['chromium', 'webkit'].includes(engine)) throw new Error('Unknown quote test browser: ' + engine); }
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
const server = spawn('python3', ['-m', 'http.server', '3094', '--bind', '127.0.0.1', '--directory', process.env.QUOTE_TEST_EXPORT_DIR || 'out'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '', browser, page;
server.stdout.on('data', b => serverLog += b); server.stderr.on('data', b => serverLog += b);
const errors = [];
async function main() {
 try {
  for (let i = 0; i < 80; i++) { try { const r = await fetch('http://127.0.0.1:3094/?previewJourney=bfs', { signal: AbortSignal.timeout(1500) }); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
  browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] }));
  const context = await browser.newContext({ ...(engine === 'webkit' ? devices['iPhone 14 Pro Max'] : {}), serviceWorkers: 'block', hasTouch: true });
  await context.route('**/*', async r => {
   const u = r.request().url();
   if (u.startsWith('http://127.0.0.1:3094/')) return r.continue();
   if (u.includes('/saved-quotes/settings')) return r.fulfill({ json: { ok: true, settings: { enabled: true, popupEnabled: false, popupDelaySeconds: 20, validityDays: 7, emailEnabled: true, whatsappEnabled: true } } });
   if (u.includes('/pricing/public')) return r.fulfill({ json: { ok: true, config } });
   if (u.includes('/quote/calculate')) { const q = r.request().postDataJSON(); await new Promise(r => setTimeout(r, 450)); return r.fulfill({ json: { ok: true, amount: 50, journeyFareGbp: 50, airportFixedCostsGbp: 0, nightWeekendSurchargeGbp: 0, vehicleType: q.vehicleType, distanceKm: 25, durationMinutes: 25 } }); }
   if (u.includes('/route/v1/')) return r.fulfill({ json: { code: 'Ok', routes: [{ distance: 25000, duration: 1500, geometry: { coordinates: [] } }] } });
   if (u.includes('workers.dev')) return r.fulfill({ json: { ok: true, available: true, blocked: false, settings: {} } });
   return r.abort();
  });
  await context.addInitScript(settings => {
   window.testScrollCalls = []; window.testTouchEvents = [];
   const nativeScrollTo = window.scrollTo.bind(window);
   window.scrollTo = (...args) => { window.testScrollCalls.push({ args, at: Math.round(performance.now()) }); return nativeScrollTo(...args); };
   for (const name of ['touchstart', 'touchmove', 'touchend', 'wheel']) window.addEventListener(name, event => {
    window.testTouchEvents.push({ name, target: event.target?.tagName, at: Math.round(performance.now()) });
   }, { passive: true });
   localStorage.clear(); // Each case begins with a fresh customer journey.
   localStorage.setItem('matni:preview-pricing-settings', JSON.stringify(settings));
   // Emulate iPhone browser bars reducing the visible viewport without resizing layout.
   window.testBrowserBarHeight = 0;
   if (window.visualViewport) Object.defineProperty(window.visualViewport, 'height', { get: () => innerHeight - window.testBrowserBarHeight });
  }, settings);
  async function quote(width, height, { bars = 0, lateBars = 0, reduced = false, firstTap = null, vehicle = 'Standard Saloon (1–4 passengers)' } = {}) {
   // Each case is a fresh customer journey. Replacing the previous document
   // immediately after Start New Quote races its newly visible link prefetches
   // in WebKit (run 39670823766). Isolate pages instead of suppressing errors;
   // every page keeps its error listener through close and shares this assertion.
   if (page) await page.close();
   page = await context.newPage();
   page.on('pageerror', e => { errors.push(e.message); console.error('PAGEERROR', e.message); });
   page.on('requestfailed', request => {
    if (request.url().startsWith('http://127.0.0.1:3094/')) console.error('LOCAL REQUEST FAILED', request.url(), request.failure());
   });
   await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
   console.log('BEGIN CASE', JSON.stringify({ engine, width, height, reduced, vehicle, firstTap }));
   await page.goto('http://127.0.0.1:3094/?previewJourney=bfs&previewPax=1&previewBags=1');
   await page.locator('#quote-section-passengers').waitFor();
   await page.evaluate(() => document.fonts.ready);
   await page.waitForFunction(() => document.querySelector('#pickup')?.value && document.querySelector('#dropoff')?.value && document.querySelector('#quote-section-passengers')?.value === '1');
   // The existing banner uses "Reject optional". Await hydration and actually
   // dismiss it before testing quote scrolling; the old selector left it open.
   const consent = page.getByRole('button', { name: 'Reject optional', exact: true });
   await consent.click();
   await page.getByRole('dialog', { name: 'Cookie consent' }).waitFor({ state: 'hidden' });
   await page.evaluate(({ bars, vehicle }) => { window.testBrowserBarHeight = bars; window.dispatchEvent(new CustomEvent('quote-prefill-draft', { detail: { passengers: 1, suitcases: 1, vehicle, returnJourney: false, tripDate: new Date(Date.now()+10*86400000).toISOString().slice(0,10), tripTime: '12:00' } })); }, { bars, vehicle });
   const getPrice = page.getByRole('button', { name: 'Get My Fixed Price', exact: false });
   await getPrice.scrollIntoViewIfNeeded();
   await page.waitForFunction(() => [...document.querySelectorAll('[data-get-fixed-price]')].some(el => !el.disabled));
   const getPriceBox = await getPrice.boundingBox();
   await page.touchscreen.tap(getPriceBox.x + getPriceBox.width / 2, getPriceBox.y + getPriceBox.height / 2);
   await page.locator('[data-quote-result-card]').waitFor();
   if (lateBars) await page.evaluate(value => setTimeout(() => { window.testBrowserBarHeight = value; }, 650), lateBars);
   await page.waitForTimeout(1900);
   // Wait for the actual reveal rather than assuming WebKit's rendering/effects
   // finish on Chromium's timing. This does not scroll or alter the page.
   await page.waitForFunction(() => {
    // Main and candidate both reveal the selected card on mobile (baseline
    // investigation 39661970175); Vehicle options is the desktop target.
    const heading = document.querySelector(innerWidth < 768 ? '[data-quote-selected-vehicle-card]' : '[data-quote-vehicle-options-heading]');
    const header = document.querySelector('header.fixed, header[class*="fixed"]');
    return heading && header && document.documentElement.style.scrollBehavior !== 'auto' && Math.abs(heading.getBoundingClientRect().top - header.getBoundingClientRect().bottom - 12) <= 9;
   }, null, { timeout: 10000 });
   const m = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[data-quote-result-card] #quote-book-now-button')].find(e => e.getClientRects().length);
    const rect = btn.getBoundingClientRect(), heading = document.querySelector(innerWidth < 768 ? '[data-quote-selected-vehicle-card]' : '[data-quote-vehicle-options-heading]').getBoundingClientRect();
    const header = document.querySelector('header.fixed, header[class*="fixed"]');
    return { top: rect.top, bottom: rect.bottom, header: header?.getBoundingClientRect().bottom || 0, heading: heading.top, height: visualViewport.height, inset: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--matni-cookie-banner-offset')) || 0, y: scrollY, label: btn.innerText, stacked: new Set([...document.querySelectorAll('[data-vehicle-category]')].map(e => Math.round(e.getBoundingClientRect().left))).size === 1, overflow: document.documentElement.scrollWidth > innerWidth };
   });
   assert.equal(m.overflow, false); assert.ok(m.header > 0, 'Real fixed site header must be mounted');
   if (width < 768) { assert.ok(m.stacked, 'Original stacked vehicle layout must be preserved'); assert.ok(Math.abs(m.heading - m.header - 12) <= 9, 'Mobile must reveal the selected vehicle card: ' + JSON.stringify(m));  }
   else { assert.ok(Math.abs(m.heading - m.header - 12) <= 9, 'Desktop heading stop changed: ' + JSON.stringify(m)); assert.ok(await page.locator('[data-quote-result-art]').isVisible()); assert.equal(await page.locator('[data-quote-result-capacity]').isVisible(), width < 1024, 'Existing desktop layout suppresses the duplicate capacity line'); }
   assert.match(m.label, /BOOK THIS TRANSFER|REQUEST QUOTE/);
   // Once the initial responses settle, the result must not keep scrolling.
   await page.waitForTimeout(250); assert.ok(Math.abs(await page.evaluate(() => scrollY) - m.y) <= 2);
   fs.mkdirSync(path.join(root, 'test-results/mobile-result'), { recursive: true });
   await page.screenshot({ path: path.join(root, `test-results/mobile-result/${engine}-${width}-${height}-${bars}-${lateBars}-${reduced}-${vehicle.split(' ')[0]}.png`) });
   if (width < 768) {
    // Both main and candidate show the selected vehicle image (paired run
    // 39662818694). Keep that established design under regression coverage.
    assert.equal(await page.locator('[data-quote-result-art]').isVisible(), true);
    assert.equal(await page.locator('[data-quote-result-capacity]').isVisible(), false);
    for (const name of ['View route', 'Email my quote', 'Start over']) assert.ok(await page.getByRole('button', { name, exact: true }).isVisible());
    assert.ok(await page.getByRole('button', { name: 'Need help? WhatsApp us', exact: true }).isVisible());
    const manual = /Executive|Minibus/.test(vehicle);
    if (manual) assert.equal(await page.getByText('View price breakdown', { exact: true }).count(), 0, 'Unpriced requests must not show a fare breakdown');
    assert.equal(await page.locator('[data-quote-save]').isDisabled(), manual, 'Unpriced requests cannot be saved as confirmed fares');
    const popups = [
     ['View route', 'dialog', 'View route'],
     ...(!manual ? [['Email my quote', 'dialog', 'Save My Quote']] : []),
     ['Start over', 'alertdialog', 'Need a quote for a different journey?'],
     ['Need help? WhatsApp us', 'dialog', 'WhatsApp'],
    ];
    for (const [buttonName, role, title] of popups.filter(([name]) => !firstTap || name === firstTap)) {
     const control = page.getByRole('button', { name: buttonName, exact: true });
     // A fresh journey for each first-tap case: do not use locator.click(),
     // scrollIntoViewIfNeeded(), wheel or swipe before this coordinate tap.
     if (!firstTap) await control.scrollIntoViewIfNeeded();
     else {
      assert.ok(Math.abs(await page.evaluate(() => scrollY) - m.y) <= 2, 'No helper scroll before the first tap');
      const hit = await control.evaluate(el => {
       const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
       const top = document.elementFromPoint(x, y);
       const surface = el.closest('.glass-card');
       const css = getComputedStyle(surface);
       return { x, y, bottom: r.bottom, height: visualViewport.height,
        target: el === top || el.contains(top), blocker: top?.outerHTML.slice(0, 250),
        blur: css.backdropFilter || css.webkitBackdropFilter || 'none' };
      });
      assert.ok(hit.y > m.header && hit.bottom <= hit.height, 'First-tap target must actually be visible at the automatic landing: ' + JSON.stringify(hit));
      assert.equal(hit.target, true, 'First tap is intercepted: ' + JSON.stringify(hit));
      assert.equal(hit.blur, 'none', 'Mobile result controls must not inherit a filtered scrolling layer');
     }
     const before = await page.evaluate(() => ({ y: scrollY, fare: document.querySelector('[data-quote-result-card]').textContent,
      actionTop: document.querySelector('[data-quote-result-actions]').getBoundingClientRect().top }));
     const box = await control.boundingBox();
     await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
     const dialog = page.getByRole(role, { name: title, exact: true });
     await dialog.waitFor();
     assert.ok(await dialog.evaluate(el => el.parentElement === document.body), 'Popup must escape the filtered quote card');
     const panel = await dialog.locator('.quote-flow').boundingBox();
     assert.ok(panel.y >= 0 && panel.y + panel.height <= height + 1, 'Popup must stay in the current viewport');
     assert.ok(Math.abs(await page.locator('[data-quote-result-actions]').evaluate(el => el.getBoundingClientRect().top) - before.actionTop) <= 2, 'Opening a popup must not move the buttons behind it');
     if (buttonName === 'View route') await dialog.locator('.leaflet-container').waitFor();
     if (buttonName === 'Email my quote') await dialog.getByRole('textbox', { name: 'Email address', exact: true }).fill('preview@example.com');
     if (buttonName === 'Need help? WhatsApp us') assert.match(await dialog.getByRole('link', { name: 'Need help? WhatsApp us', exact: true }).getAttribute('href'), /wa\.me\//);
     await page.screenshot({ path: path.join(root, `test-results/mobile-result/${engine}-${width}-${height}-${vehicle.split(' ')[0]}-${buttonName.split(' ')[0]}-popup.png`) });
     await dialog.getByRole('button', { name: 'Close', exact: true }).click();
     await page.waitForTimeout(80);
     assert.equal(await dialog.count(), 0);
     assert.ok(Math.abs(await page.evaluate(() => scrollY) - before.y) <= 2, 'Closing must restore the same scroll position');
     assert.equal(await page.locator('[data-quote-result-card]').textContent(), before.fare, 'Closing must preserve the current quote');
    }
    await page.locator('[data-quote-result-card] #quote-book-now-button').scrollIntoViewIfNeeded();
    // A customer can scroll the unchanged stacked list; account for simulated browser bars.
    await page.evaluate(() => {
     const button = document.querySelector('[data-quote-result-card] #quote-book-now-button');
     const rect = button.getBoundingClientRect();
     const header = document.querySelector('header.fixed, header[class*="fixed"]')?.getBoundingClientRect().bottom || 0;
     const overflow = rect.bottom - visualViewport.height + 24;
     const coveredTop = rect.top - header - 12;
     if (coveredTop < 0) window.scrollBy({ top: coveredTop, behavior: 'instant' });
     else if (overflow > 0) window.scrollBy({ top: overflow, behavior: 'instant' });
    });
    const action = await page.locator('[data-quote-result-card] #quote-book-now-button').boundingBox();
    assert.ok(action.y >= m.header && action.y + action.height <= m.height - m.inset, 'Action accessible on mobile: ' + JSON.stringify({ width, height, action, header: m.header, visibleHeight: m.height }));
    await page.screenshot({ path: path.join(root, `test-results/mobile-result/${engine}-${width}-${height}-${vehicle.split(' ')[0]}-action.png`) });
   }

   console.log('OK ' + engine + (firstTap ? ' first tap without manual scrolling: ' + firstTap + ' ' : ' result landing ')  + JSON.stringify({ width, height, bars, lateBars, reduced, vehicle, ...m }));
  }
  // Each action must work as the FIRST touch after the automatic reveal.
  // Larger iPhone viewport fits the unchanged stacked list and action row.
  for (const firstTap of ['View route', 'Email my quote', 'Start over', 'Need help? WhatsApp us']) {
   await quote(430, 932, { firstTap });
  }
  for (const [width, height] of [[320, 568], [360, 740], [375, 667], [390, 844], [430, 932]]) await quote(width, height, { bars: 100 });
  await quote(390, 844, { lateBars: 160 });
  await quote(375, 667, { bars: 100, reduced: true });
  for (const vehicle of ['Estate Car (1–4 passengers)', 'Executive Saloon (1–4 passengers)', 'Minibus (5–7 passengers)']) await quote(390, 844, { bars: 100, vehicle });
  // Main deliberately gives Estate 10px image margin and other vehicles -2px.
  // Different vehicle copy/manual states also have natural heights. Compare the
  // known Estate spacing, then require settled rows and usable controls instead
  // of imposing zero movement across different content (main/PR run 39664182450).
  for (const width of [320, 360, 375, 390, 430]) {
   await quote(width, 844, { reduced: width === 375 });
   const positions = () => page.evaluate(() => ['[data-quote-result-main-action]', '[data-quote-result-actions]'].map(selector => document.querySelector(selector).getBoundingClientRect().top + scrollY));
   const spacing = () => page.evaluate(() => ({
    margin: parseFloat(getComputedStyle(document.querySelector('[data-quote-result-art]')).marginBottom),
    detail: document.querySelector('[data-quote-result-detail-slot]').getBoundingClientRect().height,
    heading: document.querySelector('[data-quote-result-heading]').getBoundingClientRect().height,
   }));
   const baseline = await positions(), saloonSpacing = await spacing();
   for (const id of ['estate', 'executive', 'minibus', 'saloon']) {
    await page.locator(`[data-vehicle-category="${id}"]`).click();
    await page.waitForTimeout(100);
    const pending = await positions();
    await page.waitForTimeout(900); // 450ms quote fixture and existing 700ms fade.
    const settled = await positions(), currentSpacing = await spacing();
    if (id === 'estate') {
     assert.equal(saloonSpacing.margin, -2); assert.equal(currentSpacing.margin, 10);
     const expected = currentSpacing.margin - saloonSpacing.margin + currentSpacing.detail - saloonSpacing.detail + currentSpacing.heading - saloonSpacing.heading;
     for (const [i, top] of settled.entries()) assert.ok(Math.abs(top - baseline[i] - expected) <= 2, `${width}px Estate action ${i}: unexplained movement ${top-baseline[i]}px, expected spacing ${expected}px`);
    }
    await page.waitForTimeout(250);
    for (const [i, top] of (await positions()).entries()) assert.ok(Math.abs(top - settled[i]) <= 2, `${width}px ${id}: settled action ${i} keeps moving`);
    const duration = await page.locator('[data-quote-changing-info]').evaluate(el => getComputedStyle(el).animationDuration);
    if (width === 375) assert.equal(await page.locator('[data-quote-changing-info]').evaluate(el => getComputedStyle(el).animationName), 'none');
    else assert.equal(duration, '0.7s', 'Preserve the existing main-branch information fade');
    const button = page.locator('[data-quote-result-card] #quote-book-now-button');
    await button.scrollIntoViewIfNeeded();
    await button.focus();
    const hit = await button.evaluate(el => {
     const r=el.getBoundingClientRect(), target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
     return {top:r.top,bottom:r.bottom,height:innerHeight,header:document.querySelector('header').getBoundingClientRect().bottom,unobstructed:el===target||el.contains(target),focused:el===document.activeElement,disabled:el.disabled,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.ok(hit.top >= hit.header && hit.bottom <= hit.height && hit.unobstructed && hit.focused && !hit.disabled && !hit.overflow, 'Selected vehicle booking control accessible: '+JSON.stringify(hit));
    console.log('VEHICLE '+JSON.stringify({engine,width,id,pending:pending.map((n,i)=>n-baseline[i]),settled:settled.map((n,i)=>n-baseline[i]),spacing:currentSpacing,hit}));
   }
   console.log(`OK ${engine} ${width}px: intended vehicle spacing, settled action rows, accessible controls and reduced motion`);
  }
  await quote(1280, 900);
  // Confirming Start over still uses the existing reset; closing it above does not.
  await quote(390, 844);
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Start New Quote', exact: true }).click();
  await page.locator('[data-quote-result-card]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#quote-section-passengers').inputValue(), '');
  assert.notEqual(await page.evaluate(() => document.body.style.position), 'fixed');
  // The booking control still opens the existing details flow.
  await quote(390, 844); await page.locator('[data-quote-result-card] #quote-book-now-button').click(); await page.getByPlaceholder('John Smith').waitFor();
  assert.deepEqual(errors, []); console.log('OK original stacked options retained, existing mobile art visible and duplicate capacity hidden, all four result popups open with touch and close without moving the quote, desktop unchanged, booking works; no JS exceptions or live API calls');
 } catch (error) {
  console.error('Browser errors', errors);
  if (page) {
   console.error('Scroll diagnostics', await page.evaluate(() => ({
    y: scrollY, root: document.documentElement.scrollHeight, client: document.documentElement.clientHeight,
    body: document.body.style.cssText, behavior: document.documentElement.style.cssText,
    visible: document.visibilityState,
    geometry: Object.fromEntries(['[data-quote-vehicle-options-heading]', 'header.fixed, header[class*="fixed"]', '[data-quote-result-card] #quote-book-now-button', '[data-quote-result-actions]'].map(selector => { const el = document.querySelector(selector); const r = el?.getBoundingClientRect(); return [selector, r ? { top:r.top, bottom:r.bottom, height:r.height } : null]; })),
    scrolls: window.testScrollCalls.slice(-5), touches: window.testTouchEvents,
    ancestors: (() => { const out = []; let el = document.querySelector('[data-quote-result-actions]'); while (el) { const s = getComputedStyle(el); out.push({ tag: el.tagName, class: el.className, scrollTop: el.scrollTop, overflow: s.overflow }); el = el.parentElement; } return out; })(),
   })));
   fs.mkdirSync(path.join(root, 'test-results/mobile-result'), { recursive: true });
   await page.screenshot({ path: path.join(root, `test-results/mobile-result/${engine}-failure.png`) });
  }
  console.error(serverLog.slice(-300));
  throw error;
 } finally {
  if (browser) await browser.close(); await stopTestProcess(server);
  if (process.exitCode) console.error(serverLog.slice(-5000));
 }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
