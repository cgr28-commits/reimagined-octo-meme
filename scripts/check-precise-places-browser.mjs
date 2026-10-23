/** Real rendered UI, isolated API fixtures; never sends a live booking/payment. */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';

const root = path.resolve('out');
const origin = 'http://127.0.0.1:3195';
const output = 'test-results/precise-places';
const server = http.createServer(async (req,res) => {
  try {
    let name = decodeURIComponent(new URL(req.url,origin).pathname);
    if(name.endsWith('/')) name += 'index.html';
    const file=path.resolve(root,'.'+name); if(!file.startsWith(root+path.sep)) throw Error();
    const data=await fs.readFile(file);
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(data);
  } catch { res.statusCode=404;res.end(); }
});
await new Promise(resolve=>server.listen(3195,'127.0.0.1',resolve));
await fs.mkdir(output,{recursive:true});
const home={placeId:'test-home',address:'12 Holywood Road, Belfast BT4 1NT, UK',formattedAddress:'12 Holywood Road, Belfast BT4 1NT, UK',displayAddress:'12 Holywood Road, Belfast BT4 1NT, UK',placeName:null,lat:54.6063,lng:-5.8711,countryCode:'GB',postalCode:'BT4 1NT',streetNumber:'12',route:'Holywood Road',types:['street_address'],provider:'google'};
const hotel={...home,placeId:'test-hotel',placeName:'Individual Hotel',address:'Individual Hotel, Belfast BT1 5GS, UK',formattedAddress:'Belfast BT1 5GS, UK',displayAddress:'Individual Hotel, Belfast BT1 5GS, UK',streetNumber:null,types:['lodging','establishment','point_of_interest']};
const road={...home,placeId:'test-road',address:'Holywood Road, Belfast, UK',displayAddress:'Holywood Road, Belfast, UK',formattedAddress:'Holywood Road, Belfast, UK',placeName:'Holywood Road',streetNumber:null,types:['route']};
async function dismissConsent(page) {
  const reject=page.getByRole('button',{name:'Reject optional',exact:true});
  try { await reject.waitFor({state:'visible',timeout:1500}); }
  catch(error) { if(error.name==='TimeoutError')return;throw error; }
  await reject.click();await reject.waitFor({state:'hidden'});
}
async function enterAddress(page, selector, value) {
  // A real customer taps the visible input before typing. WebKit fill() alone
  // can edit an offscreen input, leaving its fixed-position popup offscreen.
  const input=page.locator(selector);await input.click();await input.fill(value);
}
let cases=0;
try {
  for (const [engineName,engine] of Object.entries(process.env.PLAYWRIGHT_BROWSER === "chromium" ? {chromium} : {chromium,webkit})) for(const width of [320,390,1280]) {
    const browser=await engine.launch(engineName === "chromium" && process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:["--no-sandbox","--no-zygote","--single-process","--disable-dev-shm-usage","--use-gl=disabled","--disable-gpu","--disable-software-rasterizer","--disable-webgl","--in-process-gpu","--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process"]} : {});
    try {
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',...(width<500?{isMobile:true,hasTouch:true}:{})});
      const quotes=[],writes=[],errors=[];
      let delayDetails=false;
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.origin===origin) return route.continue();
        const json=body=>route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
        if(url.pathname.includes('/route/v1/driving')) return json({code:'Ok',routes:[{distance:5000,duration:600,geometry:{type:'LineString',coordinates:[[-5.8711,54.6063],[-6.2158,54.6575]]}}]});
        if(url.pathname.endsWith('/addresses')) {
          if(url.searchParams.has('id')) {
            if(delayDetails) await new Promise(resolve=>setTimeout(resolve,500));
            const id=url.searchParams.get('id');return json(id==='test-home'?home:id==='test-hotel'?hotel:road);
          }
          const query=url.searchParams.get('q')||'';
          const fixture=/hotel/i.test(query)?hotel:/^12/.test(query)?home:road;
          return json({suggestions:[{id:fixture.placeId,label:fixture.address,mainText:fixture.placeName||'12 Holywood Road',secondaryText:'Belfast, UK'}]});
        }
        if(url.pathname==='/pricing/public') return json({config:toPublicOwnerPricingConfig({...defaultOwnerPricingSettings(),estate:{upliftGbp:7}})});
        if(url.pathname==='/quote/availability') return json({blocked:false,available:true,alternativeTimes:[]});
        if(url.pathname==='/quote/calculate') {
          const data=request.postDataJSON();quotes.push(data);
          assert.ok(data.pickupPlaceId&&data.dropoffPlaceId,'quote must carry both IDs');
          assert.ok(![data.pickupPlaceId,data.dropoffPlaceId].includes('test-road'),'vague location must never reach quote endpoint');
          return json({ok:true,amount:45,journeyFareGbp:45,airportFixedCostsGbp:0,nightWeekendSurchargeGbp:0,vehicleType:data.vehicleType,returnJourney:false,distanceKm:5,durationMinutes:10});
        }
        if(request.method()==='POST'&&/checkout|bookings|payments/.test(url.pathname)) writes.push(url.pathname);
        return route.abort();
      });
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      for(const pathname of ['/','/transfers/belfast-to-belfast-city/']) {
        await page.goto(origin+pathname);
        await page.locator('#pickup').waitFor();
        await dismissConsent(page);
        // Homepage has no selected airport on a fresh visit.
        if(pathname==='/') {
          await enterAddress(page,'#dropoff','Belfast International');
          await page.getByRole('button',{name:/Belfast International Airport.*Airport Rd/}).first().click();
          await enterAddress(page,'#dropoff','Dublin Airport');
          await page.getByRole('button',{name:/Dublin Airport.*Ireland/}).first().click();
          await page.waitForFunction(()=>document.querySelector('#dropoff')?.value==='Dublin Airport, Co. Dublin, Ireland');
          await enterAddress(page,'#dropoff','Belfast International');
          await page.getByRole('button',{name:/Belfast International Airport.*Airport Rd/}).first().click();
        }
        const price=page.locator('[data-get-fixed-price]').last();
        await enterAddress(page,'#pickup','Holywood Road');
        await page.getByRole('button',{name:/Holywood Road.*Belfast/}).first().click();
        await page.getByText('Please choose a full address, hotel or individual building from the suggestions.',{exact:true}).first().waitFor();
        assert.equal(await price.isDisabled(),true,'road must not enable quote');
        await enterAddress(page,'#pickup','12 Holywood Road');
        await page.getByRole('button',{name:/12 Holywood Road.*Belfast/}).first().click();
        await page.waitForFunction(()=>document.querySelector('#pickup')?.value.includes('BT4 1NT'));
        await page.locator('#quote-section-passengers').selectOption('1');await page.locator('#quote-section-suitcases').selectOption('1');
        const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
        await page.locator('#date').fill(date);await page.locator('#time').fill('12:00');
        await price.click();await page.locator('[data-quote-fare-status="ready"]').waitFor();
        const customerPrice=(await page.locator('[data-quote-fare-status="ready"]').innerText()).trim();
        assert.ok(quotes.some(q=>q.pickupPlaceId==='test-home'));
        await page.getByRole('button',{name:`BOOK THIS TRANSFER — ${customerPrice}`,exact:true}).click();
        await page.locator('#name').waitFor({state:'visible'});
        await page.locator('[data-back-to-quote="top"]').click();
        const prior=quotes.length;
        await enterAddress(page,'#pickup','99 Holywood Road, Belfast');
        assert.equal(await price.isDisabled(),true,'editing invalidates previous ID and quote');
        await page.waitForTimeout(350);assert.equal(quotes.length,prior,'edited text cannot request a price');
        await enterAddress(page,'#pickup','Individual Hotel');
        await page.getByRole('button',{name:/Individual Hotel.*Belfast/}).first().click();
        await page.waitForFunction(()=>document.querySelector('#pickup')?.value.includes('BT1 5GS'));
        await page.locator('#quote-section-passengers').selectOption('1');await page.locator('#quote-section-suitcases').selectOption('1');
        await price.click();await page.locator('[data-quote-fare-status="ready"]').waitFor();
        assert.ok(quotes.some(q=>q.pickupPlaceId==='test-hotel'),'unnumbered business works');
        await page.screenshot({path:`${output}/${engineName}-${width}-${pathname==='/'?'home':'hub'}.png`});
        // A slow selection response must not restore coordinates after another edit.
        delayDetails=true;
        await enterAddress(page,'#pickup','12 Holywood Road');
        await page.getByRole('button',{name:/12 Holywood Road.*Belfast/}).first().click();
        await enterAddress(page,'#pickup','Other unfinished address');
        await page.waitForTimeout(700);
        assert.equal(await page.locator('#pickup').inputValue(),'Other unfinished address');assert.equal(await price.isDisabled(),true);
        delayDetails=false;
        cases++;console.log(`PASS ${engineName} ${width}px ${pathname}: street rejected, full address/hotel, booking, edit and late-response invalidation`);
      }
      await page.goto(origin+'/owner/pricing-preview/');
      const minimum=page.getByRole('textbox',{name:/Belfast International Airport — Minimum Saloon Fare/});
      await minimum.waitFor();assert.equal(await minimum.inputValue(),'45.00');
      await minimum.fill('');assert.equal(await page.getByRole('button',{name:'Save Changes',exact:true}).isDisabled(),true);
      await minimum.pressSequentially('47.25');await minimum.blur();
      await dismissConsent(page);
      await page.getByRole('button',{name:'Save Changes',exact:true}).click();
      await page.getByRole('dialog',{name:'Confirm pricing changes'}).getByRole('button',{name:'Save Pricing',exact:true}).click();
      await page.getByRole('dialog',{name:'Confirm pricing changes'}).waitFor({state:'hidden'});
      await page.reload();await minimum.waitFor();
      await page.waitForFunction(()=>[...document.querySelectorAll('label')]
        .find(label=>label.textContent.includes('Belfast International Airport — Minimum Saloon Fare'))
        ?.querySelector('input')?.value==='47.25');
      assert.equal(await minimum.inputValue(),'47.25');
      await minimum.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/${engineName}-${width}-admin.png`});
      assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
      cases++;console.log(`PASS ${engineName} ${width}px admin: default, blank rejection, decimal editing and save/reload`);
      await context.close();
    } finally {await browser.close();}
  }
  await fs.writeFile(`${output}/results.json`,JSON.stringify({cases,liveWrites:0},null,2));
} finally {server.close();}
