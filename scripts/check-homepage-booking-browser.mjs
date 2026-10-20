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
function futureDate(days = 5) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
async function disabled(page) {
  const buttons = page.locator('[data-get-fixed-price]');
  assert.ok(await buttons.count());
  for (const button of await buttons.all()) assert.equal(await button.isEnabled(), false);
}
async function requestFixedPrice(page, { returning = false, date = futureDate() } = {}) {
  const card = page.locator('[data-quote-presentation="homepage"].quote-flow');
  const before = await card.evaluate((element) => element.getBoundingClientRect().height);
  await page.getByRole('button', { name: /Get My Fixed Price/ }).last().click();
  const dialog = page.locator('[data-homepage-schedule-dialog]');
  await dialog.waitFor({ state: 'visible' });
  const dialogShell = page.locator('[data-quote-action-dialog]');
  assert.equal(await dialogShell.getAttribute('role'), 'dialog');
  assert.equal(await dialogShell.getAttribute('aria-modal'), 'true');
  await page.screenshot({path:`${output}/${page.viewportSize().width}-schedule-open.png`});
  await page.waitForFunction(() => {
    const dialog = document.querySelector('[data-quote-action-dialog]');
    return dialog?.contains(document.activeElement);
  });
  assert.equal(await page.evaluate(() => document.querySelector('[data-quote-action-dialog]')?.contains(document.activeElement)), true,
    'opening the dialog must move keyboard focus inside it');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.querySelector('[data-quote-action-dialog]')?.contains(document.activeElement)), true,
    'keyboard focus must stay within the open dialog');
  assert.equal(await page.evaluate(() => document.body.style.position), 'fixed',
    'opening the dialog must lock background scrolling');
  assert.equal(await page.locator('[data-quote-results="ready"]').count(), 0,
    'a final fare must remain hidden while the schedule dialog is incomplete');
  const whileOpen = await card.evaluate((element) => element.getBoundingClientRect().height);
  assert.equal(whileOpen, before, 'the schedule popup must not change quote-card height');
  await page.getByRole('button', { name: 'Save date & time', exact: true }).click();
  assert.equal(await dialog.isVisible(), true, 'an empty schedule must not be accepted');
  await page.screenshot({path:`${output}/${page.viewportSize().width}-schedule-popup.png`});
  await page.locator('#date').fill(date);
  await page.locator('#time').fill('12:00');
  if (returning) {
    await page.locator('#returnDate').fill(date);
    await page.getByRole('button', { name: 'Save date & time', exact: true }).click();
    assert.equal(await dialog.isVisible(), true, 'a return journey must require a return time');
    await page.locator('#returnTime').fill('14:00');
  }
  await page.screenshot({path:`${output}/${page.viewportSize().width}-schedule-selected.png`});
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-get-fixed-price'));
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-get-fixed-price')), true,
    'closing the dialog must restore focus to its opener');
  assert.notEqual(await page.evaluate(() => document.body.style.position), 'fixed',
    'closing the dialog must restore background scrolling');
  await page.locator('[data-edit-quote-schedule]').click();
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await page.locator('#date').inputValue(), date, 'closing the popup must preserve pickup date');
  assert.equal(await page.locator('#time').inputValue(), '12:00', 'closing the popup must preserve pickup time');
  if (returning) {
    assert.equal(await page.locator('#returnDate').inputValue(), date);
    assert.equal(await page.locator('#returnTime').inputValue(), '14:00');
  }
  await page.getByRole('button', { name: 'Save date & time', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  const afterSave = await card.evaluate((element) => element.getBoundingClientRect().height);
  assert.ok(afterSave <= before + 1, 'saving schedule must not increase quote-card height');
  assert.ok(await page.locator('[data-edit-quote-schedule]').isVisible());
  await page.getByRole('button', { name: /Get My Fixed Price/ }).last().click();
  await page.locator('[data-quote-results="ready"]').waitFor({ state: 'attached' });
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
  for (const width of [320, 360, 375, 390, 1280]) {
    const mobile = width < 768;
    const context = await browser.newContext({
      viewport:{width,height:mobile ? 640 : 800},
      isMobile:mobile,
      hasTouch:mobile,
      deviceScaleFactor:mobile ? 2 : 1,
      reducedMotion:'reduce',
    });
    const writes = [];
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === new URL(base).origin) return route.continue();
      const json = (body) => route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
      if (url.pathname.includes('/route/v1/driving')) return json({code:'Ok',routes:[{distance:26000,duration:1800,geometry:{coordinates:[[-5.9302,54.5964],[-6.2158,54.6575]],type:'LineString'}}]});
      if (url.pathname.endsWith('/addresses')) {
        if (url.searchParams.has('id')) return json({placeId:'test-dublin-airport',address:'Dublin, Ireland',formattedAddress:'Dublin, Ireland',displayAddress:'Dublin, Ireland',placeName:'Dublin',lat:53.4264,lng:-6.2499,countryCode:'IE',postalCode:null});
        return json({suggestions:[{id:'test-dublin-airport',label:'Dublin Airport Terminal 2, Ireland',mainText:'Dublin Airport Terminal 2',secondaryText:'Ireland'}]});
      }
      if (url.pathname === '/pricing/public') return json({config:toPublicOwnerPricingConfig(defaultOwnerPricingSettings())});
      if (url.pathname === '/quote/availability') return json({blocked:false,available:true,alternativeTimes:[]});
      if (url.pathname.endsWith('/quote/calculate')) {
        const journey = req.postDataJSON();
        const oneWay = 60;
        const journeyFareGbp = journey.returnJourney ? oneWay * 2 * 0.95 : oneWay;
        return json({ok:true, amount:journeyFareGbp, amountLabel:`£${journeyFareGbp.toFixed(2)}`,
          vehicleType:journey.vehicleType, vehicleChoice:'Saloon', premiumApplied:false,
          returnJourney:Boolean(journey.returnJourney), journeyFareGbp, airportFixedCostsGbp:0,
          nightWeekendSurchargeGbp:0, distanceKm:25, durationMinutes:30});
      }
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
    await requestFixedPrice(page);
    await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).waitFor();
    assert.match(await page.locator('[data-quote-results="ready"]').innerText(), /0 suitcases/);
    pass(`${width}px: missing either selection prevents quote; None accepted as numeric 0`);
    for (const vehicle of ['saloon','estate','executive','minibus']) {
      await page.locator(`[data-vehicle-category="${vehicle}"]`).click();
      const summaryArt = page.locator(`[data-vehicle-art="${vehicle}"][data-vehicle-art-size="result"]`);
      await summaryArt.waitFor({ state: width < 768 ? 'attached' : 'visible' });
      assert.equal(await summaryArt.isVisible(), width >= 768, 'Duplicate artwork is desktop-only');
      assert.ok(await page.locator(`[data-vehicle-category="${vehicle}"] [data-vehicle-art-size="option"]`).isVisible(), 'Original choice artwork remains visible');
      await page.locator('[data-quote-results="ready"]').scrollIntoViewIfNeeded();
      await page.screenshot({path:`${output}/${width}-${vehicle}-quote.png`});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
    }
    await page.locator('[data-vehicle-category="saloon"]').click();
    pass(`${width}px: all four vehicle options retain images, mobile summary avoids duplication and no horizontal overflow`);
    await book(page);
    await page.screenshot({path:`${output}/${width}-booking.png`});
    await page.locator('#date').fill(''); await page.locator('#time').fill('');
    await page.locator('#name').fill('Preview Test'); await page.locator('#mobile').fill('07700900123'); await page.locator('#email').fill('preview@example.invalid');
    await page.locator('[data-back-to-quote="top"]').click();
    assert.equal(await page.locator('#quote-section-passengers').inputValue(),'2');
    assert.equal(await page.locator('#quote-section-suitcases').inputValue(),'0');
    // Returning with an empty schedule must hide the previous fare until dates are reselected.
    assert.equal(await page.locator('[data-quote-results="ready"]').count(),0);
    await requestFixedPrice(page);
    await book(page);
    assert.equal(await page.locator('#date').inputValue(),futureDate());
    assert.equal(await page.locator('#time').inputValue(),'12:00');
    assert.equal(await page.locator('#name').inputValue(),'Preview Test');
    assert.equal(await page.locator('#email').inputValue(),'preview@example.invalid');
    // Isolated static test: no booking, contact or payment requests can leave this context.
    await page.locator('#date').fill(''); await page.locator('#time').fill('');
    await page.getByRole('checkbox', {name:/I agree to the Terms/}).check();
    await page.locator('.btn-pay').click();
    await page.getByText('Select your pickup date to continue.', {exact:true}).waitFor();
    assert.deepEqual(writes,[]);
    pass(`${width}px: no fare before schedule; saved date/time survives booking flow; checkout still blocks missing date; back preserves party/contact`);

    await page.locator('[data-back-to-quote="top"]').click();
    await page.getByRole('button',{name:/Return SAVE/}).click();
    await requestFixedPrice(page,{returning:true});
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
    await page.goto(`${base}/?previewJourney=bfs&previewMinibus=1`);
    await page.waitForFunction(()=> document.getElementById('pickup')?.value.includes('City Hall'));
    for (const field of ['dropoff','pickup']) {
      await page.locator(`#${field}`).fill('Dublin Airport');
      await page.getByRole('button',{name:'Dublin Airport Terminal 2 Ireland',exact:true}).click();
      await page.waitForFunction((id)=>document.getElementById(id)?.value === 'Dublin Airport, Ireland',field);
      assert.equal(await page.locator(`#${field}`).inputValue(),'Dublin Airport, Ireland');
    }
    await page.locator('#pickup').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${output}/${width}-dublin-airport-fields.png`});
    pass(`${width}px: airport suggestion resolving to Dublin, Ireland displays Dublin Airport, Ireland in pickup and drop-off`);
    await context.close();
  }
} finally {
  await fs.writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
  await browser.close();
}
