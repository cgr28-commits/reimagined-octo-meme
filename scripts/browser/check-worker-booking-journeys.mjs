import {spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium,webkit}=await import(process.env.MATNI_PLAYWRIGHT_MODULE || 'playwright-core');
const repository=fileURLToPath(new URL('../../',import.meta.url));
const site='http://127.0.0.1:3000';
const worker=spawn(process.execPath,['--import','tsx','scripts/browser/mock-worker-server.mts'],{cwd:repository,env:{PATH:process.env.PATH}});
process.on('exit',()=>worker.kill('SIGTERM'));
worker.stderr.on('data',b=>fs.appendFileSync('/tmp/matni-worker-http.log',b));
await new Promise((resolve,reject)=>{worker.stdout.on('data',b=>{fs.appendFileSync('/tmp/matni-worker-http.log',b);if(String(b).includes('adapter ready'))resolve()});worker.on('exit',c=>reject(Error('worker exit '+c)));setTimeout(()=>reject(Error('worker readiness timeout')),20000).unref()});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3000'],{cwd:repository,env:{...process.env,NEXT_PUBLIC_BOOKINGS_API_URL:'http://127.0.0.1:8789/bookings',NEXT_PUBLIC_ADDRESSES_API_URL:'http://127.0.0.1:8789/addresses',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_GOOGLE_ADS_ID:'AW-1234567890'}});
process.on('exit',()=>server.kill('SIGTERM'));
server.stderr.on('data',b=>fs.appendFileSync('/tmp/matni-browser-server.log',b));
await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{fs.appendFileSync('/tmp/matni-browser-server.log',b);if(String(b).includes('Ready'))resolve()});server.on('exit',c=>reject(Error('server exit '+c)));setTimeout(()=>reject(Error('server timeout')),40000).unref()});
const launchBrowser=()=>process.env.MATNI_BROWSER==='webkit'?webkit.launch({headless:true}):chromium.launch({executablePath:process.env.MATNI_CHROMIUM_PATH,args:['--no-sandbox','--no-zygote','--single-process','--disable-gpu','--disable-software-rasterizer','--use-gl=disabled','--disable-dev-shm-usage'],headless:true});
const results=[];
async function run(choice,viewport={width:1280,height:900},withdrawMidBooking=false){
 const browser=await launchBrowser();
 const context=await browser.newContext({viewport,isMobile:viewport.width<700,hasTouch:viewport.width<700,serviceWorkers:'block'});
 const page=await context.newPage();page.setDefaultTimeout(15000);
 const calls=[],unhandled=[],errors=[];let payment=null,confirmed=0;
 const address='10 Fictional Test Road, Belfast, BT1 1AA';
 const tripDate='2026-12-'+String(10+(choice==='accept'?1:0)+(viewport.width<700?2:0)+(withdrawMidBooking?4:0));
 const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin===site)return route.continue();
  calls.push({url:u.origin+u.pathname,method:req.method(),body:req.postData()});
  if(u.hostname==='www.googletagmanager.com')return route.fulfill({contentType:'application/javascript',body:'/* mocked Google script: never sends requests */'});
  if(u.hostname==='checkout.sumup.com')return route.fulfill({contentType:'text/html',body:`<h1>Mock SumUp Hosted Checkout</h1><button id="mock-pay" onclick="location.href='${site}/booking-confirmed/?checkout_id=${u.pathname.slice(1)}'">Complete mock payment</button>`});
  if(u.port==='8789'){
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
   if(u.pathname==='/addresses')return u.searchParams.has('id')?json(route,{address,formattedAddress:address,displayAddress:address,placeId:'TEST-HOME',lat:54.60,lng:-5.93,countryCode:'GB',postalCode:'BT1 1AA',streetNumber:'10',route:'Fictional Test Road',locality:'Belfast'}):json(route,{suggestions:[{id:'TEST-HOME',label:address,address,mainText:'10 Fictional Test Road',secondaryText:'Belfast, BT1 1AA'}]});
   if(u.pathname==='/payments')payment=req.postDataJSON();
   if(u.pathname==='/payments/confirm')confirmed++;
   return route.continue();
  }
  if(u.pathname.includes('/route/v1/'))return json(route,{code:'Ok',routes:[{distance:20000,duration:1800,geometry:{coordinates:[]}}]});
  unhandled.push(u.origin+u.pathname);return route.abort('blockedbyclient');
 });
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(site+'/?gclid=TEST-CLICK&utm_source=google&utm_medium=cpc&utm_campaign=fictional',{waitUntil:'domcontentloaded',timeout:90000});
  const dialog=page.getByRole('dialog',{name:'Cookie settings'});await dialog.waitFor();
  assert.equal(calls.filter(r=>r.url.includes('googletagmanager')||r.url.includes('ad-fraud')).length,0,'no optional requests before consent');
  await dialog.getByRole('button',{name:choice==='accept'?'Accept measurement':'Essential only',exact:true}).click();await dialog.waitFor({state:'hidden'});
  const c=await page.evaluate(()=>JSON.parse(localStorage.getItem('matni-cookie-consent-v2')));assert.equal(c.advertising,choice==='accept');assert.equal(c.personalization,false);
  if(choice==='accept')await page.waitForFunction(()=>document.querySelector('script[src*="googletagmanager.com/gtag"]'));
  if (viewport.width < 700) assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), 'mobile consent/quote has no horizontal overflow');
  await page.locator('#pickup').fill('10 Fictional Test Road');
  await page.getByRole('button').filter({hasText:'10 Fictional Test Road'}).first().click();
  await page.locator('#dropoff').fill('Belfast International Airport');

  await page.getByRole('button').filter({hasText:/Belfast International Airport/}).first().click();
  await page.locator('#quote-section-passengers').selectOption('1');await page.locator('#quote-section-suitcases').selectOption('1');
  await page.getByRole('button',{name:'Get My Fixed Price →',exact:true}).click();
  await page.getByRole('button',{name:/^BOOK THIS TRANSFER/}).click();
  await page.locator('#date').fill(tripDate);await page.locator('#time').fill('10:30');await page.locator('#time').blur();
  const next=page.getByRole('button',{name:/Continue to (your |enter your )?details|Continue to payment|Continue to booking|Confirm travel details/i});
  if(await next.count())await next.first().click();
  await page.locator('#name').fill('Fictional Browser Test');await page.locator('#mobile').fill('07700900000');await page.locator('#email').fill('audit@example.invalid');
  if(withdrawMidBooking){
   const navigation=page.waitForEvent('domcontentloaded');
   await page.getByRole('button',{name:'Cookie Settings',exact:true}).click();
   await page.getByRole('button',{name:'Essential only',exact:true}).click();await navigation;
   await page.locator('#name').waitFor();assert.equal(await page.locator('#name').inputValue(),'Fictional Browser Test');
   assert.equal(await page.locator('#email').inputValue(),'audit@example.invalid');
   const draft=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('matni-booking-draft-v1')));assert.ok(draft.pickupAddress.includes('Fictional'));assert.equal(draft.tripDate,tripDate);
  }
  await page.getByRole('checkbox',{name:/I agree to the/}).check();
  await page.getByRole('button',{name:/Confirm booking & pay securely/}).click();
  await page.waitForFunction(()=>!!localStorage.getItem('my-airport-taxi-ni-pending-payment')||!!document.body.innerText.match(/Continue to SumUp|Mock SumUp/),null,{timeout:15000}).catch(()=>{});
  let hosted=page;
  const continueButton=page.getByRole('button',{name:/Continue to SumUp/});
  if(await continueButton.count()){
   const pop=context.waitForEvent('page',{timeout:15000});await continueButton.first().click();hosted=await pop;
  }
  await hosted.getByRole('heading',{name:'Mock SumUp Hosted Checkout'}).waitFor();
  assert.ok(payment,'payment request made');assert.equal(payment.booking.customerEmail,'audit@example.invalid');
  assert.equal(Boolean(payment.booking.attribution),choice==='accept'&&!withdrawMidBooking);
  assert.ok(payment.booking.tripDate && payment.booking.tripTime, 'travel schedule survives');
  assert.ok(!hosted.url().includes('gclid'),'no marketing identifiers in checkout URL');
  const providerCheckoutId=new URL(hosted.url()).pathname.slice(1);
  const providerResponse=await context.request.get('http://127.0.0.1:8789/__test/pay?id='+providerCheckoutId);assert.equal(providerResponse.status(),200);
  const beforeReturn=await providerResponse.json();assert.ok(beforeReturn.records.some(r=>r.checkoutId===providerCheckoutId&&r.paymentStatus==='paid'),'real webhook records payment before browser return');assert.ok(beforeReturn.duplicateStable.every(Boolean),'duplicate webhook sends no additional notifications');
  await hosted.locator('#mock-pay').click();
  await hosted.getByText(/Your booking is confirmed/).first().waitFor({timeout:60000});
  const state=await (await context.request.get('http://127.0.0.1:8789/__test/state')).json();
  assert.equal(state.blocked.length,0,'no unmocked provider requests');assert.ok(state.emails>=2);
  const paid=state.records.at(-1);assert.equal(paid.status,'confirmed');assert.equal(paid.paymentStatus,'paid');assert.equal(paid.customerEmail,'audit@example.invalid');assert.equal(paid.amount,payment.amount);
  assert.equal(paid.googleAdsPaidConversionSentAt,undefined,'upload gate remains disabled');
  const lastCheckout=state.checkouts.at(-1).id;
  const body=await hosted.locator('body').innerText();assert.ok(!!body.match(/MAT-\d+/));assert.ok(body.includes('£'+Number(payment.amount).toFixed(2))||body.includes('£'+payment.amount));
  await hosted.goto(site+`/booking-confirmed/?checkout_id=${lastCheckout}`,{waitUntil:'domcontentloaded'});await hosted.getByText(/Your booking is confirmed/).first().waitFor();assert.equal(confirmed,1,'confirmation cache does not request confirmation twice');
  if(choice==='decline')assert.equal(calls.filter(r=>r.url.includes('googletagmanager')||r.url.includes('ad-fraud')).length,0,'declined journey makes no optional requests');
  const purchaseEvents=await hosted.evaluate(()=>JSON.stringify(window.dataLayer||[]));assert.ok(!purchaseEvents.includes('purchase'),'no browser purchase event');
  if(choice==='accept'&&!withdrawMidBooking){
    const countBefore=calls.filter(r=>r.url.includes('googletagmanager')).length;
    await hosted.getByRole('button',{name:'Cookie Settings',exact:true}).click();
    await hosted.getByRole('dialog',{name:'Cookie settings'}).getByRole('button',{name:'Essential only',exact:true}).click();
    await hosted.waitForFunction(()=>JSON.parse(localStorage.getItem('matni-cookie-consent-v2')).advertising===false);
    await hosted.waitForLoadState('domcontentloaded');
    await hosted.waitForTimeout(300);
    assert.ok(calls.some(r=>r.url.endsWith('/measurement/withdraw')),'withdrawal sent');
    await hosted.goto(site+`/booking-confirmed/?checkout_id=${lastCheckout}`,{waitUntil:'domcontentloaded'});
    await hosted.getByText(/Your booking is confirmed/).first().waitFor();
    assert.equal(calls.filter(r=>r.url.includes('googletagmanager')).length,countBefore,'withdrawn consent blocks tag on subsequent documents');
    const optional=await hosted.evaluate(()=>[...Object.keys(localStorage),...Object.keys(sessionStorage)].filter(k=>/^matni-(ads|funnel|ad-fraud)-/.test(k)));
    assert.deepEqual(optional,[],'withdrawal clears optional storage');
  }
  assert.deepEqual(unhandled,[],'all external services are explicitly mocked');
  assert.deepEqual(errors,[],'no uncaught browser exceptions');
  results.push({choice,withdrawMidBooking,status:'passed',viewport,paymentAmount:payment.amount,confirmed,optionalRequestCount:calls.filter(r=>r.url.includes('googletagmanager')||r.url.includes('ad-fraud')).length,unhandled,errors,calls});
  console.log('PASS real Worker booking/payment/webhook/notification journey',choice,viewport.width,withdrawMidBooking?'mid-booking withdrawal':'');
 }catch(e){console.error('FAIL',choice,e.message);console.log('BODY',(await page.locator('body').innerText()).slice(0,9000));results.push({choice,status:'failed',error:e.message,calls,unhandled,errors});}
 await context.close();await browser.close();
}
try{if(process.env.MATNI_WITHDRAW_MID_BOOKING==='true'){await run('accept',{width:1280,height:900},true);await run('accept',{width:390,height:844},true);}else{await run('decline');await run('accept');await run('decline',{width:390,height:844});await run('accept',{width:390,height:844});}}finally{fs.writeFileSync('/tmp/matni-worker-journey-results.json',JSON.stringify(results,null,2));if(results.some(r=>r.status!=='passed'))process.exitCode=1;server.kill('SIGTERM');worker.kill('SIGTERM');}
