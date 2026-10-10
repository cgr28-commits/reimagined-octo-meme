/** Isolated hub/transfer quote regression; external services are mocked. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const output = 'test-results/homepage-booking';
await fs.mkdir(output, {recursive:true});
const browser = await chromium.launch();
const results = [];
const cases = [
  {path:'/airports/dublin/',field:'dropoff',airport:/Dublin Airport/},
  {path:'/locations/newtownabbey/',field:'pickup',airport:null},
  {path:'/transfers/belfast-to-belfast-city-airport/',field:'dropoff',airport:/Belfast City/},
  {path:'/transfers/dublin-airport-to-belfast/',field:'pickup',airport:/Dublin Airport/},
];
try {
  for (const width of [390,1280]) {
    const context = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(base).origin) return route.continue();
      const json = body => route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
      if (url.pathname.includes('/route/v1/driving')) return json({code:'Ok',routes:[{distance:26000,duration:1800,geometry:{coordinates:[[-5.9302,54.5964],[-6.2158,54.6575]],type:'LineString'}}]});
      if (url.pathname.endsWith('/addresses')) {
        if (url.searchParams.has('id')) return json({placeId:'test-city-hall',address:'Belfast City Hall, Donegall Square, Belfast BT1 5GS, UK',formattedAddress:'Belfast City Hall, Donegall Square, Belfast BT1 5GS, UK',lat:54.5964,lng:-5.9302,countryCode:'GB',postalCode:'BT1 5GS'});
        return json({suggestions:[{id:'test-city-hall',label:'Belfast City Hall, Donegall Square, Belfast BT1 5GS, UK',mainText:'Belfast City Hall',secondaryText:'Donegall Square, Belfast BT1 5GS, UK'}]});
      }
      if (url.pathname === '/pricing/public') return json({config:toPublicOwnerPricingConfig(defaultOwnerPricingSettings())});
      if (url.pathname === '/quote/availability') return json({blocked:false,available:true,alternativeTimes:[]});
      return route.abort();
    });
    const page = await context.newPage();
    for (const item of cases) {
      await page.goto(`${base}${item.path}?previewMinibus=1`);
      await page.locator('#quote-section-passengers').waitFor();
      const cookie = page.getByRole('button',{name:'Essential only',exact:true});
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
        await page.getByRole('button',{name:/Get My Fixed Price/}).last().click();
        await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).click();
        await page.locator('#date').waitFor({state:'visible'});
        await page.waitForTimeout(1100);
        const positions = await page.evaluate(()=>({date:document.getElementById('date').getBoundingClientRect().top,name:document.getElementById('name').getBoundingClientRect().top,header:document.querySelector('header').getBoundingClientRect().bottom,height:innerHeight}));
        assert.ok(positions.date>=positions.header && positions.date<positions.height && positions.date<positions.name);
        await page.screenshot({path:`${output}/${width}-hub-booking-${item.path.split('/').filter(Boolean).at(-1)}.png`});
        await page.locator('[data-back-to-quote="top"]').click();
        assert.equal(await page.locator('#quote-section-passengers').inputValue(),'2');
        assert.equal(await page.locator('#quote-section-suitcases').inputValue(),'0');
        assert.match(await page.locator(`#${item.field}`).inputValue(),item.airport);
      }
      const label = `${width}px ${item.path}: new form, live quote link, prefill, Select defaults, compact layout${item.airport ? ', quote without dates, booking date visibility and back preservation' : ''}`;
      results.push(label); console.log('PASS',label);
    }
    await context.close();
  }
} finally {
  await fs.writeFile(`${output}/hub-results.json`,JSON.stringify(results,null,2));
  await browser.close();
}
