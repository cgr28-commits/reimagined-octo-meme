// Run: PLAYWRIGHT_EXECUTABLE_PATH=/path/to/chromium node --import tsx scripts/check-deferred-quote-flights-browser.cjs
// All API responses are intercepted. No live requests, customer messages or payments are made.
const {chromium}=require('playwright'),assert=require('assert/strict'),fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..'),harness=path.join(root,'src/app/flight-stage-check/page.tsx');
if(fs.existsSync(harness))throw new Error('Refusing to replace an existing test route');
fs.mkdirSync(path.dirname(harness),{recursive:true});
fs.writeFileSync(harness,`'use client';import {useEffect,useState} from 'react';import QuoteCard from '@/components/QuoteCard';import {quickSelectToPlace} from '@/lib/selected-place';import {PREVIEW_BELFAST_CITY_HALL_PLACE} from '@/lib/preview-customer-quote';export default function Check(){const [codes,setCodes]=useState<string[]|null>(null);useEffect(()=>{const p=new URLSearchParams(location.search);setCodes([p.get('from')||'BHD',p.get('to')||'HOME']);},[]);if(!codes)return null;const place=(c:string)=>c==='HOME'?PREVIEW_BELFAST_CITY_HALL_PLACE:quickSelectToPlace(c as 'BFS'|'BHD'|'DUB');return <main className="mx-auto max-w-xl px-4 pt-24"><QuoteCard presentation="homepage" initialPickupPlace={place(codes[0])} initialDropoffPlace={place(codes[1])}/></main>}`);
const {defaultOwnerPricingSettings,toPublicOwnerPricingConfig}=require('../shared/owner-pricing-config.ts');
const config=toPublicOwnerPricingConfig(defaultOwnerPricingSettings());config.executive.requestQuote=true;config.minibus={...config.minibus,requestQuote:true,publicEnabled:true};
const date=new Date(Date.now()+10*86400000).toISOString().slice(0,10),retDate=new Date(Date.now()+12*86400000).toISOString().slice(0,10);
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3092'],{cwd:root,stdio:['ignore','pipe','pipe']});server.stdout.resume();server.stderr.resume();
let browser;let publicSummary,requestCount=0;const payments=[],errors=[],submitted=[];
(async()=>{for(let i=0;i<80;i++){try{await fetch('http://127.0.0.1:3092/',{signal:AbortSignal.timeout(1500)});break}catch{await new Promise(r=>setTimeout(r,500))}}
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});const c=await browser.newContext();
 await c.route('https://**/*',async r=>{const u=r.request().url();
  if(u.includes('/pricing/public'))return r.fulfill({json:{config}});
  if(u.includes('/route/v1/'))return r.fulfill({json:{code:'Ok',routes:[{distance:25000,duration:1500,geometry:{coordinates:[]}}]}});
  if(u.includes('/quote/calculate')){const q=r.request().postDataJSON();return r.fulfill({json:{ok:true,vehicleType:q.vehicleType,amount:65,journeyFareGbp:60,airportFixedCostsGbp:0,nightWeekendSurchargeGbp:0,distanceKm:25,durationMinutes:25}})}
  if(u.includes('/a2a-quotes/by-token'))return r.fulfill({json:{ok:true,quote:publicSummary}});
  if(u.endsWith('/a2a-quotes')){requestCount++;submitted.push(r.request().postDataJSON());return r.fulfill({json:{ok:true,reference:'MATNI-AQ-ISOLATED-TEST',status:'AWAITING_QUOTE'}})}
  if(u.endsWith('/bookings'))return r.fulfill({json:{ok:true,bookingReference:'MATNI-TEST',bookingSaved:true,emailSent:true}});
  if(u.endsWith('/payments')){payments.push(r.request().postDataJSON());return r.fulfill({json:{ok:true,checkoutId:'isolated-checkout',paymentUrl:'http://127.0.0.1:3092/sandbox-checkout'}})}
  if(u.includes('workers.dev'))return r.fulfill({json:{ok:true,available:true,blocked:false,settings:{}}});return r.abort();
 });
 await c.route('**/sandbox-checkout',r=>r.fulfill({body:'Isolated checkout test — no payment taken',contentType:'text/html'}));
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 const vehicles=['executive','minibus'];
 for(const width of [390,1280]){await p.setViewportSize({width,height:900});
  for(const airport of ['BFS','BHD','DUB'])for(const returning of [false,true])for(const vehicle of vehicles){
   await p.goto('http://127.0.0.1:3092/flight-stage-check?from='+airport+'&to=HOME');await p.locator('#quote-section-passengers').waitFor();const consent=p.getByRole('button',{name:'Essential only',exact:true});if(await consent.isVisible())await consent.click();await p.waitForTimeout(100);
   await p.evaluate(({date,retDate,returning})=>window.dispatchEvent(new CustomEvent('quote-prefill-draft',{detail:{passengers:1,suitcases:1,returnJourney:returning,tripDate:date,tripTime:'12:00',returnDate:retDate,returnTime:'12:00'}})),{date,retDate,returning});
   await p.getByRole('button',{name:'Get My Fixed Price',exact:false}).click();await p.locator('[data-quote-result-card]').waitFor();await p.locator('[data-vehicle-category='+vehicle+']').click();await p.locator('[data-quote-manual-state]').waitFor();await p.locator('#quote-book-now-button').click();
   await p.getByPlaceholder('John Smith').waitFor();assert.equal(await p.locator('#goingFlightNumber,#collectionFlightNumber,[id$="-flight-details"]').count(),0);
   await p.getByPlaceholder('John Smith').fill('Test Customer');await p.getByPlaceholder('07xxx xxxxxx').fill('07700900123');await p.getByPlaceholder('you@example.com').fill('test@example.com');await p.getByRole('checkbox',{name:/I agree to the/}).check();
   const before=requestCount;await p.getByRole('button',{name:'Submit Quote Request',exact:true}).click();await p.locator('#bookingRequestResult').waitFor();assert.equal(requestCount,before+1);assert.equal(submitted.at(-1).booking.flightNumber,'');
  }
  console.log('OK '+width+'px: both manual vehicles submit without flights at BFS/BHD/DUB, one-way and return');
 }
 const names={BFS:'Belfast International Airport (BFS)',BHD:'George Best Belfast City Airport (BHD)',DUB:'Dublin Airport (DUB)',HOME:'Belfast City Hall, Belfast BT1 5GS'};
 for(const [from,to,returning,outbound,inbound] of [['BHD','HOME',false,true,false],['HOME','BFS',true,false,true],['BFS','DUB',true,true,true],['HOME','DUB',false,false,false]]){
  publicSummary={reference:'MATNI-AQ-TEST',status:'QUOTE_APPROVED_AWAITING_PAYMENT',statusLabel:'Approved',amount:123,amountLabel:'£123.00',customerName:'Test Customer',pickupLabel:names[from],dropoffLabel:names[to],tripDate:date,tripTime:'12:00',returnDate:retDate,returnTime:'12:00',returnJourney:returning,passengers:1,suitcases:1,vehicle:'Executive Saloon (1–4 passengers)',quoteExpiresAt:new Date(Date.now()+3600000).toISOString(),payable:true,expired:false};
  await p.goto('http://127.0.0.1:3092/pay/a2a-quote/?token=isolated-test');await p.getByRole('button',{name:'Pay Securely',exact:true}).waitFor();
  assert.equal(await p.locator('#approved-quote-flight').count(),outbound?1:0);assert.equal(await p.locator('#approved-quote-return-flight').count(),inbound?1:0);
  const before=payments.length;
  if(outbound||inbound){await p.getByRole('button',{name:'Pay Securely',exact:true}).click();assert.equal(payments.length,before);assert.match(await p.locator('body').innerText(),/Enter a valid flight number/)}
  if(outbound)await p.locator('#approved-quote-flight').fill('BA1234');if(inbound)await p.locator('#approved-quote-return-flight').fill('EZY456');
  await p.getByRole('button',{name:'Pay Securely',exact:true}).click();await p.waitForURL('**/sandbox-checkout');assert.equal(payments.length,before+1);assert.equal(payments.at(-1).amount,123);
  if(outbound)assert.equal(payments.at(-1).quoteFlightDetails.flightNumber,'BA1234');if(inbound)assert.equal(payments.at(-1).quoteFlightDetails.returnFlightNumber,'EZY456');
 }
 assert.deepEqual(errors,[]);console.log('OK approved booking flight gates, return and airport-to-airport fields, no-flight drop-off, payload persistence, no JS exceptions');
 await browser.close();server.kill();fs.rmSync(path.dirname(harness),{recursive:true});
})().catch(async e=>{console.error(e);if(browser)await browser.close();server.kill();fs.rmSync(path.dirname(harness),{recursive:true});process.exitCode=1});
