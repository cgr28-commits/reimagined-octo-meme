import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { getServedAirport } from '../shared/served-airports';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
await fs.mkdir('test-results/checkout-loading',{recursive:true});
try {
 for(const width of [390,1440]) for(const scenario of ['success','slow','uncertain','rejected']) for(const method of ['FULL_ONLINE','DEPOSIT_CASH']) {
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600,locale:'en-GB'});
  const writes=[];let payments=0,clicked=false,sent;
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
      if (url.pathname === '/quote/availability') { if(clicked) await new Promise(r=>setTimeout(r,600)); return json({blocked:false,available:true,alternativeTimes:[]}); }
      if (url.pathname.endsWith('/quote/calculate')) {
        const journey = req.postDataJSON();
        const oneWay = 60;
        const journeyFareGbp = journey.returnJourney ? oneWay * 2 * 0.95 : oneWay;
        return json({ok:true, amount:journeyFareGbp, amountLabel:`£${journeyFareGbp.toFixed(2)}`,
          vehicleType:journey.vehicleType, vehicleChoice:'Saloon', premiumApplied:false,
          returnJourney:Boolean(journey.returnJourney), journeyFareGbp, airportFixedCostsGbp:0,
          depositCash:{enabled:true,percent:20,minimumGbp:15}, nightWeekendSurchargeGbp:0, distanceKm:25, durationMinutes:30});
      }
      if (url.pathname === '/payments') {
        payments++; sent=req.postDataJSON();
        await new Promise(r=>setTimeout(r,scenario==='slow'?8500:350));
        if(scenario==='uncertain') return route.abort();
        if(scenario==='rejected') return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'vehicle_unavailable',error:'Please choose another vehicle or contact us.'})});
        return json({checkoutId:'isolated-checkout',paymentUrl:'https://checkout.sumup.com/isolated',checkoutReference:'isolated',bookingSaved:false});
      }
      if(url.hostname==='checkout.sumup.com') return route.fulfill({contentType:'text/html',body:'<h1>Mock secure checkout</h1>'});
      if (/checkout|bookings|short-notice/.test(url.pathname) && req.method() === 'POST') writes.push(url.pathname);
      return route.abort(); // prevent Google, live quotes, payment and booking writes
    });

  const page=await context.newPage();
  await page.goto(`${base}/?previewJourney=bfs`);
  const reject=page.getByRole('button',{name:'Reject optional',exact:true});
  if(await reject.isVisible()) await reject.click();
  await page.waitForFunction(()=>document.getElementById('pickup')?.value.includes('City Hall'));
  await page.locator('#quote-section-passengers').selectOption('2');
  await page.locator('#quote-section-suitcases').selectOption('2');
  await page.locator('#date').fill('2026-12-14');
  await page.locator('#time').fill('12:00');
  await page.getByRole('button',{name:/Get My Fixed Price/}).last().click();
  await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).click();
  for(const [id,value] of [['name','Preview Test'],['mobile','07700900123'],['email','preview@example.com']]) {
    await page.locator('#'+id).fill(value); await page.locator('#'+id).press('Tab');
  }
  await page.getByRole('checkbox',{name:/I agree to the/}).check();
  await page.getByRole('button',{name:method==='FULL_ONLINE'?/Pay in Full Online/:/Deposit \+ Cash/}).click();
  if(method==='DEPOSIT_CASH') await page.locator('[data-cash-agreement]').getByRole('checkbox').check();
  const pay=page.locator('#step3-payment-actions .btn-pay').last();
  await pay.scrollIntoViewIfNeeded();
  await page.keyboard.press("Tab");
  await pay.focus();
  assert.equal(await pay.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
  clicked=true;
  const started=Date.now();
  // Two synchronous clicks exercise the ref guard before React rerenders.
  await pay.evaluate(el=>{el.click();el.click();});
  await page.getByRole('button',{name:'Preparing your secure payment…'}).waitFor();
  const feedbackMs=Date.now()-started;
  assert.ok(feedbackMs<600,`Immediate feedback: ${feedbackMs}ms`);
  assert.equal(await pay.isDisabled(),true);
  assert.equal(await page.locator('#payment-loading-status').innerText(),'Please wait. We’re connecting you securely to SumUp.');
  if(scenario==='slow') {
    await page.getByText('Still connecting securely to SumUp. Please wait…',{exact:true}).waitFor({timeout:11000});
    await page.locator('#step3-payment-actions').screenshot({path:`test-results/checkout-loading/${width}-${method}-slow.png`});
  }
  if(scenario==='uncertain') {
    await page.getByText(/We couldn't confirm whether your payment link was created/).waitFor();
    assert.equal(await pay.isDisabled(),true);
    await page.reload();
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('matni-payment-outcome-pending-v1')),'pending');
    assert.equal(payments,1);
  } else if(scenario==='rejected') {
    await page.getByText('Please choose another vehicle or contact us.',{exact:true}).waitFor();
    assert.equal(await pay.isEnabled(),true);
    assert.equal(await page.locator('#name').inputValue(),'Preview Test');
  } else if(width<600) {
    await page.waitForURL('https://checkout.sumup.com/isolated');
  } else {
    await page.getByText('Secure payment ready',{exact:true}).waitFor();
    const popupPromise=context.waitForEvent('page');
    await page.getByRole('button',{name:'Continue to SumUp',exact:true}).click();
    const popup=await popupPromise;await popup.waitForURL('https://checkout.sumup.com/isolated');
  }
  assert.equal(payments,1);
  assert.equal(sent.paymentMethod,method);
  assert.equal(sent.amount,60,'Browser sends authoritative total; Worker derives deposit');
  assert.equal(sent.booking.passengers,2);assert.equal(sent.booking.suitcases,2);
  console.log(JSON.stringify({width,scenario,method,feedbackMs,totalMs:Date.now()-started,payments}));
  await context.close();
 }
} finally {await browser.close();}
