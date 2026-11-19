/** Static-export conversion checks. Every non-static request is intercepted; no live writes. */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';
import { publicDepositCashOffer } from '../shared/deposit-cash';
import { setQuoteCount } from './playwright-quote-count.mjs';
import { skipCookieConsent } from './playwright-cookie-consent.mjs';
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(`${process.env.PLAYWRIGHT_MODULE}/index.mjs`).href : 'playwright');
const engine=process.env.PLAYWRIGHT_BROWSER || 'chromium';
const output=`test-results/booking-conversion/${engine}`;
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
const baseline=process.env.BASELINE_OUT_DIR ? await serve(process.env.BASELINE_OUT_DIR) : null;
const launch=engine==='chromium'&&process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage','--use-gl=disabled','--disable-gpu','--disable-software-rasterizer','--disable-webgl','--in-process-gpu','--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process']}:{};
const browsers=[];
const results=[];
async function quote(url,width,total=68,enabled=true,collection=false,returnTrip=false,classic=false) {
 const browser=await ({chromium,webkit}[engine]).launch(launch);browsers.push(browser);
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce',locale:'en-GB',timezoneId:'Europe/London'});
 await skipCookieConsent(context);
 const requests=[];
 const settings={enabled,percent:20,minimumGbp:15};
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin===url)return route.continue();
  const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(u.pathname.includes('/route/v1/driving'))return json({code:'Ok',routes:[{distance:26000,duration:1800,geometry:{coordinates:[[-5.9302,54.5964],[-6.2158,54.6575]],type:'LineString'}}]});
  if(u.pathname==='/pricing/public')return json({config:toPublicOwnerPricingConfig(defaultOwnerPricingSettings())});
  if(u.pathname==='/quote/availability')return json({blocked:false,available:true,alternativeTimes:[]});
  if(u.pathname.endsWith('/quote/calculate')) {
   const j=req.postDataJSON();
   // Belfast Free Airport Access is the default; Express is optional and not auto-added.
   return json({ok:true,amount:total,amountLabel:`£${total}`,vehicleType:j.vehicleType,vehicleChoice:'Saloon',premiumApplied:false,returnJourney:false,journeyFareGbp:total,airportFixedCostsGbp:0,nightWeekendSurchargeGbp:0,distanceKm:25,durationMinutes:30,depositCash:publicDepositCashOffer(total,settings)});
  }
  if(req.method()==='POST'&&/payments$/.test(u.pathname)) {
   requests.push(req.postDataJSON());
   // 4xx keeps the attempt retryable; 5xx marks payment uncertain and blocks a second pay.
   return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Isolated test: payment not sent to SumUp'})});
  }
  return route.abort();
 });
 const page=await context.newPage();
 // Swap control was removed from the homepage; seed collection via previewCollection.
 await page.goto(`${url}/?previewJourney=bfs${collection?'&previewCollection=1':''}${classic?'&mobile=classic':''}`);
 await page.waitForFunction((wantCollection)=>{
  const pickup=document.getElementById('pickup')?.value||'';
  return wantCollection ? /Airport|International/i.test(pickup) : pickup.includes('City Hall');
 },collection);
 if(returnTrip) await page.getByRole('button',{name:/Return.*5%/}).first().click();
 await setQuoteCount(page,'passengers',2);
 await setQuoteCount(page,'suitcases',1);
 const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 await page.locator('#date').fill(date);await page.locator('#time').fill('12:00');
 if(returnTrip) { await page.locator('#returnDate').fill(new Date(Date.now()+9*86400000).toISOString().slice(0,10));await page.locator('#returnTime').fill('12:00'); }
 await page.getByRole('button',{name:/Get My Fixed Price/}).last().click();
 const mobile = width < 1200 && !classic;
 const card = page.locator(mobile ? '#quote-results-summary' : '[data-quote-result-card]');
 const price = card.locator(mobile ? '[data-d2-sticky-price] strong' : '[data-quote-result-price] [data-quote-fare-status="ready"]');
 await price.filter({hasText:`£${total}`}).waitFor();
 const book = card.getByRole('button',{name:/BOOK THIS TRANSFER|Continue (?:with|to booking)/i});
 await book.waitFor();
 await page.evaluate(async()=>{
  await document.fonts.ready;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 });
 const included = card.locator(mobile ? '[data-d3-included]' : width>=1200 ? '[data-results-included]' : '[data-quote-changing-info] [data-quote-reassurance]');
 await included.waitFor();
 const vehicle = card.locator(mobile ? '[data-vehicle-category][aria-pressed="true"]' : '[data-quote-vehicle-summary]');
 const dimensions = await Promise.all([price, book, vehicle].map(locator=>locator.evaluate(el=>{
  const r=el.getBoundingClientRect(), s=getComputedStyle(el);
  return {width:r.width,height:r.height,fontSize:s.fontSize,color:s.color,background:s.backgroundColor};
 })));
 const height=await card.evaluate(el=>el.getBoundingClientRect().height);
 return {context,page,card,height,requests,dimensions,book,included};
}
try {
 for(const width of [320,360,375,390,1280]) {
  let before, beforeDimensions;
  if(baseline) {const b=await quote(baseline,width);before=b.height;beforeDimensions=b.dimensions;await b.context.close();}
  const q=await quote(base,width),{page,card}=q;
  assert.match(await card.innerText(),/£68/);
  const benefits = await q.included.innerText();
  assert.match(benefits,/10 minutes’ complimentary waiting at pickup/i);
  assert.match(benefits,/Free cancellation up to 24 hours before pickup/i);
  assert.doesNotMatch(benefits,/60 minutes|Terminal pick-up included|Your own pre-booked transfer/i);
  if(width>=1200) assert.match(benefits,/Fixed price, confirmed before you pay/);
  if(width<1200) {
   const sticky=await card.locator('[data-d2-sticky]').boundingBox();
   assert.ok(sticky && sticky.y>=0 && sticky.y+sticky.height<=901,'The fare and continue button must be on screen');
  }
  // Phones and tablets must match the baseline exactly. From 1200px the unified desktop
  // journey restyles the price panel on purpose, so only its behaviour is checked there.
  if(beforeDimensions && width<1200) assert.deepEqual(q.dimensions,beforeDimensions,"existing fare, button and vehicle sizes/styles must remain unchanged");
  await card.screenshot({path:`${output}/${width}-quote.png`});
  await q.book.click();
  await page.locator('#name').waitFor();
  const options=page.locator('[data-booking-payment-options]');await options.waitFor();
  assert.match(await options.innerText(),/£15.00 today/);assert.match(await options.innerText(),/£53.00 cash on the day/);
  assert.doesNotMatch(await options.innerText(),/PAYMENT SUMMARY|Deposit \+ Cash selected/);
  const ack=options.getByRole('checkbox');
  const pay=page.getByRole('button',{name:'Pay £15.00 Deposit & Confirm Booking',exact:true});
  assert.equal(await ack.isChecked(),false);assert.equal(await pay.isEnabled(),false);
  const target=await ack.locator('..').boundingBox();
  // Desktop payment rows sit ~26px; mobile keeps the 44px touch floor.
  assert.ok(target && target.height>=(width<768?44:24), `cash agreement target too small: ${target?.height}`);
  await ack.check();assert.equal(await pay.isEnabled(),true);
  await options.getByRole('button',{name:/Pay in Full Online/}).click();
  assert.equal(await options.getByRole('checkbox').count(),0);assert.doesNotMatch(await options.innerText(),/Remaining £53.00 payable/);
  assert.equal(await page.getByRole('button',{name:'Pay £68.00 & Confirm Booking',exact:true}).isEnabled(),true);
  await options.getByRole('button',{name:/Deposit \+ Cash/}).click();
  assert.equal(await ack.isChecked(),false);assert.equal(await pay.isEnabled(),false);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await options.locator("..").screenshot({path:`${output}/${width}-payment-options.png`});
  if(width===390) {
   await page.locator('#name').fill('Conversion Test');await page.locator('#mobile').fill('07700900123');await page.locator('#email').fill('conversion@example.invalid');
   await page.getByRole('checkbox',{name:/I agree to the Terms/}).check();
   await ack.check();await pay.click();
   for (let i = 0; i < 50 && q.requests.length < 1; i++) await page.waitForTimeout(100);
   assert.equal(q.requests.length,1);assert.equal(q.requests[0].amount,68);assert.equal(q.requests[0].paymentMethod,'DEPOSIT_CASH');assert.equal(q.requests[0].cashAgreementAccepted,true);
   await page.getByText(/Isolated test: payment not sent to SumUp|couldn.?t start payment|couldn.?t confirm whether your payment|payment link was created|try again/i).waitFor({timeout:10000});
   await options.getByRole('button',{name:/Pay in Full Online/}).click();
   const fullPay=page.getByRole('button',{name:'Pay £68.00 & Confirm Booking',exact:true});
   await fullPay.waitFor({state:'visible'});
   await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(btn=>/Pay £68\.00 & Confirm Booking/.test(btn.textContent||'')&&!btn.disabled),null,{timeout:10000});
   await fullPay.click();
   await page.waitForTimeout(500);
   assert.equal(q.requests.length,2);assert.equal(q.requests[1].amount,68);assert.equal(q.requests[1].paymentMethod,'FULL_ONLINE');assert.equal(q.requests[1].cashAgreementAccepted,undefined);
   assert.equal(await page.getByRole('heading',{name:'Thank You for Your Booking',exact:true}).count(),0);
   let confirmed=false;
   await q.context.route('**/payments/confirm',async route=> {
    if(!confirmed)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Payment has not been completed'})});
    return route.fulfill({contentType:'application/json',body:JSON.stringify({amountPaid:'£15.00',paymentReference:'TEST-ONLY',customerReference:'MAT-TEST',customerEmailSent:true,ownerEmailSent:true,emailSent:true,calendarLogged:true,paymentMethod:'DEPOSIT_CASH',totalFare:68,onlineAmountPaid:15,cashBalanceDue:53})});
   });
   await page.goto(`${base}/booking-confirmed/?payment=return&checkout_id=isolated-pending`);
   await page.getByRole('heading',{name:'Payment processing',exact:true}).waitFor();
   assert.equal(await page.locator('[data-confirmation-cancellation-policy]').count(),0);
   confirmed=true;
   await page.goto(`${base}/booking-confirmed/?payment=return&checkout_id=isolated-confirmed`);
   await page.getByRole('heading',{name:'Thank You for Your Booking',exact:true}).waitFor();
   assert.match(await page.locator('[data-confirmation-cancellation-policy]').innerText(),/at least 24 hours.*100% refund/);
   assert.match(await page.locator('main').innerText(),/£53.00/);
   await page.screenshot({path:`${output}/390-confirmation.png`,fullPage:true});

  }
  results.push({width,before,after:q.height,delta:before==null?null:q.height-before});console.log('PASS',width,'quote height',before,'→',q.height,'payment choices, acknowledgement, navigation, no overflow');
  await q.context.close();
 }
 for(const width of [320,390,1280]) {
  const q=await quote(base,width,68,true,true);
  const benefits=await q.included.innerText();
  assert.match(benefits,/60 minutes’ (?:free|complimentary) waiting from your flight/i);
  assert.match(benefits,/Free cancellation up to 24 hours before pickup/i);
  assert.ok(await q.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await q.card.screenshot({path:`${output}/${width}-collection.png`});
  await q.context.close();console.log('PASS airport collection',width);
 }
 // The classic result card also describes an airport collection on the return leg.
 const returnQuote=await quote(base,390,68,true,false,true,true);
 assert.match(await returnQuote.included.innerText(),/60 Minutes Complimentary Waiting Time/);
 assert.match(await returnQuote.included.innerText(),/Fixed Fares · Secure Booking/);
 await returnQuote.context.close();console.log('PASS collection on return leg');
 for(const [total,enabled] of [[100,true],[10,true],[68,false]]) {
  const q=await quote(base,390,total,enabled),{page,card}=q;
  assert.match(await card.innerText(),new RegExp(`£${total}`));
  const eligible=publicDepositCashOffer(total,{enabled,percent:20,minimumGbp:15}).eligible;
  assert.match(await q.included.innerText(), /Free cancellation up to 24 hours before pickup/i);
  await q.book.click();await page.locator('#name').waitFor();
  if(eligible)assert.match(await page.locator('[data-booking-payment-options]').innerText(),/£20.00 today[\s\S]*£80.00 cash/);
  else {assert.equal(await page.locator('[data-booking-payment-options]').count(),0);assert.equal(await page.getByRole('button',{name:`Pay £${total} & Confirm Booking`,exact:true}).count(),1);}
  await q.context.close();console.log('PASS eligibility',total,enabled);
 }
} finally {
 await fs.writeFile(`${output}/measurements.json`,JSON.stringify(results,null,2));await Promise.allSettled(browsers.map(browser=>browser.close()));for(const server of servers)server.close();
}
