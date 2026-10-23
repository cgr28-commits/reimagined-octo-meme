/** Browser tests against static files, with all service calls intercepted. No live writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(`${process.env.PLAYWRIGHT_MODULE}/index.mjs`).href : 'playwright');
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config.ts';
import { DEFAULT_SAVE_QUOTE_SETTINGS } from '../shared/save-quote-settings.ts';
import { ESTATE_VEHICLE } from '../src/lib/vehicle-selection.ts';
const base='http://localhost:3000',root=path.resolve('out');
const token='a'.repeat(48);
const journey={pickupLabel:'Belfast City Hall, Belfast BT1 5GS, UK',dropoffLabel:'Belfast International Airport (BFS), BT29 4AB',pickupPlaceName:'Belfast City Hall',pickupCountryCode:'GB',pickupPostalCode:'BT1 5GS',pickupPlaceId:'city-hall',dropoffPlaceId:'airport-bfs',pickupLat:54.5966472,pickupLng:-5.9300677,dropoffLat:54.6575,dropoffLng:-6.2158,airportCode:'BFS',isAirportTrip:true,isFromAirport:false,tripDate:'2027-12-01',tripTime:'12:00',returnJourney:true,returnDate:'2027-12-05',returnTime:'12:00',passengers:2,suitcases:1,vehicle:ESTATE_VEHICLE,tripLabel:'Airport transfer'};
const quote={reference:'MAT-TEST-1234',token,customerName:'',customerEmail:'',status:'saved',createdAt:'2026-10-23T10:00:00Z',expiresAt:'2026-10-30T10:00:00Z',expiresAtLabel:'30 October 2026',amount:120,amountLabel:'£120.00',currency:'GBP',journey,bookUrl:base+'/quote/#t='+token};
await fs.mkdir('test-results/save-my-quote',{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox']});
try {
 for(const width of [320,360,375,390,1440]) {
  const context=await browser.newContext({viewport:{width,height:900},locale:'en-GB',timezoneId:'Europe/London',reducedMotion:'reduce',...(width<768?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'}:{})});
  const errors=[],mutations=[];let channel='';
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(u.origin===base){
    try { const file=path.resolve(root,'.'+u.pathname+(u.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep))throw Error('path');return route.fulfill({body:await fs.readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'}); }catch{return route.fulfill({status:404,body:''});}
   }
   if(u.pathname==='/saved-quotes/settings') return json(DEFAULT_SAVE_QUOTE_SETTINGS);
   if(u.pathname==='/saved-quotes/by-token')return json({ok:true,quote,canBook:true});
   if(u.pathname==='/saved-quotes'&&req.method()==='POST') {
    const body=req.postDataJSON();channel=body.channel;assert.equal(body.journey.returnJourney,true);assert.equal(body.journey.vehicle,ESTATE_VEHICLE);assert.equal(body.journey.passengers,2);
    return json({ok:true,token,reference:quote.reference,amount:130,amountLabel:'£130.00',expiresAt:quote.expiresAt,expiresAtLabel:quote.expiresAtLabel,email:body.customerEmail,emailSent:channel==='email',quoteUrl:quote.bookUrl,quote:{...quote,...body}});
   }
   if(u.pathname==='/pricing/public')return json({config:toPublicOwnerPricingConfig(defaultOwnerPricingSettings())});
   if(u.pathname.includes('/route/v1/driving'))return json({code:'Ok',routes:[{distance:25830,duration:1506,geometry:{coordinates:[[-5.9300677,54.5966472],[-6.2158,54.6575]],type:'LineString'}}]});
   if(u.pathname==='/quote/availability')return json({blocked:false,available:true,alternativeTimes:[]});
   if(u.pathname==='/quote/calculate'){const body=req.postDataJSON();return json({ok:true,amount:120,journeyFareGbp:120,airportFixedCostsGbp:0,nightWeekendSurchargeGbp:0,vehicleType:body.vehicleType,returnJourney:body.returnJourney,diagnostics:{distanceKm:25.83,routeDurationMinutes:25.1}});}
   if(req.method()==='POST'&&/payments|bookings/.test(u.pathname))mutations.push(u.pathname);
   return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  try {
  await page.goto(base+'/quote/#t='+token,{waitUntil:'domcontentloaded'});
  const reject=page.getByRole('button',{name:'Reject optional',exact:true});if(await reject.count())await reject.click();
  await page.locator('[data-quote-fare-status="ready"]').first().waitFor();
  assert.equal(await page.locator('#quoteForm [name="passengers"]').first().inputValue(),'2');
  assert.equal(await page.locator('#quoteForm [name="suitcases"]').first().inputValue(),'1');
  assert.equal(await page.locator('#date').inputValue(),journey.tripDate);
  assert.equal(await page.locator('#time').inputValue(),journey.tripTime);
  await page.getByText(/Your current fare has changed/).waitFor();
  await page.clock.install();
  await page.locator('#time').focus();
  await page.clock.fastForward(19000);
  assert.equal(await page.locator('[data-save-quote-reminder]').count(),0);
  await page.locator('#time').dispatchEvent('input');
  await page.clock.fastForward(19000);
  assert.equal(await page.locator('[data-save-quote-reminder]').count(),0,'interaction resets timer');
  await page.clock.fastForward(1500);
  const reminder=page.locator('[data-save-quote-reminder]');await reminder.waitFor();
  await reminder.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'no horizontal overflow');
  const overlaps=await page.evaluate(()=>{const p=document.querySelector('[data-save-quote-reminder]').getBoundingClientRect();return [...document.querySelectorAll('#quoteForm [data-quote-result-card], #quoteForm button')].some(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&p.left<r.right&&p.right>r.left&&p.top<r.bottom&&p.bottom>r.top;});});
  assert.equal(overlaps,false,'reminder does not cover fare or controls');
  await page.screenshot({path:`test-results/save-my-quote/${width}-reminder.png`,fullPage:true});
  await reminder.getByRole('button',{name:'Save My Quote',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  await page.screenshot({path:`test-results/save-my-quote/${width}-save-options.png`});
  await dialog.getByRole('button',{name:'Save via WhatsApp',exact:true}).click();
  const share=dialog.getByRole('link',{name:'Open WhatsApp to Share'});await share.waitFor();
  assert.equal(new URL(await share.getAttribute('href')).hostname,width<768?'wa.me':'web.whatsapp.com');
  assert.equal(channel,'whatsapp');
  await dialog.getByRole('button',{name:'Email My Quote instead'}).click();
  await dialog.getByLabel('Email address').fill('test@example.invalid');
  await dialog.getByRole('button',{name:'Email My Quote',exact:true}).click();
  await dialog.getByText('Your quote has been emailed to test@example.invalid.').waitFor();
  await page.screenshot({path:`test-results/save-my-quote/${width}-saved.png`});
  await dialog.getByRole('button',{name:'Continue to Booking'}).click();
  await page.clock.fastForward(30000);assert.equal(await reminder.count(),0,'booking not interrupted');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-quote-fare-status="ready"]').first().waitFor();
  await page.clock.fastForward(30000);assert.equal(await reminder.count(),0,'once per session survives reload');
  assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
  console.log(`PASS ${width}px: restoration, changed fare, inactivity reset, save options, share URL, email, no overlap, session suppression`);
  } catch (error) {
    await page.screenshot({path:`test-results/save-my-quote/${width}-failure.png`,fullPage:true});
    await fs.writeFile(`test-results/save-my-quote/${width}-failure.txt`,String(error)+'\n'+await page.locator('body').innerText());
    throw error;
  } finally { await context.close(); }
 }
} finally {await browser.close();}
