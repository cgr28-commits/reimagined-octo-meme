import { getServedAirport } from '../shared/served-airports';
/** Browser regression against the static export. All external requests are intercepted.
 * Run after building and serving out/: node --import tsx scripts/check-homepage-booking-browser.mjs
 * Install Playwright separately (no application dependency changes).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const engine = process.env.PLAYWRIGHT_BROWSER || 'chromium';
const output = `test-results/homepage-booking/${engine}`;
await fs.mkdir(output, { recursive: true });
const results = [];
const browser = await ({ chromium, webkit }[engine]).launch();
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
  const trigger = page.getByRole('button', { name: /Get My Fixed Price/ }).last();
  const pickupDateInput = page.locator('#date');
  const time = page.locator('#time');
  await pickupDateInput.waitFor({ state: 'visible' });
  await time.waitFor({ state: 'visible' });
  const schedule = page.locator('[data-quote-schedule]');
  assert.equal(await schedule.isVisible(), true, 'pickup schedule must be inline in the homepage quote tool');
  // Read both rectangles in the same frame: back-to-quote can still be scrolling.
  const fieldBoxes = await schedule.evaluate(section => ['date', 'time'].map(id => {
    const rect = section.querySelector(`#${id}`).getBoundingClientRect();
    return {y:rect.y, height:rect.height};
  }));
  assert.ok(fieldBoxes.every(box => box && box.height >= 44), 'date/time touch targets must be at least 44px high');
  assert.equal(Math.round(fieldBoxes[0].y), Math.round(fieldBoxes[1].y), 'pickup date and time must share a row');
  await schedule.screenshot({path:`${output}/${page.viewportSize().width}-schedule-inline.png`});
  assert.equal(await page.locator('[data-quote-results="ready"]').count(), 0,
    'a final fare must remain hidden while the schedule is incomplete or has changed');
  if (!(await pickupDateInput.inputValue()) || !(await time.inputValue())) {
    await trigger.click();
    assert.equal(await page.locator('[data-quote-results="ready"]').count(), 0,
      'clicking for a fare without schedule values must not show a price');
    if (!(await pickupDateInput.inputValue())) {
      assert.ok(await pickupDateInput.evaluate(input => input.validity.valueMissing));
      await pickupDateInput.fill(date);
    }
    if (!(await time.inputValue())) await time.fill('12:00');
  }
  if (returning) {
    const returnDate = page.locator('#returnDate');
    const returnTime = page.locator('#returnTime');
    await returnDate.waitFor({ state: 'visible' });
    if (!(await returnDate.inputValue()) || !(await returnTime.inputValue())) {
      if (!(await returnDate.inputValue())) await returnDate.fill(futureDate(7));
      await trigger.click();
      assert.equal(await page.locator('[data-quote-results="ready"]').count(), 0,
        'a return journey must require return time before showing a fare');
      if (!(await returnTime.inputValue())) {
        assert.ok(await returnTime.evaluate(input => input.validity.valueMissing));
        await returnTime.fill('14:00');
      }
    }
  }
  await schedule.screenshot({path:`${output}/${page.viewportSize().width}-schedule-complete.png`});
  await trigger.click();
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
      locale:'en-GB',
      timezoneId:'Europe/London',
    });
    const writes = [];
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === new URL(base).origin) return route.continue();
      const json = (body) => route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
      if (url.pathname.includes('/route/v1/driving')) return json({code:'Ok',routes:[{distance:26000,duration:1800,geometry:{coordinates:[[-5.9302,54.5964],[-6.2158,54.6575]],type:'LineString'}}]});
      if (url.pathname.endsWith('/addresses')) {
        if (url.searchParams.has('id')) { const airport=getServedAirport('DUB'); return json({...airport,address:airport.formattedAddress,placeName:airport.name,provider:'airport'}); }
        return json({suggestions:[{id:getServedAirport('DUB').placeId,label:'Dublin Airport Terminal 2, Ireland',mainText:'Dublin Airport Terminal 2',secondaryText:'Ireland'}]});
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
    await page.getByRole('button',{name:'Reject optional',exact:true}).waitFor({state:'visible'});
    await page.getByRole('button',{name:'Reject optional',exact:true}).click();
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
    await page.locator('#date').fill('');
    await page.locator('#time').fill('');
    if (mobile) {
      assert.equal(await page.getByText('Select date', {exact:true}).isVisible(), true);
      assert.equal(await page.getByText('Select time', {exact:true}).isVisible(), true);
      assert.equal(await page.locator('#date').evaluate(input => getComputedStyle(input).fontSize), '16px');
    }
    await page.locator('#date').fill('2020-01-01');
    await page.locator('#time').fill('12:00');
    await page.getByRole('button',{name:/Get My Fixed Price/}).last().click();
    assert.equal(await page.locator('[data-quote-results="ready"]').count(), 0,
      'a past pickup date must not reveal a fare');
    await page.locator('#date').fill('');
    await page.locator('#time').fill('');
    await requestFixedPrice(page);
    await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).waitFor();
    assert.match(await page.locator('[data-quote-results="ready"]').innerText(), /0 suitcases/);
    pass(`${width}px: missing either selection prevents quote; None accepted as numeric 0`);
    for (const vehicle of ['saloon','estate','executive','minibus']) {
      await page.locator(`[data-vehicle-category="${vehicle}"]`).click();
      const summaryArt = page.locator(`[data-vehicle-art="${vehicle}"][data-vehicle-art-size="result"]`);
      await summaryArt.waitFor({ state: 'visible' });
      assert.equal(await summaryArt.isVisible(), true, 'The selected-vehicle summary artwork must remain visible');
      assert.ok(await page.locator(`[data-vehicle-category="${vehicle}"] [data-vehicle-art-size="option"]`).isVisible(), 'Original choice artwork remains visible');
      await page.locator('[data-quote-results="ready"]').scrollIntoViewIfNeeded();
      await page.screenshot({path:`${output}/${width}-${vehicle}-quote.png`});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
    }
    await page.locator('[data-vehicle-category="saloon"]').click();
    pass(`${width}px: all four vehicle options retain images, selected summary artwork is visible and no horizontal overflow`);
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
    assert.equal(await page.locator('[data-quote-results="ready"]').count(),0,
      'changing a booking date/time must invalidate the previous fixed fare');
    assert.deepEqual(writes,[], 'browser checkout regression must not submit booking or payment writes');
    await page.locator('[data-back-to-quote="top"]').click();
    await requestFixedPrice(page);
    assert.ok(await page.locator('[data-quote-results="ready"]').count(),
      'a fresh quote must be available after a valid schedule is selected again');
    assert.deepEqual(writes,[]);
    pass(`${width}px: schedule required before fare; dates and customer inputs persist; changed schedule invalidates fare and requires a fresh quote; no payment or booking writes`);

    await page.getByRole('button',{name:/Return SAVE/}).click();
    await requestFixedPrice(page,{returning:true});
    await book(page);
    await page.locator('#returnDate').waitFor({state:'visible'});
    await page.locator('#returnTime').waitFor({state:'visible'});
    const nextDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    await page.locator('#date').fill(nextDate); await page.locator('#time').fill('10:00');
    await page.locator('#returnDate').fill(nextDate); await page.locator('#returnTime').fill('09:00');
    assert.equal(await page.locator('#returnTime').evaluate((input) => input.validity.valid), false,
      'a return pickup earlier than the outbound pickup must fail native field validation');
    assert.deepEqual(writes,[]);
    await page.screenshot({path:`${output}/${width}-return.png`});
    pass(`${width}px: return fields visible; invalid return ordering fails validation and no payment is initiated`);

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
      const input=page.locator(`#${field}`);
      await input.click();
      await input.fill('Dublin Airport');
      const listboxId=await input.getAttribute('aria-controls');
      assert.ok(listboxId,`${field} autocomplete must identify its listbox`);
      await page.locator(`[id="${listboxId}"]`).getByRole('button',{name:'Dublin Airport Terminal 2 Ireland',exact:true}).click();
      await page.waitForFunction(({id,label})=>document.getElementById(id)?.value === label,{id:field,label:getServedAirport('DUB').formattedAddress});
      assert.equal(await page.locator(`#${field}`).inputValue(),getServedAirport('DUB').formattedAddress);
    }
    await page.locator('#pickup').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${output}/${width}-dublin-airport-fields.png`});
    pass(`${width}px: canonical Dublin airport suggestion retains its verified airport address in pickup and drop-off`);
    await context.close();
  }
} finally {
  await fs.writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
  await browser.close();
}
