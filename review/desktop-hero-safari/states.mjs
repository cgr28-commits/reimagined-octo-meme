/**
 * Temporary review script (scratch branch only): WebKit screenshots of the homepage hero
 * states for the desktop two-column refinement. All external requests are mocked or blocked,
 * so no live quotes, bookings, payments or tracking are sent.
 * Usage: BASE=http://127.0.0.1:3000 TAG=new node --import tsx review/desktop-hero-safari/states.mjs
 */
import fs from 'node:fs/promises';
import { webkit } from 'playwright';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../../shared/owner-pricing-config';
import { skipCookieConsent } from '../../scripts/playwright-cookie-consent.mjs';

const base = process.env.BASE || 'http://127.0.0.1:3000';
const tag = process.env.TAG || 'new';
const out = 'test-results/safari-check/states';
await fs.mkdir(out, { recursive: true });

const PLACES = {
  'p-lisburn': { label: '12 Belfast Road, Lisburn BT27 4AA, UK', main: '12 Belfast Road', sub: 'Lisburn BT27 4AA', lat: 54.51, lng: -6.04, pc: 'BT27 4AA' },
  'p-bangor': { label: '4 High Street, Bangor BT20 5AB, UK', main: '4 High Street', sub: 'Bangor BT20 5AB', lat: 54.66, lng: -5.67, pc: 'BT20 5AB' },
};
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function mock(context) {
  await context.route('**/*', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (url.origin === new URL(base).origin) return route.continue();
    const json = (body) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.includes('/route/v1/driving')) return json({ code: 'Ok', routes: [{ distance: 70000, duration: 3600, geometry: { coordinates: [[-5.93, 54.59], [-6.21, 54.65]], type: 'LineString' } }] });
    if (url.pathname.endsWith('/addresses')) {
      const id = url.searchParams.get('id');
      if (id && PLACES[id]) { const p = PLACES[id]; return json({ placeId: id, address: p.label, formattedAddress: p.label, displayAddress: p.label, lat: p.lat, lng: p.lng, countryCode: 'GB', postalCode: p.pc }); }
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const ids = q.includes('high') ? ['p-bangor'] : ['p-lisburn'];
      return json({ suggestions: ids.map((i) => ({ id: i, label: PLACES[i].label, mainText: PLACES[i].main, secondaryText: PLACES[i].sub })) });
    }
    if (url.pathname === '/pricing/public') { const s = defaultOwnerPricingSettings(); s.minibus.publicEnabled = true; return json({ config: toPublicOwnerPricingConfig(s) }); }
    if (url.pathname === '/quote/availability') return json({ blocked: false, available: true, alternativeTimes: [] });
    if (url.pathname.endsWith('/quote/calculate')) {
      const j = req.postDataJSON(); const f = j.returnJourney ? 114 : 60;
      return json({ ok: true, amount: f, amountLabel: `£${f.toFixed(2)}`, vehicleType: j.vehicleType, vehicleChoice: 'Saloon', premiumApplied: false, returnJourney: Boolean(j.returnJourney), journeyFareGbp: f, airportFixedCostsGbp: 0, nightWeekendSurchargeGbp: 0, distanceKm: 70, durationMinutes: 60 });
    }
    // Fonts load from the static export itself; everything else (Google, ads, live API) is blocked.
    return route.abort();
  });
}

async function pick(page, id, text, match) {
  await page.locator('#' + id).click();
  await page.locator('#' + id).pressSequentially(text, { delay: 40 });
  await page.locator('[role=option]').filter({ hasText: match }).first().click();
  await page.waitForTimeout(900);
}

const browser = await webkit.launch();
const report = [];
try {
  // Fresh hero at every size (tablet/phone are compared against the live code afterwards).
  for (const [w, h] of [[390, 844], [768, 1024], [1024, 768], [1180, 820], [1280, 800], [1366, 768], [1440, 900], [1920, 1080], [2560, 1200]]) {
    const mobile = w < 768;
    const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, locale: 'en-GB', timezoneId: 'Europe/London', reducedMotion: 'reduce' });
    await skipCookieConsent(context); await mock(context);
    const page = await context.newPage();
    await page.goto(base + '/'); await page.locator('#pickup').waitFor(); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${tag}-fresh-${w}.png` });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    report.push({ tag, w, state: 'fresh', overflow: sw > w });
    await context.close();
  }
  // Journey states on desktop (new build only).
  if (tag === 'new') {
    for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080]]) {
      for (const mode of ['oneway', 'return']) {
        const context = await browser.newContext({ viewport: { width: w, height: h }, locale: 'en-GB', timezoneId: 'Europe/London', reducedMotion: 'reduce' });
        await skipCookieConsent(context); await mock(context);
        const page = await context.newPage();
        await page.goto(base + '/'); await page.locator('#pickup').waitFor(); await page.evaluate(() => document.fonts.ready);
        const h1y = () => page.evaluate(() => Math.round(document.querySelector('#homepage-booking-intro > h1').getBoundingClientRect().top + scrollY));
        const y0 = await h1y();
        if (mode === 'return') await page.getByRole('button', { name: /Return/ }).first().click();
        await pick(page, 'pickup', '12 Bel', 'Belfast Road');
        await pick(page, 'dropoff', '4 High', 'High Street');
        await page.locator('#quote-section-passengers').selectOption('2');
        await page.locator('#quote-section-suitcases').selectOption('1');
        await page.locator('#date').waitFor({ state: 'attached' });
        await page.locator('#date').fill(day(5), { force: true }); await page.locator('#time').fill('12:00', { force: true });
        if (mode === 'return') { await page.locator('#returnDate').fill(day(9), { force: true }); await page.locator('#returnTime').fill('14:00', { force: true }); }
        await page.waitForTimeout(600);
        const y1 = await h1y();
        const clipped = await page.evaluate(() => [...document.querySelectorAll('#quote-section-schedule [data-schedule-control]')].some((el) => el.scrollWidth > el.clientWidth + 1));
        await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
        await page.screenshot({ path: `${out}/new-${mode}-filled-${w}.png` });
        await page.getByRole('button', { name: /Get My Fixed Price/ }).last().click();
        await page.locator('[data-quote-results="ready"]').waitFor({ state: 'attached', timeout: 20000 });
        await page.waitForTimeout(1800);
        await page.screenshot({ path: `${out}/new-${mode}-results-${w}.png` });
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        report.push({ tag, w, state: mode, headlineMovedPx: y1 - y0, scheduleClipped: clipped, resultsOverflow: sw > w });
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await fs.writeFile(`${out}/${tag}-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
