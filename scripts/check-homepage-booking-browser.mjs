/** Browser regression against the static export. All external requests are intercepted.
 * Run after building and serving out/: node --import tsx scripts/check-homepage-booking-browser.mjs
 * Install Playwright separately (no application dependency changes).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const output = 'test-results/homepage-booking';
await fs.mkdir(output, { recursive: true });
const results = [];
const browser = await chromium.launch();
function pass(label) { results.push(label); console.log('PASS', label); }
async function disabled(page) {
  const buttons = page.locator('[data-get-fixed-price]');
  assert.ok(await buttons.count());
  for (const button of await buttons.all()) assert.equal(await button.isEnabled(), false);
}
async function book(page) {
  await page.getByRole('button', {name: /BOOK THIS TRANSFER/i}).click();
  await page.locator('#date').waitFor({ state: 'visible' });
  await page.waitForTimeout(1100); // allow the existing 720ms scroll glide to finish
  const pos = await page.evaluate(() => {
    const box = (id) => document.getElementById(id).getBoundingClientRect();
    return { date: box('date').top, time: box('time').top, name: box('name').top,
      header: document.querySelector('header').getBoundingClientRect().bottom,
      height: innerHeight };
  });
  assert.ok(pos.date >= pos.header && pos.date < pos.height);
  assert.ok(pos.time >= pos.header && pos.time < pos.height);
  assert.ok(pos.date < pos.name && pos.time < pos.name);
}
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({viewport:{width,height:900}, reducedMotion:'reduce'});
    const writes = [];
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === new URL(base).origin) return route.continue();
      const json = (body) => route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
      if (url.pathname.includes('/route/v1/driving')) return json({code:'Ok',routes:[{distance:26000,duration:1800,geometry:{coordinates:[[-5.9302,54.5964],[-6.2158,54.6575]],type:'LineString'}}]});
      if (url.pathname === '/pricing/public') return json({config:toPublicOwnerPricingConfig(defaultOwnerPricingSettings())});
      if (url.pathname === '/quote/availability') return json({blocked:false,available:true,alternativeTimes:[]});
      if (/checkout|bookings|short-notice/.test(url.pathname) && req.method() === 'POST') writes.push(url.pathname);
      return route.abort(); // prevent Google, live quotes, payment and booking writes
    });
    const page = await context.newPage();
    await page.goto(base);
    await page.locator('#quote-section-passengers').waitFor();
    if (await page.getByRole('button',{name:'Essential only',exact:true}).isVisible()) await page.getByRole('button',{name:'Essential only',exact:true}).click();
    assert.equal(await page.locator('#quote-section-passengers').inputValue(),'');
    assert.equal(await page.locator('#quote-section-suitcases').inputValue(),'');
    assert.deepEqual(await page.locator('#quote-section-passengers option').allTextContents(),['Select','1','2','3','4','5','6','7']);
    assert.deepEqual(await page.locator('#quote-section-suitcases option').allTextContents(),['Select','None','1','2','3','4','5+']);
    await disabled(page);
    const layout = await page.locator('#passenger-luggage-section select').evaluateAll(els => els.map(e=>{const r=e.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right}}));
    assert.equal(layout[0].top,layout[1].top);
    assert.ok(layout[0].right <= layout[1].left);
    await page.locator('#quote-section-passengers').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${output}/${width}-fresh.png`});
    pass(`${width}px: fresh Select defaults, exact options, disabled CTA, side-by-side layout`);

    await page.goto(`${base}/?previewJourney=bfs&previewMinibus=1`);
    await page.locator('#pickup').waitFor();
    await page.waitForFunction(()=> document.getElementById('pickup')?.value.includes('City Hall'));
    await page.locator('#quote-section-passengers').selectOption('2'); await disabled(page);
    await page.locator('#quote-section-passengers').selectOption('');
    await page.locator('#quote-section-suitcases').selectOption('0'); await disabled(page);
    await page.locator('#quote-section-passengers').selectOption('2');
    await page.getByRole('button',{name:'Get My Fixed Price →',exact:true}).last().click();
    await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).waitFor();
    assert.match(await page.locator('[data-quote-results="ready"]').innerText(), /0 suitcases/);
    pass(`${width}px: missing either selection prevents quote; None accepted as numeric 0`);
    for (const vehicle of ['saloon','estate','executive','minibus']) {
      await page.locator(`[data-vehicle-category="${vehicle}"]`).click();
      await page.locator(`[data-vehicle-art="${vehicle}"][data-vehicle-art-size="result"]`).waitFor();
      await page.locator('[data-quote-results="ready"]').scrollIntoViewIfNeeded();
      await page.screenshot({path:`${output}/${width}-${vehicle}-quote.png`});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
    }
    await page.locator('[data-vehicle-category="saloon"]').click();
    pass(`${width}px: all four vehicle options and quote images render without horizontal overflow`);
    await book(page);
    await page.screenshot({path:`${output}/${width}-booking.png`});
    await page.locator('#date').fill(''); await page.locator('#time').fill('');
    await page.locator('#name').fill('Preview Test'); await page.locator('#mobile').fill('07700900123'); await page.locator('#email').fill('preview@example.invalid');
    await page.locator('[data-back-to-quote="top"]').click();
    assert.equal(await page.locator('#quote-section-passengers').inputValue(),'2');
    assert.equal(await page.locator('#quote-section-suitcases').inputValue(),'0');
    // Returning to the quote with an empty schedule exercises the homepage-only schedule exemption.
    await book(page);
    assert.equal(await page.locator('#date').inputValue(),''); assert.equal(await page.locator('#time').inputValue(),'');
    assert.equal(await page.locator('#name').inputValue(),'Preview Test');
    assert.equal(await page.locator('#email').inputValue(),'preview@example.invalid');
    // Isolated static test: no booking, contact or payment requests can leave this context.
    await page.getByRole('checkbox', {name:/I agree to the Terms/}).check();
    await page.locator('.btn-pay').click();
    await page.getByText('Select your pickup date to continue.', {exact:true}).waitFor();
    assert.deepEqual(writes,[]);
    pass(`${width}px: date/time visible above contact and below header; no-date quote; one-way validation; back preserves party/contact`);

    await page.locator('[data-back-to-quote="top"]').click();
    await page.getByRole('button',{name:/Return SAVE/}).click();
    await page.getByRole('button',{name:/Get My Fixed Price/}).last().click();
    await book(page);
    await page.locator('#returnDate').waitFor({state:'visible'});
    await page.locator('#returnTime').waitFor({state:'visible'});
    const nextDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    await page.locator('#date').fill(nextDate); await page.locator('#time').fill('10:00');
    await page.locator('#returnDate').fill(nextDate); await page.locator('#returnTime').fill('09:00');
    await page.locator('.btn-pay').click();
    await page.waitForTimeout(300);
    assert.match(await page.locator('form').innerText(),/Return.*after|after.*outbound/i);
    assert.deepEqual(writes,[]);
    await page.screenshot({path:`${output}/${width}-return.png`});
    pass(`${width}px: return fields visible; invalid return ordering prevents payment`);

    await page.goto(`${base}/?previewJourney=bfs&previewMinibus=0`);
    await page.locator('#quote-section-passengers').selectOption('7');
    await page.locator('#quote-section-suitcases').selectOption('0');
    await disabled(page);
    assert.match(await page.locator('#homepage-quote-requirements').innerText(),/unavailable/);
    pass(`${width}px: 7-Seater unavailable blocks 5–7 passenger quote without removing options`);
    await page.goto(`${base}/?previewJourney=bfs&previewMinibus=1`);
    await page.locator('#quote-section-passengers').selectOption('7');
    await page.locator('#quote-section-suitcases').selectOption('5'); await disabled(page);
    await page.getByRole('checkbox',{name:/My Airport Taxi NI has confirmed/}).check();
    assert.ok(await page.getByRole('button',{name:/Get My Fixed Price/}).last().isEnabled());
    await page.locator('#quote-section-passengers').selectOption('6'); await disabled(page);
    pass(`${width}px: 5+ requires explicit prior capacity confirmation; party edits reset it`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
    pass(`${width}px: no horizontal overflow`);
    await context.close();
  }
} finally {
  await fs.writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
  await browser.close();
}
