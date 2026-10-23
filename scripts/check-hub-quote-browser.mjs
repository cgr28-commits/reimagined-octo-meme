/** Isolated hub/transfer quote regression; external services are mocked. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const engine = process.env.PLAYWRIGHT_BROWSER || 'chromium';
const output = `test-results/homepage-booking/${engine}`;
await fs.mkdir(output, {recursive:true});
const browser = await ({chromium,webkit}[engine]).launch();
const results = [];
const cases = [
  {path:'/airports/dublin/',field:'dropoff',airport:/Dublin Airport/},
  {path:'/locations/newtownabbey-airport-taxis/',field:'pickup',airport:null},
  {path:'/transfers/belfast-to-belfast-city/',field:'dropoff',airport:/Belfast City/},
  {path:'/transfers/dublin-airport-to-belfast/',field:'pickup',airport:/Dublin Airport/},
];
try {
  for (const width of [390,1280]) {
    const context = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    const writes = [], quotes = [], errors = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(base).origin) return route.continue();
      const json = body => route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
      if (url.pathname.includes('/route/v1/driving')) return json({code:'Ok',routes:[{distance:26000,duration:1800,geometry:{coordinates:[[-5.9302,54.5964],[-6.2158,54.6575]],type:'LineString'}}]});
      if (url.pathname.endsWith('/addresses')) {
        if (url.searchParams.has('id')) return json({placeId:'test-city-hall',provider:'google',types:['premise'],placeName:'Belfast City Hall',address:'Belfast City Hall, Donegall Square, Belfast BT1 5GS, UK',formattedAddress:'Belfast City Hall, Donegall Square, Belfast BT1 5GS, UK',lat:54.5964,lng:-5.9302,countryCode:'GB',postalCode:'BT1 5GS'});
        return json({suggestions:[{id:'test-city-hall',label:'Belfast City Hall, Donegall Square, Belfast BT1 5GS, UK',mainText:'Belfast City Hall',secondaryText:'Donegall Square, Belfast BT1 5GS, UK'}]});
      }
      if (url.pathname === '/pricing/public') return json({config:toPublicOwnerPricingConfig(defaultOwnerPricingSettings())});
      if (url.pathname === '/quote/availability') return json({blocked:false,available:true,alternativeTimes:[]});
      if (url.pathname === '/quote/calculate') {
        const journey = route.request().postDataJSON();
        quotes.push(journey);
        return json({ok:true,amount:60,journeyFareGbp:60,airportFixedCostsGbp:0,
          nightWeekendSurchargeGbp:0,vehicleType:journey.vehicleType,
          returnJourney:Boolean(journey.returnJourney),distanceKm:26,durationMinutes:30});
      }
      if (route.request().method() === 'POST' && /checkout|bookings|short-notice/.test(url.pathname)) writes.push(url.pathname);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    for (const item of cases) {
      // No previewMinibus flag: it deliberately bypasses authoritative quotes
      // on localhost and would not exercise the customer's real booking flow.
      await page.goto(`${base}${item.path}`);
      await page.locator('#quote-section-passengers').waitFor();
      const cookie = page.getByRole('button',{name:'Reject optional',exact:true});
      if (await cookie.isVisible()) await cookie.click();
      assert.equal(await page.locator('[data-quote-presentation="homepage"]').count(),1);
      assert.equal(await page.locator('#quote-section-passengers').inputValue(),'');
      assert.equal(await page.locator('#quote-section-suitcases').inputValue(),'');
      if (item.airport) assert.match(await page.locator(`#${item.field}`).inputValue(),item.airport);
      for (const button of await page.locator('[data-get-fixed-price]').all()) assert.equal(await button.isEnabled(),false);
      const cta = page.locator('a[data-landing-quote-cta]').first();
      await cta.click();
      await page.waitForTimeout(1100);
      assert.equal(new URL(page.url()).hash,'#quote');
      await page.locator('#quote-section-passengers').scrollIntoViewIfNeeded();
      const rects = await page.locator('#passenger-luggage-section select').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().top));
      assert.equal(rects[0],rects[1]);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`${output}/${width}-hub-${item.path.split('/').filter(Boolean).at(-1)}.png`});
      if (item.airport) {
        const missing = item.field === 'pickup' ? 'dropoff' : 'pickup';
        await page.locator(`#${missing}`).fill('Belfast City Hall');
        await page.getByRole('button',{name:/Belfast City Hall.*Donegall/}).first().click();
        await page.locator('#quote-section-passengers').selectOption('2');
        await page.locator('#quote-section-suitcases').selectOption('0');
        // The current flow requires collection details before the fixed fare,
        // on main as well as PR677. Do not wait for a booking CTA with no schedule.
        const date = new Date(Date.now()+5*86400000).toISOString().slice(0,10);
        await page.locator('#date').fill('');
        await page.locator('#time').fill('');
        await page.getByRole('button',{name:/Get My Fixed Price/}).last().click();
        assert.equal(await page.locator('[data-quote-results="ready"]').count(),0,'missing collection schedule must not reveal a fare');
        assert.ok(await page.locator('#date').evaluate(input=>input.validity.valueMissing));
        const quoteStart = quotes.length;
        await page.locator('#date').fill(date);
        await page.locator('#time').fill('12:00');
        await page.getByRole('button',{name:/Get My Fixed Price/}).last().click();
        await page.locator('[data-quote-fare-status="ready"]').waitFor();
        const customerPrice=(await page.locator('[data-quote-fare-status="ready"]').innerText()).trim();
        assert.match(customerPrice,/^£\d+(?:\.\d{2})?$/,'confirmed total includes the existing airport fees');
        await page.getByRole('button',{name:`BOOK THIS TRANSFER — ${customerPrice}`,exact:true}).click();
        await page.locator('#name').waitFor({state:'visible'});
        assert.ok(quotes.slice(quoteStart).some(q=>q.outboundDate===date && q.outboundTime==='12:00'),'authoritative quote receives collection schedule: '+JSON.stringify(quotes.slice(quoteStart).map(q=>({date:q.outboundDate,time:q.outboundTime}))));
        assert.equal(await page.locator('#date').inputValue(),date);
        assert.equal(await page.locator('#time').inputValue(),'12:00');
        assert.match(await page.locator('#quote-price-summary').innerText(),/2 passengers/);
        assert.match(await page.locator('#quote-price-summary').innerText(),/0 suitcases/);
        assert.ok((await page.locator('#quote-price-summary').innerText()).includes(customerPrice),'booking summary retains the displayed customer total');
        await page.waitForTimeout(1100);
        const positions = await page.evaluate(()=>({date:document.getElementById('date').getBoundingClientRect().top,name:document.getElementById('name').getBoundingClientRect().top,header:document.querySelector('header').getBoundingClientRect().bottom,height:innerHeight}));
        assert.ok(positions.date>=positions.header && positions.date<positions.height && positions.date<positions.name);
        await page.screenshot({path:`${output}/${width}-hub-booking-${item.path.split('/').filter(Boolean).at(-1)}.png`});
        await page.locator('#name').fill('Preview Test');
        await page.locator('#mobile').fill('07700900123');
        await page.locator('#email').fill('preview@example.invalid');
        await page.locator('[data-back-to-quote="top"]').click();
        assert.equal(await page.locator('#quote-section-passengers').inputValue(),'2');
        assert.equal(await page.locator('#quote-section-suitcases').inputValue(),'0');
        assert.match(await page.locator(`#${item.field}`).inputValue(),item.airport);
        assert.equal(await page.locator('#date').inputValue(),date);
        assert.equal(await page.locator('#time').inputValue(),'12:00');
        await page.getByRole('button',{name:`BOOK THIS TRANSFER — ${customerPrice}`,exact:true}).click();
        await page.locator('#name').waitFor({state:'visible'});
        assert.equal(await page.locator('#name').inputValue(),'Preview Test');
        assert.equal(await page.locator('#email').inputValue(),'preview@example.invalid');
      }
      assert.deepEqual(writes,[],'no booking or payment sessions may be created');
      assert.deepEqual(errors,[],'hub and booking flow must have no uncaught browser errors');
      const label = `${engine} ${width}px ${item.path}: quote link, prefill, Select defaults, compact layout${item.airport ? ', required collection schedule, confirmed total preserved into booking, booking details and back preservation' : ''}`;
      results.push(label); console.log('PASS',label);
    }
    await context.close();
  }
} finally {
  await fs.writeFile(`${output}/hub-results.json`,JSON.stringify(results,null,2));
  await browser.close();
}
