import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { calculatePointToPointQuote } from '../src/lib/quote';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';
const base=process.env.TEST_BASE_URL || 'http://localhost:3000';
await fs.mkdir('test-results/greater-belfast-ireland',{recursive:true});
const browser=await chromium.launch();
try {
  for (const width of [390,1280]) for (const destination of ['cork','galway','donegal','derry']) {
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    const writes=[];
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin===new URL(base).origin) return route.continue();
      const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
      if(url.pathname.includes('/route/v1/driving')) return json({code:'Ok',routes:[{distance:420000,duration:18000,geometry:{coordinates:[[-5.9302,54.5964],[-8.4656,51.8966]],type:'LineString'}}]});
      if(url.pathname==='/pricing/public') return json({config:toPublicOwnerPricingConfig(defaultOwnerPricingSettings())});
      if(url.pathname==='/quote/availability') return json({blocked:false,available:true,alternativeTimes:[]});
      if(url.pathname==='/quote/calculate') {
        const body=req.postDataJSON();
        const fare=calculatePointToPointQuote('Belfast City Hall','Irish destination',body.vehicleType,Boolean(body.returnJourney),{}, {distanceKm:420,durationMinutes:300,source:'osrm'},null);
        assert.ok(fare && fare.amount>0);
        return json({ok:true,amount:fare.amount,journeyFareGbp:fare.amount,airportFixedCostsGbp:0,nightWeekendSurchargeGbp:0,
          vehicleType:body.vehicleType,returnJourney:body.returnJourney,distanceKm:420,durationMinutes:300});
      }
      if(req.method()==='POST') writes.push(url.pathname);
      return route.abort();
    });
    const page=await context.newPage();
    await page.goto(`${base}/?previewJourney=bfs&previewDestination=${destination}`);
    await page.waitForFunction(()=>document.getElementById('pickup')?.value.includes('City Hall'));
    const cookie=page.getByRole('button',{name:'Essential only',exact:true});
    if(await cookie.isVisible()) await cookie.click();
    await page.locator('#quote-section-passengers').selectOption('2');
    await page.locator('#quote-section-suitcases').selectOption('0');
    await page.getByRole('button',{name:'Get My Fixed Price →',exact:true}).last().click();
    await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).waitFor();
    assert.match(await page.locator('[data-quote-results="ready"]').innerText(),/£[\d,]+/);
    await page.locator('[data-quote-results="ready"]').scrollIntoViewIfNeeded();
    await page.screenshot({path:`test-results/greater-belfast-ireland/${width}-${destination}.png`});
    await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).click();
    await page.locator('#date').waitFor({state:'visible'});
    assert.equal(await page.locator('#quote-section-passengers').inputValue(),'2');
    assert.equal(await page.locator('#quote-section-suitcases').inputValue(),'0');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(writes,[],'no real customer, email or payment writes');
    console.log(`PASS ${width}px Greater Belfast → ${destination}: numeric fare and booking details`);
    await context.close();
  }
} finally {await browser.close();}
