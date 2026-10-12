import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
const base=process.env.TEST_BASE_URL||'http://localhost:3000';
const output='test-results/ireland-airport-quotes';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1280]) {
    for(const [airport,destination,returnJourney] of [['BFS','cork',false],['BHD','donegal',false],['BHD','galway',true],['BFS','enniskillen',false]]) {
      const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin===new URL(base).origin)return route.continue();
        if(url.pathname.includes('/route/v1/driving'))return route.fulfill({contentType:'application/json',body:JSON.stringify({code:'Ok',routes:[{distance:200000,duration:9000,geometry:{coordinates:[[-6.2158,54.6575],[-8.4755,51.8973]],type:'LineString'}}]})});
        if(url.pathname==='/quote/availability')return route.fulfill({contentType:'application/json',body:JSON.stringify({blocked:false,available:true,alternativeTimes:[]})});
        return route.abort(); // External booking/payment/email requests cannot reach production.
      });
      const page=await context.newPage();
      await page.goto(`${base}/?previewJourney=ireland&previewAirport=${airport}&previewDestination=${destination}&previewPax=2&previewBags=2&previewMinibus=1`);
      await page.waitForFunction(()=>document.getElementById('pickup')?.value.includes('Airport'));
      if(await page.getByRole('button',{name:'Essential only',exact:true}).isVisible())await page.getByRole('button',{name:'Essential only',exact:true}).click();
      assert.match(await page.locator('#pickup').inputValue(),airport==='BFS'?/International/:/City/);
      if(returnJourney)await page.getByRole('button',{name:/Return/i}).first().click();
      await page.getByRole('button',{name:'Get My Fixed Price →',exact:true}).last().click();
      const book=page.getByRole('button',{name:/BOOK THIS TRANSFER/i});
      await book.waitFor();
      const result=page.locator('[data-quote-results="ready"]');
      assert.match(await result.innerText(),/£\d/);
      assert.doesNotMatch(await result.innerText(),/Republic of Ireland journey – request your fixed price/);
      await result.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`${output}/${width}-${airport}-${destination}-${returnJourney?'return':'oneway'}.png`,fullPage:true});
      await book.click();
      await page.locator('#date').waitFor({state:'visible'});
      assert.ok(await page.locator('#name').isVisible());
      assert.equal(await page.locator('[data-booking-meet-greet]').count(),0);
      console.log(`PASS ${width}px ${airport} → ${destination}: instant numeric fare, booking details, no overflow, no Meet & Greet change`);
      await context.close();
    }
  }
}finally{await browser.close();}
