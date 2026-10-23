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
async function quote(url,width,total=68,enabled=true,collection=false,returnTrip=false) {
 const browser=await ({chromium,webkit}[engine]).launch(launch);browsers.push(browser);
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce',locale:'en-GB',timezoneId:'Europe/London'});
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
 await page.goto(`${url}/?previewJourney=bfs`);
 await page.getByRole('button',{name:'Reject optional',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('pickup')?.value.includes('City Hall'));
 if(returnTrip) await page.getByRole('button',{name:/Return.*5%/}).first().click();
 if(collection) await page.getByRole('button',{name:'Swap pickup and drop-off',exact:true}).click();
 await page.locator('#quote-section-passengers').selectOption('2');
 await page.locator('#quote-section-suitcases').selectOption('1');
 const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 await page.locator('#date').fill(date);await page.locator('#time').fill('12:00');
 if(returnTrip) { await page.locator('#returnDate').fill(new Date(Date.now()+9*86400000).toISOString().slice(0,10));await page.locator('#returnTime').fill('12:00'); }
 await page.getByRole('button',{name:/Get My Fixed Price/}).last().click();
 await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).waitFor();
 await page.locator('[data-quote-result-price] [data-quote-fare-status="ready"]').waitFor();
 // WebKit can expose the ready text before its final font/layout paint.
 // Use the same resource + rendering-frame barrier as the vehicle stability test.
 await page.evaluate(async()=>{
  document.querySelector('[data-quote-fare-status="ready"]').getBoundingClientRect();
  await document.fonts.ready;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 });
 const card=page.locator('[data-quote-result-card]');
 const height=await card.evaluate(el=>el.getBoundingClientRect().height);
 const dimensions=await card.evaluate(el=>['[data-quote-result-price]','[data-quote-result-main-action] button','[data-quote-vehicle-summary]'].map(selector=>{const e=el.querySelector(selector),r=e.getBoundingClientRect(),s=getComputedStyle(e);return {width:r.width,height:r.height,fontSize:s.fontSize,color:s.color,background:s.backgroundColor};}));
 return {context,page,card,height,requests,dimensions};
}
try {
 for(const width of [320,360,375,390,1280]) {
  let before, beforeDimensions;
  if(baseline) {const b=await quote(baseline,width);before=b.height;beforeDimensions=b.dimensions;await b.context.close();}
  const q=await quote(base,width),{page,card}=q;
  assert.match(await card.innerText(),/£68/);
  const visible=card.locator('[data-quote-changing-info]');
  assert.match(await visible.innerText(),/Cancel 24\+ hours before pickup for a 100% refund\./);
  assert.match(await visible.innerText(),/Fixed Fares · Secure Booking/);
  assert.doesNotMatch(await visible.innerText(),/Complimentary Waiting Time/);
  assert.doesNotMatch(await visible.innerText(),/Terminal pick-up included|60 Minutes Airport Waiting|Your own pre-booked transfer/);
  const positions=await visible.evaluate(el=>({reassurance:el.querySelector('[data-quote-reassurance]').getBoundingClientRect().bottom,fare:el.querySelector('[data-quote-result-price]').getBoundingClientRect().top}));
  assert.ok(positions.reassurance<=positions.fare);
  if(beforeDimensions) assert.deepEqual(q.dimensions,beforeDimensions,"existing fare, button and vehicle sizes/styles must remain unchanged");
  await card.screenshot({path:`${output}/${width}-quote.png`});
  await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).click();
  await page.locator('#name').waitFor();
  const options=page.locator('[data-booking-payment-options]');await options.waitFor();
  assert.match(await options.innerText(),/£15.00 today/);assert.match(await options.innerText(),/£53.00 cash to your driver on pickup/);
  assert.doesNotMatch(await options.innerText(),/PAYMENT SUMMARY|Deposit \+ Cash selected/);
  const ack=options.getByRole('checkbox');
  const pay=page.getByRole('button',{name:'Pay £15.00 Deposit & Confirm Booking',exact:true});
  assert.equal(await ack.isChecked(),false);assert.equal(await pay.isEnabled(),false);
  const target=await ack.locator('..').boundingBox();assert.ok(target.height>=44);
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
   await page.waitForFunction(()=>document.body.innerText.includes('Isolated test: payment not sent to SumUp'));
   assert.equal(q.requests.length,1);assert.equal(q.requests[0].amount,68);assert.equal(q.requests[0].paymentMethod,'DEPOSIT_CASH');assert.equal(q.requests[0].cashAgreementAccepted,true);
   await options.getByRole('button',{name:/Pay in Full Online/}).click();await page.getByRole('button',{name:'Pay £68.00 & Confirm Booking',exact:true}).click();
   await page.waitForTimeout(500);
   assert.equal(q.requests.length,2);assert.equal(q.requests[1].amount,68);assert.equal(q.requests[1].paymentMethod,'FULL_ONLINE');assert.equal(q.requests[1].cashAgreementAccepted,undefined);
   assert.equal(await page.getByRole('heading',{name:'Booking confirmed',exact:true}).count(),0);
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
   await page.getByRole('heading',{name:'Booking confirmed',exact:true}).waitFor();
   assert.match(await page.locator('[data-confirmation-cancellation-policy]').innerText(),/at least 24 hours.*100% refund/);
   assert.match(await page.locator('main').innerText(),/£53.00/);
   await page.screenshot({path:`${output}/390-confirmation.png`,fullPage:true});

  }
  results.push({width,before,after:q.height,delta:before==null?null:q.height-before});console.log('PASS',width,'quote height',before,'→',q.height,'payment choices, acknowledgement, navigation, no overflow');
  await q.context.close();
 }
 for(const width of [320,390,1280]) {
  const q=await quote(base,width,68,true,true);
  const visible=q.card.locator('[data-quote-changing-info]');
  assert.match(await visible.innerText(),/60 Minutes Complimentary Waiting Time/);
  assert.doesNotMatch(await visible.innerText(),/airport pickups/i);
  assert.equal(await visible.locator('[data-quote-reassurance]').count(),1);
  assert.ok(await q.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await q.card.screenshot({path:`${output}/${width}-collection.png`});
  await q.context.close();console.log('PASS airport collection',width);
 }
 const returnQuote=await quote(base,390,68,true,false,true);
 assert.match(await returnQuote.card.locator('[data-quote-changing-info]').innerText(),/60 Minutes Complimentary Waiting Time/);
 await returnQuote.context.close();console.log('PASS collection on return leg');
 for(const [total,enabled] of [[100,true],[10,true],[68,false]]) {
  const q=await quote(base,390,total,enabled),{page,card}=q;
  assert.match(await card.innerText(),new RegExp(`£${total}`));
  const eligible=publicDepositCashOffer(total,{enabled,percent:20,minimumGbp:15}).eligible;
  assert.match(await card.locator('[data-quote-changing-info]').innerText(), /Book with Confidence/);
  await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).click();await page.locator('#name').waitFor();
  if(eligible)assert.match(await page.locator('[data-booking-payment-options]').innerText(),/£20.00 today[\s\S]*£80.00 cash/);
  else {assert.equal(await page.locator('[data-booking-payment-options]').count(),0);assert.equal(await page.getByRole('button',{name:`Pay £${total} & Confirm Booking`,exact:true}).count(),1);}
  await q.context.close();console.log('PASS eligibility',total,enabled);
 }
} finally {
 await fs.writeFile(`${output}/measurements.json`,JSON.stringify(results,null,2));await Promise.allSettled(browsers.map(browser=>browser.close()));for(const server of servers)server.close();
}
