import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { calculateDepositCashQuote } from '../shared/deposit-cash';
import { formatBookingDate } from '../src/lib/format-datetime';
import { getServedAirport } from '../shared/served-airports';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';
assert.equal(formatBookingDate('2026-10-30'),'30 Oct 2026');
assert.equal(formatBookingDate('2026-03-29'),'29 Mar 2026');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const engine=process.env.PLAYWRIGHT_BROWSER||'chromium';
const browser=await ({chromium,webkit}[engine]).launch();
await fs.mkdir(`test-results/terminal-access/${engine}`,{recursive:true});
try {
 for(const width of [375,390]) for(const airport of ["BFS","BHD"]) for(const returning of [false,true]) {
  const terminalFee=airport==="BFS"?5:4;
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
          depositCash:{enabled:true,percent:20,minimumGbp:15}, nightWeekendSurchargeGbp:0, distanceKm:25, durationMinutes:30});
      }
      if (/checkout|bookings|short-notice/.test(url.pathname) && req.method() === 'POST') writes.push(url.pathname);
      return route.abort(); // prevent Google, live quotes, payment and booking writes
    });
  const page=await context.newPage();
  async function tapSettled(control) {
    await control.scrollIntoViewIfNeeded();
    await control.evaluate(el => new Promise(resolve => {
      let previous='', stable=0;
      const check=()=>{
        const r=el.getBoundingClientRect(), current=[scrollX,scrollY,r.x,r.y,r.width,r.height].join(',');
        stable=current===previous?stable+1:0; previous=current;
        if(stable>=12) resolve(); else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    }));
    await control.tap();
  }
  await page.goto(`${base}/?previewJourney=bfs`);
  const reject=page.getByRole('button',{name:'Reject optional',exact:true});
  // Keep the banner open to check booking controls remain scrollable above it.
  await page.waitForFunction(()=>document.getElementById('pickup')?.value.includes('City Hall'));
  if(airport==='BHD') await page.evaluate(()=>window.dispatchEvent(new CustomEvent('quote-prefill-airport',{detail:'BHD'})));
  await page.waitForFunction(name=>document.getElementById('dropoff')?.value.includes(name),airport==='BFS'?'Belfast International':'Belfast City');
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
  await tapSettled(page.getByRole('button',{name:/BOOK THIS TRANSFER/i}));
  const childSeats=page.getByRole('group',{name:'Child / booster seats',exact:true});
  const seatBounds=await childSeats.boundingBox();
  assert.ok(seatBounds.width<=208.5,'Child-seat options stay compact on mobile');
  for(const label of ['None','1','2']) {
    const choice=childSeats.getByRole('button',{name:label,exact:true});
    const box=await choice.boundingBox();
    assert.ok(box.height>=44 && box.height<=44.5,'Seat choices keep 44px tap targets');
    await choice.click();
    assert.equal(await choice.getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#child-seat-notes').count(),label==='None'?0:1);
  }
  await page.locator('#child-seat-notes').fill('Child seat request');
  await childSeats.getByRole('button',{name:'None',exact:true}).click();
  assert.equal(await page.locator('#child-seat-notes').count(),0);
  await childSeats.screenshot({path:`test-results/terminal-access/${engine}/${width}-child-seats.png`});
  const section=page.locator('[data-terminal-access]').first();
  await section.waitFor();
  await section.scrollIntoViewIfNeeded();
  assert.equal(await section.locator('input[value="free"]').isChecked(),true);
  assert.doesNotMatch(await section.innerText(), /(?:Terminal Access|Free Airport Access):/, "No redundant selected-service charge below cards");
  assert.ok((await section.innerText()).includes('Choose Your Drop-off Location'));
  const freeCard=section.locator('label:has(input[value="free"])');
  assert.ok((await freeCard.boundingBox()).height < 170,'Compact free card');
  await section.locator('input[value="express"]').check();
  await page.waitForFunction(expected=>document.querySelector('#step2-journey-summary')?.textContent.includes(`Total £${expected}`),initial+terminalFee);
  const confirmation = page.locator('[data-homepage-fare-change]');
  await confirmation.waitFor();
  assert.ok((await confirmation.innerText()).includes(`Updated total: £${initial+terminalFee}`));
  assert.ok((await confirmation.innerText()).includes(`Your fare has changed from £${initial}`));
  assert.equal((await confirmation.innerText()).includes('before the date and time were added'),false);
  assert.ok(await page.evaluate(()=>{
    const confirmation=document.querySelector('[data-homepage-fare-change]');
    const services=[...document.querySelectorAll('[data-terminal-access]')];
    const terms=[...document.querySelectorAll('label')].find(el=>el.textContent.includes('I agree to the'));
    return confirmation.closest('#step3-payment-actions') && services.every(el=>Boolean(el.compareDocumentPosition(confirmation)&Node.DOCUMENT_POSITION_FOLLOWING)) &&
      Boolean(confirmation.compareDocumentPosition(terms)&Node.DOCUMENT_POSITION_FOLLOWING);
  }),'Price confirmation follows all airport options and precedes terms');
  await confirmation.getByRole('checkbox').check();
  await confirmation.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>{
    const box=document.querySelector('[data-homepage-fare-change]').getBoundingClientRect();
    const banner=document.querySelector('.cookie-consent-banner')?.getBoundingClientRect();
    return !banner || (box.bottom <= banner.top && parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) >= banner.height);
  }),'Confirmation can scroll above cookie banner');
  await confirmation.screenshot({path:`test-results/terminal-access/${engine}/${width}-${airport}-${returning}-confirmation.png`});
  await section.locator('input[value="free"]').check();
  await page.waitForFunction(expected=>document.querySelector('#step2-journey-summary')?.textContent.includes(`Total £${expected}`),initial);
  await section.locator('input[value="express"]').check();
  await confirmation.waitFor();
  assert.equal(await confirmation.getByRole('checkbox').isChecked(),false,'Changed total needs a fresh confirmation');
  await section.locator('input[value="free"]').check();
  if(returning) {
    const pickup=page.locator('[data-terminal-access]').nth(1);
    assert.ok((await pickup.innerText()).includes(`Just a short walk to the Long Stay collection point (approximately ${airport==='BFS'?'4 minutes':'5–10 minutes'}). Follow the airport signs to meet your driver.`));
    await pickup.locator('input[value="express"]').check();
    await pickup.getByRole('checkbox').check();
    assert.equal(await pickup.locator('input[type="radio"]').count(),0,'M&G replaces conflicting access choices');
    await page.waitForFunction(expected=>document.querySelector('#step2-journey-summary')?.textContent.includes(`Total £${expected}`),initial+15);
    await pickup.screenshot({path:`test-results/terminal-access/${engine}/${width}-${airport}-meet-greet.png`});
    await pickup.getByRole('checkbox').uncheck();
    assert.equal(await pickup.locator('input[value="free"]').isChecked(),true);
    await page.waitForFunction(expected=>document.querySelector('#step2-journey-summary')?.textContent.includes(`Total £${expected}`),initial);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await section.screenshot({path:`test-results/terminal-access/${engine}/${width}-${airport}-${returning}-free-paid.png`});
  // Native date/time inputs remain usable in the same booking flow.
  assert.equal(await page.locator('#date').inputValue(),'2026-12-14');
  assert.equal(await page.locator('#time').inputValue(),'12:00');
  const summary=page.locator('#quote-price-summary');
  assert.equal(await summary.locator('[data-checkout-pickup-time]').innerText(),'Pickup time: 14 Dec 2026 · 12:00');
  assert.equal(await summary.locator('[data-checkout-return-time]').count(),returning?1:0);
  if(returning) {
    assert.equal(await summary.locator('[data-checkout-return-time]').innerText(),'Return pickup: 21 Dec 2026 · 12:00');
    assert.equal(await page.locator('#returnDate').inputValue(),'2026-12-21');
  }
  assert.ok((await summary.locator('[data-checkout-summary-controls]').boundingBox()).height<=88.5,'Summary controls use at most two adjacent 44px rows');
  await summary.locator('summary').click();
  assert.ok((await summary.innerText()).includes('Destination:'));
  await summary.locator('summary').click();
  await summary.getByRole('button',{name:'Change airport access'}).click();
  await page.locator('#name').fill('Preview Test');
  await page.locator('#mobile').fill('07700900123');
  await page.locator('#email').fill('preview@example.com');
  await page.getByRole('checkbox',{name:/I agree to the/}).check();
  const full=page.getByRole('button',{name:/Pay in Full Online/});
  await full.click();
  assert.equal(await page.locator('[data-cash-agreement]').count(),0,'Full online has no cash agreement');
  assert.equal(await full.getAttribute('aria-pressed'),'true');
  assert.ok((await full.innerText()).includes('Nothing to pay on the day'));
  const pay=page.locator('#step3-payment-actions .btn-pay').last();
  if(returning) {
    await tapSettled(pay);
    const flight=page.locator('#collectionFlightNumber');
    await page.waitForFunction(()=>document.activeElement?.id==='collectionFlightNumber');
    assert.equal(await flight.getAttribute('aria-invalid'),'true');
    assert.ok((await page.locator('#collectionFlightNumber-feedback').innerText()).length>0);
    assert.equal(await page.locator('#step3-payment-actions').getByText(/valid flight number|flight number is required/i).count(),0);
    await page.locator('#step2-flight-details').screenshot({path:`test-results/terminal-access/${engine}/${width}-${airport}-flight-error.png`});
    await flight.fill('NOT-A-FLIGHT');
    await tapSettled(pay);
    await page.waitForFunction(()=>document.activeElement?.id==='collectionFlightNumber');
    await flight.fill('EZY456');
    await page.waitForFunction(()=>document.getElementById('collectionFlightNumber')?.getAttribute('aria-invalid')==='false');
  }
  await section.locator('input[value="express"]').check();
  await confirmation.waitFor();
  await tapSettled(pay);
  await page.waitForFunction(()=>document.activeElement?.closest('[data-homepage-fare-change]'));
  assert.deepEqual(writes,[],'Invalid flight or unacknowledged price must not start payment');
  await confirmation.getByRole('checkbox').check();
  const deposit=page.getByRole('button',{name:/Deposit \+ Cash/});
  await deposit.click();
  assert.equal(await confirmation.getByRole('checkbox').isChecked(),true,'Payment method changes do not reset acknowledged fare');
  assert.equal(await deposit.getAttribute('aria-pressed'),'true');
  const amounts=calculateDepositCashQuote(initial+terminalFee,{enabled:true,percent:20,minimumGbp:15});
  assert.ok((await deposit.innerText()).includes(`£${amounts.depositGbp.toFixed(2)} today`));
  assert.ok((await deposit.innerText()).includes(`£${amounts.cashDueGbp.toFixed(2)} cash on the day`));
  const cash=page.locator('[data-cash-agreement]').getByRole('checkbox');
  const cashLabel=`I understand that the remaining £${amounts.cashDueGbp} must be paid in cash to my driver on the day.`;
  assert.equal((await page.locator('[data-cash-agreement]').innerText()).trim(),cashLabel);
  assert.equal(await cash.isChecked(),false);
  await tapSettled(pay);
  try {
    await page.locator('#step3-payment-actions').getByText('Please confirm you understand the remaining balance must be paid in cash', {exact:false}).waitFor();
  } catch(error) {
    console.error('Cash validation state',await page.evaluate(()=>({
      active:document.activeElement?.outerHTML,
      invalid:[...document.querySelectorAll('[aria-invalid="true"]')].map(el=>el.outerHTML),
      payment:document.querySelector('#step3-payment-actions')?.textContent
    })));
    await page.screenshot({path:`test-results/terminal-access/${engine}/${width}-${airport}-${returning}-cash-failure.png`,fullPage:true});
    throw error;
  }
  assert.deepEqual(writes,[],'Missing cash acknowledgement must not start payment');
  await cash.check();
  assert.equal(await cash.isChecked(),true);
  await full.click();
  assert.equal(await page.locator('[data-cash-agreement]').count(),0);
  await deposit.click();
  assert.equal(await cash.isChecked(),false,'Changing back to deposit requires the cash agreement again');
  assert.equal(await page.getByText('Secure payment powered by SumUp',{exact:true}).count(),1);
  await pay.scrollIntoViewIfNeeded();
  assert.ok(await pay.evaluate(el=>{
    const banner=document.querySelector('.cookie-consent-banner')?.getBoundingClientRect();
    return !banner || el.getBoundingClientRect().bottom <= banner.top;
  }),'Payment action scrolls clear of open cookie banner');
  assert.equal(await page.locator('#step3-payment-actions').getByRole('button',{name:'Start over',exact:true}).count(),1);
  const consent=width===375?'Reject optional':'Accept';
  assert.ok((await page.locator('.cookie-consent-banner').boundingBox()).height<110,'Compact banner retains 44px consent buttons');
  await page.getByRole('button',{name:consent,exact:true}).click();
  assert.equal(await page.locator('.cookie-consent-banner').count(),0);
  await page.locator('#step3-payment-actions').screenshot({path:`test-results/terminal-access/${engine}/${width}-${airport}-${returning}-payment.png`});
  await summary.screenshot({path:`test-results/terminal-access/${engine}/${width}-${airport}-${returning}-summary.png`});
  assert.equal(await page.evaluate(()=>localStorage.getItem('matni-cookie-consent-v1')),width===375?'rejected':'accepted');
  assert.deepEqual(writes,[]);
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('pickup')?.value);
  assert.equal(await page.locator('.cookie-consent-banner').count(),0,'Consent persists after reload');
  console.log(`PASS ${engine} ${width}px: initial fare only, free default, paid +£${terminalFee}, free reversion, no overflow, native date/time, no live writes`);
  await context.close();
 }
} finally { await browser.close(); }
