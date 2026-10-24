import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { getServedAirport } from '../shared/served-airports';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const engine=process.env.PLAYWRIGHT_BROWSER||'chromium';
const browser=await ({chromium,webkit}[engine]).launch();
await fs.mkdir(`test-results/terminal-access/${engine}`,{recursive:true});
try {
 for(const width of [375,390]) for(const returning of [false,true]) {
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,locale:'en-GB',reducedMotion:'reduce'});
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
  const page=await context.newPage();
  await page.goto(`${base}/?previewJourney=bfs&previewMinibus=1`);
  const reject=page.getByRole('button',{name:'Reject optional',exact:true});
  if(await reject.isVisible()) await reject.click();
  await page.waitForFunction(()=>document.getElementById('pickup')?.value.includes('City Hall'));
  await page.locator('#quote-section-passengers').selectOption('2');
  await page.locator('#quote-section-suitcases').selectOption('1');
  if(returning) await page.getByRole('button',{name:/Return SAVE/}).click();
  await page.locator('#date').fill('2026-12-14');
  await page.locator('#time').fill('12:00');
  if(returning) { await page.locator('#returnDate').fill('2026-12-21'); await page.locator('#returnTime').fill('12:00'); }
  await page.getByRole('button',{name:/Get My Fixed Price/}).last().click();
  await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).waitFor();
  assert.equal(await page.locator('[data-terminal-access]').count(),0,'No optional service controls in instant quote');
  const initial=Number((await page.locator('[data-quote-result-price]').innerText()).match(/£([0-9.]+)/)[1]);
  assert.ok(initial>0);
  await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).click();
  const section=page.locator('[data-terminal-access]').first();
  await section.waitFor();
  await section.scrollIntoViewIfNeeded();
  assert.equal(await section.locator('input[value="free"]').isChecked(),true);
  await section.locator('input[value="express"]').check();
  await page.waitForFunction(expected=>document.querySelector('#step2-journey-summary')?.textContent.includes(`Total £${expected}`),initial+5);
  const confirmation = page.locator('[data-homepage-fare-change]');
  await confirmation.waitFor();
  assert.ok((await confirmation.innerText()).includes('final booking choices'));
  assert.equal((await confirmation.innerText()).includes('before the date and time were added'),false);
  assert.ok(await page.evaluate(()=>{
    const confirmation=document.querySelector('[data-homepage-fare-change]');
    const services=[...document.querySelectorAll('[data-terminal-access]')];
    const terms=[...document.querySelectorAll('label')].find(el=>el.textContent.includes('I agree to the'));
    return confirmation.closest('#step3-payment-actions') && services.every(el=>Boolean(el.compareDocumentPosition(confirmation)&Node.DOCUMENT_POSITION_FOLLOWING)) &&
      Boolean(confirmation.compareDocumentPosition(terms)&Node.DOCUMENT_POSITION_FOLLOWING);
  }),'Price confirmation follows all airport options and precedes terms');
  await confirmation.getByRole('checkbox').check();
  await section.locator('input[value="free"]').check();
  await page.waitForFunction(expected=>document.querySelector('#step2-journey-summary')?.textContent.includes(`Total £${expected}`),initial);
  await section.locator('input[value="express"]').check();
  await confirmation.waitFor();
  assert.equal(await confirmation.getByRole('checkbox').isChecked(),false,'Changed total needs a fresh confirmation');
  await section.locator('input[value="free"]').check();
  if(returning) {
    const pickup=page.locator('[data-terminal-access]').nth(1);
    await pickup.locator('input[value="express"]').check();
    await pickup.getByRole('checkbox').check();
    assert.equal(await pickup.locator('input[type="radio"]').count(),0,'M&G replaces conflicting access choices');
    await page.waitForFunction(expected=>document.querySelector('#step2-journey-summary')?.textContent.includes(`Total £${expected}`),initial+15);
    await pickup.getByRole('checkbox').uncheck();
    assert.equal(await pickup.locator('input[value="free"]').isChecked(),true);
    await page.waitForFunction(expected=>document.querySelector('#step2-journey-summary')?.textContent.includes(`Total £${expected}`),initial);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await section.screenshot({path:`test-results/terminal-access/${engine}/${width}-${returning}-free-paid.png`});
  // Native date/time inputs remain usable in the same booking flow.
  assert.equal(await page.locator('#date').inputValue(),'2026-12-14');
  assert.equal(await page.locator('#time').inputValue(),'12:00');
  assert.deepEqual(writes,[]);
  console.log(`PASS ${engine} ${width}px: initial fare only, free default, paid +£5, free reversion, no overflow, native date/time, no live writes`);
  await context.close();
 }
} finally { await browser.close(); }
