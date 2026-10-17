import {spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium,webkit}=await import(process.env.MATNI_PLAYWRIGHT_MODULE || 'playwright-core');
const repository=fileURLToPath(new URL('../../',import.meta.url));
const site='http://127.0.0.1:3012';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3012'],{cwd:repository,env:{...process.env,NEXT_PUBLIC_BOOKINGS_API_URL:'http://127.0.0.1:8789/bookings',NEXT_PUBLIC_ADDRESSES_API_URL:'http://127.0.0.1:8789/addresses',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_GOOGLE_ADS_ID:'AW-1234567890'}});
process.on('exit',()=>server.kill('SIGTERM'));
server.stderr.on('data',b=>fs.appendFileSync('/tmp/matni-browser-server.log',b));
await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{fs.appendFileSync('/tmp/matni-browser-server.log',b);if(String(b).includes('Ready'))resolve()});server.on('exit',c=>reject(Error('server exit '+c)));setTimeout(()=>reject(Error('server timeout')),40000).unref()});
const launchBrowser=()=>process.env.MATNI_BROWSER==='webkit'?webkit.launch({headless:true}):chromium.launch({executablePath:process.env.MATNI_CHROMIUM_PATH,args:['--no-sandbox','--no-zygote','--single-process','--disable-gpu','--disable-software-rasterizer','--use-gl=disabled','--disable-dev-shm-usage'],headless:true});
const results=[];
async function run(choice,viewport={width:1280,height:900}){
 const browser=await launchBrowser();
 const context=await browser.newContext({viewport,isMobile:viewport.width<700,hasTouch:viewport.width<700,serviceWorkers:'block'});
 const page=await context.newPage();page.setDefaultTimeout(15000);
 const calls=[],unhandled=[],errors=[];let payment=null,confirmed=0;
 const address='10 Fictional Test Road, Belfast, BT1 1AA';
 const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin===site)return route.continue();
  calls.push({url:u.origin+u.pathname,method:req.method(),body:req.postData()});
  if(u.hostname==='www.googletagmanager.com')return route.fulfill({contentType:'application/javascript',body:'/* mocked Google script: never sends requests */'});
  if(u.hostname==='checkout.sumup.com')return route.fulfill({contentType:'text/html',body:`<h1>Mock SumUp Hosted Checkout</h1><button id="mock-pay" onclick="location.href='${site}/booking-confirmed/?checkout_id=TEST-CHECKOUT-${choice}'">Complete mock payment</button>`});
  if(u.port==='8789'){
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
   if(u.pathname==='/pricing/public')return json(route,{},503);
   if(u.pathname==='/booking-notice')return json(route,{ok:true,minimumBookingNoticeHours:1,minimumNoticeHours:1,automaticBookingsAvailableFrom:null,available:true});
   if(u.pathname==='/addresses')return u.searchParams.has('id')?json(route,{address,formattedAddress:address,displayAddress:address,placeId:'TEST-HOME',lat:54.60,lng:-5.93,countryCode:'GB',postalCode:'BT1 1AA',streetNumber:'10',route:'Fictional Test Road',locality:'Belfast'}):json(route,{suggestions:[{id:'TEST-HOME',label:address,address,mainText:'10 Fictional Test Road',secondaryText:'Belfast, BT1 1AA'}]});
   if(u.pathname==='/quote/calculate'){const b=req.postDataJSON();return json(route,{ok:true,amount:50,amountLabel:'£50.00',vehicleType:b.vehicleType||b.vehicle||'Saloon',vehicleChoice:'Saloon',returnJourney:false,journeyFareGbp:50,airportFixedCostsGbp:0,quoteReceipt:'v1.TEST.MOCK',diagnostics:{distanceKm:20,routeDurationMinutes:30},minimumBookingNoticeHours:1,smartAvailability:{enforced:false,available:true,blocked:false}})}
   if(u.pathname==='/quote/availability')return json(route,{available:true,blocked:false,minimumBookingNoticeHours:1});
   if(u.pathname==='/measurement/withdraw')return json(route,{ok:true});
   if(u.pathname==='/ad-fraud/events'||u.pathname==='/quote-leads'||u.pathname==='/bookings')return json(route,{ok:true,reference:'TEST-REQUEST'});
   if(u.pathname==='/payments'){payment=req.postDataJSON();return json(route,{ok:true,paymentUrl:`https://checkout.sumup.com/TEST-${choice}`,checkoutId:`TEST-CHECKOUT-${choice}`,checkoutReference:`TEST-PAYMENT-${choice}`,bookingSaved:true,bookingReference:`TEST-BOOKING-${choice}`})}
   if(u.pathname==='/payments/confirm'){confirmed++;return json(route,{ok:true,paid:true,amountPaid:'£'+Number(payment?.amount||50).toFixed(2),paymentReference:`TEST-PAYMENT-${choice}`,customerReference:'MAT-9999',emailSent:true,customerEmailSent:true,ownerEmailSent:true,calendarLogged:true,calendarEvents:1,trackingCreated:true,purchase:{transactionId:`TEST-PAYMENT-${choice}`,bookingReference:'MAT-9999',value:payment?.amount||50,currency:'GBP'}})}
   unhandled.push(u.pathname);return json(route,{ok:true});
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
  await page.locator('#date').fill('2026-12-10');await page.locator('#time').fill('10:30');await page.locator('#time').blur();
  const next=page.getByRole('button',{name:/Continue to (your |enter your )?details|Continue to payment|Continue to booking|Confirm travel details/i});
  if(await next.count())await next.first().click();
  await page.locator('#name').fill('Fictional Browser Test');await page.locator('#mobile').fill('07700900000');await page.locator('#email').fill('audit@example.invalid');
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
  assert.equal(Boolean(payment.booking.attribution),choice==='accept');
  assert.ok(payment.booking.tripDate && payment.booking.tripTime, 'travel schedule survives');
  assert.ok(!hosted.url().includes('gclid'),'no marketing identifiers in checkout URL');
  await hosted.locator('#mock-pay').click();
  await hosted.getByText(/Your booking is confirmed/).first().waitFor({timeout:60000});
  const body=await hosted.locator('body').innerText();assert.ok(body.includes('MAT-9999'));assert.ok(body.includes('£'+Number(payment.amount).toFixed(2))||body.includes('£'+payment.amount));
  await hosted.goto(site+`/booking-confirmed/?checkout_id=TEST-CHECKOUT-${choice}`,{waitUntil:'domcontentloaded'});await hosted.getByText(/Your booking is confirmed/).first().waitFor();assert.equal(confirmed,1,'confirmation cache does not request confirmation twice');
  if(choice==='decline')assert.equal(calls.filter(r=>r.url.includes('googletagmanager')||r.url.includes('ad-fraud')).length,0,'declined journey makes no optional requests');
  const purchaseEvents=await hosted.evaluate(()=>JSON.stringify(window.dataLayer||[]));assert.ok(!purchaseEvents.includes('purchase'),'no browser purchase event');
  if(choice==='accept'){
    const countBefore=calls.filter(r=>r.url.includes('googletagmanager')).length;
    await hosted.getByRole('button',{name:'Cookie Settings',exact:true}).click();
    await hosted.getByRole('dialog',{name:'Cookie settings'}).getByRole('button',{name:'Essential only',exact:true}).click();
    await hosted.waitForFunction(()=>JSON.parse(localStorage.getItem('matni-cookie-consent-v2')).advertising===false);
    await hosted.waitForLoadState('domcontentloaded');
    await hosted.waitForTimeout(300);
    assert.ok(calls.some(r=>r.url.endsWith('/measurement/withdraw')),'withdrawal sent');
    await hosted.goto(site+`/booking-confirmed/?checkout_id=TEST-CHECKOUT-${choice}`,{waitUntil:'domcontentloaded'});
    await hosted.getByText(/Your booking is confirmed/).first().waitFor();
    assert.equal(calls.filter(r=>r.url.includes('googletagmanager')).length,countBefore,'withdrawn consent blocks tag on subsequent documents');
    const optional=await hosted.evaluate(()=>[...Object.keys(localStorage),...Object.keys(sessionStorage)].filter(k=>/^matni-(ads|funnel|ad-fraud)-/.test(k)));
    assert.deepEqual(optional,[],'withdrawal clears optional storage');
  }
  assert.deepEqual(unhandled,[],'all external services are explicitly mocked');
  assert.deepEqual(errors,[],'no uncaught browser exceptions');
  results.push({choice,status:'passed',viewport,paymentAmount:payment.amount,confirmed,optionalRequestCount:calls.filter(r=>r.url.includes('googletagmanager')||r.url.includes('ad-fraud')).length,unhandled,errors,calls});
  console.log('PASS full quote-to-mocked-SumUp-confirmation journey',choice,viewport.width);
 }catch(e){console.error('FAIL',choice,e.message);console.log('BODY',(await page.locator('body').innerText()).slice(0,9000));results.push({choice,status:'failed',error:e.message,calls,unhandled,errors});}
 await context.close();await browser.close();
}
try{await run('decline');await run('accept');await run('decline',{width:390,height:844});await run('accept',{width:390,height:844});}finally{fs.writeFileSync('/tmp/matni-browser-results.json',JSON.stringify(results,null,2));if(results.some(r=>r.status!=='passed'))process.exitCode=1;server.kill('SIGTERM');}
