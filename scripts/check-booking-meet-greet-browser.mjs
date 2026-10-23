/** Static-export conversion checks. Every non-static request is intercepted; no live writes. */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';
import { publicDepositCashOffer } from '../shared/deposit-cash';
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(`${process.env.PLAYWRIGHT_MODULE}/index.mjs`).href : 'playwright');
const engine=process.env.PLAYWRIGHT_BROWSER || 'chromium';
const output=`test-results/booking-meet-greet/${engine}`;
await fs.mkdir(output,{recursive:true});
const servers=[];
async function serve(dir) {
 const root=path.resolve(dir);
 const server=http.createServer(async(req,res)=>{
  try {
   let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(pathname.endsWith('/'))pathname+='index.html';
   const file=path.resolve(root,'.'+pathname);
   if(!file.startsWith(root+path.sep))throw Error('path');
   const data=await fs.readFile(file);
   res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);
 return `http://127.0.0.1:${server.address().port}`;
}
const base=await serve('out');
const launch=engine==='chromium'&&process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage','--use-gl=disabled','--disable-gpu','--disable-software-rasterizer','--disable-webgl','--in-process-gpu','--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process']}:{};
const browsers=[];
async function quote(url,width,total=68,enabled=true,collection=true,fee=18.25) {
 const browser=await ({chromium,webkit}[engine]).launch(launch);browsers.push(browser);
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce',locale:'en-GB',timezoneId:'Europe/London'});
 const requests=[];
 const settings={enabled,percent:20,minimumGbp:15};
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin===url)return route.continue();
  const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(u.pathname.includes('/route/v1/driving'))return json({code:'Ok',routes:[{distance:26000,duration:1800,geometry:{coordinates:[[-5.9302,54.5964],[-6.2158,54.6575]],type:'LineString'}}]});
  if(u.pathname==='/pricing/public'){const config=defaultOwnerPricingSettings();config.meetGreet.bfsGbp=fee;return json({config:toPublicOwnerPricingConfig(config)});}
  if(u.pathname==='/quote/availability')return json({blocked:false,available:true,alternativeTimes:[]});
  if(u.pathname.endsWith('/quote/calculate')) {
   const j=req.postDataJSON();
   // The unchanged frontend adds the configured £5 BFS Express access fee.
   return json({ok:true,amount:total-5,amountLabel:`£${total-5}`,vehicleType:j.vehicleType,vehicleChoice:'Saloon',premiumApplied:false,returnJourney:false,journeyFareGbp:total-5,airportFixedCostsGbp:0,nightWeekendSurchargeGbp:0,distanceKm:25,durationMinutes:30,depositCash:publicDepositCashOffer(total-5,settings)});
  }
  if(req.method()==='POST'&&/payments$/.test(u.pathname)) {
   requests.push(req.postDataJSON());
   return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Isolated test: payment not sent to SumUp'})});
  }
  return route.abort();
 });
 const page=await context.newPage();
 page.setDefaultTimeout(15000);
 await page.goto(`${url}/?previewJourney=bfs`);
 await page.getByRole('button',{name:'Reject optional',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('pickup')?.value.includes('City Hall'));
 if(collection)await page.getByRole('button',{name:'Swap pickup and drop-off'}).click();
 await page.locator('#quote-section-passengers').selectOption('2');
 await page.locator('#quote-section-suitcases').selectOption('1');
 const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 await page.locator('#date').fill(date);await page.locator('#time').fill('12:00');
 await page.getByRole('button',{name:/Get My Fixed Price/}).last().click();
 await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).waitFor();
 await page.locator('[data-quote-result-price] [data-quote-fare-status="ready"]').waitFor();
 await page.evaluate(()=>document.fonts.ready);
 const card=page.locator('[data-quote-result-card]');
 const height=await card.evaluate(el=>el.getBoundingClientRect().height);
 return {context,page,card,height,requests};
}
try {
 for(const width of (process.env.TEST_WIDTH ? [Number(process.env.TEST_WIDTH)] : [320,390,1280])) {
  for(const collection of [false,true]) {
   const q=await quote(base,width,68,true,collection),{page}=q;
   assert.equal(await page.locator('[data-booking-meet-greet]').count(),0);
   await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).click();
   await page.locator('#name').waitFor();
   const section=page.locator('[data-booking-meet-greet]');
   assert.equal(await section.count(),collection?1:0);
   if(collection) {
    assert.match(await section.innerText(),/Meet & Greet Service — £18.25/);
    const checkbox=section.getByRole('checkbox');assert.equal(await checkbox.isChecked(),false);
    const pos=await page.evaluate(()=>({contact:document.querySelector('#email').getBoundingClientRect().bottom,service:document.querySelector('[data-booking-meet-greet]').getBoundingClientRect().top}));
    assert.ok(pos.service>=pos.contact);
    const options=page.locator('[data-booking-payment-options]');
    await options.getByRole('button',{name:/Pay in Full Online/}).click();
    const before=await page.getByRole('button',{name:/Pay £.*Confirm Booking/}).innerText();
    await checkbox.check();assert.match(await page.locator('[data-meet-greet-summary]').innerText(),/£18.25/);
    const after=await page.getByRole('button',{name:/Pay £.*Confirm Booking/}).innerText();
    const amount=s=>Number(s.match(/£([\d.]+)/)[1]);assert.equal(Math.round((amount(after)-amount(before))*100),1825);
    await checkbox.uncheck();assert.equal(await page.locator('[data-meet-greet-summary]').count(),0);
    assert.equal(await page.getByRole('button',{name:/Pay £.*Confirm Booking/}).innerText(),before);
    await checkbox.check();
    if(width===390) {
      await page.locator('#name').fill('Meet Greet Test');await page.locator('#mobile').fill('07700900123');await page.locator('#email').fill('test@example.invalid');
      for(const id of ['goingFlightNumber','collectionFlightNumber'])if(await page.locator(`#${id}`).count())await page.locator(`#${id}`).fill('BA1234');
      await page.getByRole('checkbox',{name:/I agree to the Terms/}).check();
      await page.getByRole('button',{name:/Pay £.*Confirm Booking/}).click();
      await page.waitForFunction(()=>document.body.innerText.includes('Isolated test: payment not sent to SumUp'));
      assert.equal(q.requests.length,1);assert.equal(q.requests[0].meetGreetSelected,true);
      assert.equal(q.requests[0].acceptedFinalAmountGbp,amount(after));
      await q.context.route('**/payments/confirm',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({amountPaid:`£${amount(after).toFixed(2)}`,paymentReference:'TEST-ONLY',customerReference:'MAT-TEST',customerEmailSent:true,ownerEmailSent:true,emailSent:true,calendarLogged:true,paymentMethod:'FULL_ONLINE',totalFare:amount(after),meetGreetFeeGbp:18.25})}));
    }
    await section.screenshot({path:`${output}/${width}-service.png`});
   }
   if(collection && width===390) {
     await page.goto(`${base}/booking-confirmed/?payment=return&checkout_id=isolated-confirmed`);
     await page.getByRole('heading',{name:'Booking confirmed',exact:true}).waitFor();
     assert.match(await page.locator('main').innerText(),/Meet & Greet: £18.25/);
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await q.context.close();console.log('PASS',width,collection?'airport collection toggles and total':'airport dropoff omitted');
  }
 }
} finally {
 await Promise.allSettled(browsers.map(browser=>browser.close()));for(const server of servers)server.close();
}
