// Focused quote-reveal regression. All external requests are intercepted; no live API writes.
// Run: node --import tsx scripts/check-mobile-result-action-browser.cjs
const { chromium, webkit, devices } = require('playwright');
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
  await context.route('https://**/*', async r => {
   const u = r.request().url();
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
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  async function quote(width, height, { bars = 0, lateBars = 0, reduced = false, firstTap = null, vehicle = 'Standard Saloon (1–4 passengers)' } = {}) {
   await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
   await page.goto('http://127.0.0.1:3094/?previewJourney=bfs&previewPax=1&previewBags=1');
   await page.locator('#quote-section-passengers').waitFor();
   await page.waitForFunction(() => document.querySelector('#pickup')?.value && document.querySelector('#dropoff')?.value && document.querySelector('#quote-section-passengers')?.value === '1');
   const consent = page.getByRole('button', { name: /^(Essential only|Reject optional)$/, exact: true }); if (await consent.isVisible()) await consent.click();
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
   if (width < 768) { assert.ok(m.stacked, 'Original stacked vehicle layout must be preserved'); assert.ok(Math.abs(m.heading - m.header - 12) <= 9, 'Mobile must reveal the selected result below the header: ' + JSON.stringify(m));  }
   else { assert.ok(Math.abs(m.heading - m.header - 12) <= 9, 'Desktop heading stop changed: ' + JSON.stringify(m)); assert.ok(await page.locator('[data-quote-result-art]').isVisible()); assert.ok(await page.locator('[data-quote-result-capacity]').isVisible()); }
   assert.match(m.label, /BOOK THIS TRANSFER|REQUEST QUOTE/);
   // Once the initial responses settle, the result must not keep scrolling.
   await page.waitForTimeout(250); assert.ok(Math.abs(await page.evaluate(() => scrollY) - m.y) <= 2);
   fs.mkdirSync(path.join(root, 'test-results/mobile-result'), { recursive: true });
   await page.screenshot({ path: path.join(root, `test-results/mobile-result/${engine}-${width}-${height}-${bars}-${lateBars}-${reduced}-${vehicle.split(' ')[0]}.png`) });
   if (width < 768) {
    assert.equal(await page.locator('[data-quote-result-art]').isVisible(), true);
    assert.equal(await page.locator('[data-quote-result-capacity]').isVisible(), false);
    for (const name of ['View route', 'Save Quote', 'Start over']) assert.ok(await page.getByRole('button', { name, exact: true }).isVisible());
    assert.ok(await page.getByRole('button', { name: 'Need help? WhatsApp us', exact: true }).isVisible());
    const manual = /Executive|Minibus/.test(vehicle);
    if (manual) assert.equal(await page.getByText('View price breakdown', { exact: true }).count(), 0, 'Unpriced requests must not show a fare breakdown');
    assert.equal(await page.locator('[data-quote-save]').isDisabled(), manual, 'Unpriced requests cannot be saved as confirmed fares');
    const popups = [
     ['View route', 'dialog', 'View route'],
     ...(!manual ? [['Save Quote', 'dialog', 'Save Quote']] : []),
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
     if (buttonName === 'Save Quote') await dialog.getByRole('textbox', { name: 'Your name', exact: true }).fill('Preview Test');
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
  // Isolated same-fixture measurement against the pinned main export in CI.
  if (process.env.QUOTE_SWITCH_DIAGNOSTIC) {
   const diagnosticWidth = Number(process.env.QUOTE_SWITCH_WIDTH || 320);
   await quote(diagnosticWidth, 844, { reduced: diagnosticWidth === 375 });
   await page.evaluate(() => document.fonts.ready);
   const measure = () => page.evaluate(() => {
    const card = document.querySelector('[data-quote-selected-vehicle-card]');
    const rect = el => { const r = el.getBoundingClientRect(); const c=getComputedStyle(el); return { top: r.top + scrollY, height: r.height, text: el.innerText, font:c.fontFamily, fontSize:c.fontSize, lineHeight:c.lineHeight }; };
    return Object.fromEntries(['[data-quote-result-heading]', '[data-quote-result-detail-slot]', '[data-quote-result-art]', '[data-quote-result-price]', '[data-quote-info-grid]', '[data-quote-changing-info]', '[data-quote-result-main-action]', '[data-quote-result-actions]'].map(selector => [selector, rect(document.querySelector(selector))]));
   });
   const before = await measure();
   await page.locator('[data-vehicle-category="estate"]').click();
   await page.waitForTimeout(100);
   const pending = await measure();
   await page.waitForTimeout(1500);
   const settled = await measure();
   const transitions = { estate: { pending, settled } };
   if (diagnosticWidth === 375) {
    for (const id of ['executive', 'minibus', 'saloon']) {
     await page.locator(`[data-vehicle-category="${id}"]`).click();
     await page.waitForTimeout(100);
     const pending = await measure();
     await page.waitForTimeout(1500);
     transitions[id] = { pending, settled: await measure() };
    }
    await page.locator('[data-vehicle-category="estate"]').click();
    await page.waitForTimeout(1500);
   }
   const button = page.locator('[data-quote-result-card] #quote-book-now-button');
   await button.scrollIntoViewIfNeeded();
   await button.click({ trial: true });
   const hit = await button.evaluate(el => {
    const r = el.getBoundingClientRect();
    const headerBottom = document.querySelector('header.fixed, header[class*="fixed"]')?.getBoundingClientRect().bottom || 0;
    return { top:r.top, bottom:r.bottom, viewport:visualViewport.height, headerBottom,
     unobstructed:[.2,.5,.8].every(x=>[.2,.5,.8].every(y=>el.contains(document.elementFromPoint(r.left+r.width*x,r.top+r.height*y)))) };
   });
   assert.ok(hit.top >= hit.headerBottom && hit.bottom <= hit.viewport && hit.unobstructed, JSON.stringify(hit));
   await page.screenshot({path:`test-results/mobile-result/switch-${process.env.QUOTE_SWITCH_DIAGNOSTIC}.png`});
   await button.click();
   await page.getByPlaceholder('John Smith').waitFor();
   const report = {before,pending,settled,transitions,hit,bookingOpened:true};
   fs.writeFileSync(`test-results/mobile-result/switch-${process.env.QUOTE_SWITCH_DIAGNOSTIC}.json`, JSON.stringify(report,null,2));
   console.log('SWITCH DIAGNOSTIC '+process.env.QUOTE_SWITCH_DIAGNOSTIC+' '+JSON.stringify(report));
   assert.deepEqual(errors, []);
   return;
  }
  // Each action must work as the FIRST touch after the automatic reveal.
  // Mobile reveal targets the selected result (measureQuoteReveal), not the
  // vehicle-list heading. The existing selected artwork remains visible.
  // The CI failure screenshot confirms the selected card and actions fit here.
  for (const firstTap of ['View route', 'Save Quote', 'Start over', 'Need help? WhatsApp us']) {
   await quote(430, 932, { firstTap });
  }
  for (const [width, height] of [[320, 568], [360, 800], [375, 667], [390, 844], [430, 932]]) await quote(width, height, { bars: 100 });
  await quote(390, 844, { lateBars: 160 });
  await quote(375, 667, { bars: 100, reduced: true });
  for (const vehicle of ['Estate Car (1–4 passengers)', 'Executive Saloon (1–4 passengers)', 'Minibus (5–7 passengers)']) await quote(390, 844, { bars: 100, vehicle });
  // Main 4fa36b0e and PR cecc728f both move Estate down 12px at 320px:
  // globals.css keeps Estate art margin-bottom 10px and other vehicles -2px.
  // Compare pending -> ready within the selected vehicle, not different vehicle
  // content heights. Returning to Saloon must restore the original geometry.
  for (const width of [320, 360, 375, 390, 430]) {
   await quote(width, 844, { reduced: width === 375 });
   const positions = () => page.evaluate(() => ['[data-quote-result-main-action]', '[data-quote-result-actions]'].map(selector => document.querySelector(selector).getBoundingClientRect().top + scrollY));
   const baseline = await positions();
   for (const id of ['estate', 'executive', 'minibus', 'saloon']) {
    await page.locator(`[data-vehicle-category="${id}"]`).click();
    await page.waitForTimeout(100);
    const pendingPositions = await positions();
    await page.waitForTimeout(600);
    for (const [i, top] of (await positions()).entries()) {
     // WebKit reduced motion exposes the same intermediate price/art layout
     // on main: Estate moves 18.40625px (12px art + 6.40625px price height).
     // CI builds main with identical fonts/data and gates *every* recorded state
     // against PR. Match that established transition, retaining the 2px tolerance.
     let expectedDelta = 0;
     if (engine === 'webkit' && width === 375) {
      const reference = JSON.parse(fs.readFileSync('test-results/mobile-result/switch-main-375.json'));
      const selector = ['[data-quote-result-main-action]', '[data-quote-result-actions]'][i];
      expectedDelta = reference.transitions[id].settled[selector].top - reference.transitions[id].pending[selector].top;
     }
     assert.ok(Math.abs(top - pendingPositions[i] - expectedDelta) <= 2, `${width}px ${id} repricing: action ${i} moved ${top - pendingPositions[i]}px; main expects ${expectedDelta}px`);
     if (id === 'saloon') assert.ok(Math.abs(top - baseline[i]) <= 2, `${width}px Saloon geometry did not return to baseline`);
    }
    const booking = page.locator('[data-quote-result-card] #quote-book-now-button');
    await booking.scrollIntoViewIfNeeded();
    await booking.click({ trial: true });
    assert.ok(await booking.evaluate(el => {
     const r = el.getBoundingClientRect();
     const header = document.querySelector('header.fixed, header[class*="fixed"]')?.getBoundingClientRect().bottom || 0;
     return r.top >= header && r.bottom <= visualViewport.height && el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));
    }), `${width}px ${id}: booking button must be fully visible and unobstructed after normal scroll`);
    const duration = await page.locator('[data-quote-changing-info]').evaluate(el => getComputedStyle(el).animationDuration);
    if (width === 375) assert.equal(await page.locator('[data-quote-changing-info]').evaluate(el => getComputedStyle(el).animationName), 'none');
    else assert.equal(duration, '0.7s'); // Existing 700ms CSS on main and PR.
   }
   console.log(`OK ${width}px: both action rows stable during repricing; intended vehicle spacing preserved; booking accessible; fade respects Reduce Motion`);
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
  assert.deepEqual(errors, []); console.log('OK original stacked options retained, selected mobile vehicle art visible and duplicate capacity hidden, all four result popups open with touch and close without moving the quote, desktop unchanged, booking works; no JS exceptions or live API calls');
 } catch (error) {
  console.error('Browser errors', errors);
  if (page) {
   console.error('Scroll diagnostics', await page.evaluate(() => ({
    y: scrollY, root: document.documentElement.scrollHeight, client: document.documentElement.clientHeight,
    body: document.body.style.cssText, behavior: document.documentElement.style.cssText,
    visible: document.visibilityState,
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
