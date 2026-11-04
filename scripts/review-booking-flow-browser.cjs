// Overnight visual review of the customer booking flow (desktop + mobile).
// Mocked APIs only: never sends owner emails, creates bookings or starts real payments.
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } = require('../shared/owner-pricing-config.ts');

const OUT = 'test-results/booking-review';
const PORT = 3097;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', 'out'], { stdio: 'ignore' });

const VIEWPORTS = [
  { name: 'desktop-1440', options: { viewport: { width: 1440, height: 900 } } },
  { name: 'laptop-1366', options: { viewport: { width: 1366, height: 768 } } },
  { name: 'iphone-13', options: { ...devices['iPhone 13'] } },
  { name: 'android-pixel7', options: { ...devices['Pixel 7'] } },
];

const JOURNEYS = [
  // 10 days out: normal full payment. 2 days out: card hold copy.
  { name: 'airport-10d', query: 'previewJourney=bfs&previewPax=2&previewBags=2', daysAhead: 10 },
  { name: 'airport-2d', query: 'previewJourney=bfs&previewPax=1&previewBags=1', daysAhead: 2 },
];

async function visibleText(page) {
  return page.evaluate(() => document.body.innerText.replace(/\n{3,}/g, '\n\n'));
}

async function shot(page, label, report) {
  const file = `${label}.png`;
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
  await page.screenshot({ path: `${OUT}/${label}-full.png`, fullPage: true });
  const metrics = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: innerWidth,
    scrollH: document.documentElement.scrollHeight,
    innerH: innerHeight,
  }));
  const overflowX = metrics.scrollW > metrics.innerW + 1;
  report.push(`### ${label}\n- page height ${metrics.scrollH}px vs screen ${metrics.innerH}px${overflowX ? ` — HORIZONTAL OVERFLOW ${metrics.scrollW}px` : ''}`);
  fs.writeFileSync(`${OUT}/${label}.txt`, await visibleText(page));
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const report = ['# Booking flow review', ''];
  try {
    for (const vp of VIEWPORTS) {
      for (const journey of JOURNEYS) {
        const label = `${vp.name}-${journey.name}`;
        const context = await browser.newContext({ ...vp.options, serviceWorkers: 'block' });
        const errors = [];
        const apiCalls = [];
        await context.route('**/*', async (route) => {
          const req = route.request();
          const u = req.url();
          if (u.startsWith(`http://127.0.0.1:${PORT}/`)) return route.continue();
          if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return route.continue();
          if (u.includes('/quote-leads')) return route.fulfill({ json: { ok: true, recorded: true, emailed: true } });
          if (u.includes('/pricing/public')) return route.fulfill({ json: { ok: true, config: toPublicOwnerPricingConfig(defaultOwnerPricingSettings()) } });
          if (u.includes('/saved-quotes/settings')) return route.fulfill({ json: { ok: true, settings: { enabled: true, popupEnabled: false } } });
          if (u.includes('/quote/calculate')) {
            const body = req.postDataJSON?.() ?? {};
            return route.fulfill({ json: { ok: true, amount: 55, journeyFareGbp: 55, airportFixedCostsGbp: 0, nightWeekendSurchargeGbp: 0, vehicleType: body.vehicleType, distanceKm: 25, durationMinutes: 25 } });
          }
          if (u.includes('/route/v1/')) return route.fulfill({ json: { code: 'Ok', routes: [{ distance: 25000, duration: 1500, geometry: { coordinates: [] } }] } });
          if (/\/payments\/stripe-session/.test(u)) {
            apiCalls.push('stripe-session');
            return route.fulfill({ json: { ok: true, status: 'open', clientSecret: 'cs_test_review_secret_x', publishableKey: 'pk_test_review', amount: 55, reference: 'matni-review-0001', cardHold: journey.daysAhead <= 5, holdKind: null } });
          }
          if (/\/payments\/?$/.test(new URL(u).pathname) && req.method() === 'POST') {
            apiCalls.push(`payments POST ${JSON.stringify(req.postDataJSON?.() ?? {}).slice(0, 300)}`);
            return route.fulfill({ json: { ok: true, paymentUrl: `http://127.0.0.1:${PORT}/pay/card/?checkout=cs_test_review0001`, checkoutId: 'cs_test_review0001', checkoutReference: 'matni-review-0001' } });
          }
          if (u.includes('workers.dev') || u.includes('localhost:8787') || u.startsWith('https://booking-review.test/')) {
            apiCalls.push(`other ${req.method()} ${new URL(u).pathname}`);
            return route.fulfill({ json: { ok: true, available: true, blocked: false, settings: {} } });
          }
          return route.abort();
        });
        const page = await context.newPage();
        page.on('pageerror', (e) => errors.push(e.message));
        try {
          await page.goto(`http://127.0.0.1:${PORT}/?${journey.query}`);
          await page.getByRole('button', { name: 'Reject optional', exact: true }).click({ timeout: 5000 }).catch(() => {});
          await page.waitForFunction(() => document.querySelector('#pickup')?.value && document.querySelector('#dropoff')?.value, null, { timeout: 15000 });
          const tripDate = new Date(Date.now() + journey.daysAhead * 86400000).toISOString().slice(0, 10);
          await page.evaluate((d) => window.dispatchEvent(new CustomEvent('quote-prefill-draft', { detail: { passengers: 1, suitcases: 1, vehicle: 'Standard Saloon (1–4 passengers)', returnJourney: false, tripDate: d, tripTime: '14:00' } })), tripDate);
          await page.waitForTimeout(400);
          await shot(page, `${label}-1-form`, report);
          await page.getByRole('button', { name: 'Get My Fixed Price', exact: false }).click();
          await page.locator('[data-quote-result-card] #quote-book-now-button').waitFor({ timeout: 15000 });
          await page.waitForTimeout(500);
          await shot(page, `${label}-2-quote`, report);
          await page.locator('[data-quote-result-card] #quote-book-now-button').click();
          await page.getByPlaceholder('John Smith').waitFor({ timeout: 10000 });
          await page.waitForTimeout(400);
          await shot(page, `${label}-3-details-empty`, report);
          await page.getByPlaceholder('John Smith').fill('Test Customer');
          await page.getByPlaceholder('07xxx xxxxxx').fill('07700 900123');
          await page.getByPlaceholder('you@example.com').fill('test.customer@example.com');
          // Flight number field (optional) is left empty on purpose.
          for (const box of await page.locator('input[type=checkbox]:visible').all()) {
            const name = (await box.getAttribute('name')) || (await box.getAttribute('id')) || '';
            if (/marketing|newsletter|offers/i.test(name)) continue;
            if (!(await box.isChecked())) await box.check().catch(() => {});
          }
          await page.waitForTimeout(300);
          await shot(page, `${label}-4-details-filled`, report);
          // Walk forward through any remaining steps until the payment page.
          for (let step = 5; step <= 9; step++) {
            if (page.url().includes('/pay/card/')) break;
            const candidates = page.getByRole('button', { name: /pay|continue|confirm|book/i });
            const count = await candidates.count();
            let clicked = '';
            for (let i = count - 1; i >= 0; i--) {
              const b = candidates.nth(i);
              if (!(await b.isVisible()) || !(await b.isEnabled())) continue;
              const text = (await b.innerText()).trim();
              if (/back|change|save my quote|whatsapp/i.test(text)) continue;
              clicked = text;
              await b.click();
              break;
            }
            report.push(`- step ${step}: clicked "${clicked || '(nothing clickable)'}"`);
            if (!clicked) break;
            await page.waitForTimeout(1500);
            await shot(page, `${label}-${step}-after-click`, report);
          }
          if (page.url().includes('/pay/card/')) {
            await page.waitForTimeout(2500);
            await shot(page, `${label}-pay-page`, report);
          } else {
            report.push(`- did NOT reach payment page (url ${page.url()})`);
          }
        } catch (error) {
          report.push(`- FAILED: ${String(error.message).split('\n')[0]}`);
          await page.screenshot({ path: `${OUT}/${label}-failure.png`, fullPage: true }).catch(() => {});
          fs.writeFileSync(`${OUT}/${label}-failure.txt`, await visibleText(page).catch(() => ''));
        }
        report.push(`- API calls: ${apiCalls.join(' | ') || 'none'}`);
        report.push(`- page errors: ${errors.join(' | ') || 'none'}`, '');
        await context.close();
      }
    }
  } finally {
    fs.writeFileSync(`${OUT}/REPORT.md`, report.join('\n'));
    await browser.close();
    server.kill();
  }
}

run().catch((e) => { console.error(e); process.exitCode = 1; });
