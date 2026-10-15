// Run: node --import tsx scripts/check-quote-calculator-browser.cjs
// Requires Playwright; optionally set PLAYWRIGHT_EXECUTABLE_PATH for an installed Chromium.
const {chromium}=require('playwright');
const fs=require('fs'),assert=require('assert/strict'),{spawn}=require('child_process');
const root=require('path').resolve(__dirname,'..');
const {defaultOwnerPricingSettings,toPublicOwnerPricingConfig}=require('../shared/owner-pricing-config.ts');
const publicFixture={ok:true,config:toPublicOwnerPricingConfig(defaultOwnerPricingSettings())};
publicFixture.config.executive.requestQuote=true;
publicFixture.config.minibus={...publicFixture.config.minibus,publicEnabled:true,requestQuote:true};
const output=require('os').tmpdir()+'/quote-calculator-review';
fs.mkdirSync(output,{recursive:true});
const harness=root+'/src/app/quote-review-check/page.tsx';
if(fs.existsSync(harness))throw new Error('Test harness path already exists; refusing to overwrite it');
fs.mkdirSync(require('path').dirname(harness),{recursive:true});
fs.writeFileSync(harness,`'use client';
import {useEffect,useState} from 'react';
import QuoteCard from '@/components/QuoteCard';
import {quickSelectToPlace} from '@/lib/selected-place';
import {PREVIEW_BELFAST_CITY_HALL_PLACE} from '@/lib/preview-customer-quote';
export default function Check(){const [codes,setCodes]=useState<string[]|null>(null);useEffect(()=>{const p=new URLSearchParams(location.search);setCodes([p.get('from')||'HOME',p.get('to')||'BFS']);},[]);if(!codes)return null;const place=(c:string)=>c==='HOME'?PREVIEW_BELFAST_CITY_HALL_PLACE:quickSelectToPlace(c as 'BFS'|'BHD'|'DUB');return <main className="mx-auto max-w-xl px-4 pt-24"><QuoteCard presentation="homepage" initialPickupPlace={place(codes[0])} initialDropoffPlace={place(codes[1])}/></main>;}`);
const server=spawn(process.execPath,[root+'/node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3091'],{cwd:root,stdio:['ignore','pipe','pipe']});
let b;const apiRequests=[],errors=[],results=[];let instantAll=false,stale=false;
(async()=>{
 for(let i=0;i<80;i++){try{await fetch('http://127.0.0.1:3091/',{signal:AbortSignal.timeout(1500)});break}catch{await new Promise(r=>setTimeout(r,500))}}
 b=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 const context=await b.newContext();
 await context.route('https://**/*',async r=>{
  const u=r.request().url();
  if(u.endsWith('/pricing/public')){const c=structuredClone(publicFixture);if(instantAll||stale){c.config.executive.requestQuote=false;c.config.minibus.requestQuote=false;}return r.fulfill({json:c})}
  if(u.includes('/quote/calculate')){
   const q=r.request().postDataJSON();apiRequests.push(q.vehicleType);const manual=/executive|minibus/i.test(q.vehicleType);
   if(stale&&manual)return r.fulfill({status:409,json:{ok:false,reason:'personal_quote_required',message:'Request a personalised quote.'}});
   const base=/estate/i.test(q.vehicleType)?70:/executive/i.test(q.vehicleType)?105:/minibus/i.test(q.vehicleType)?119:60;
   const journey=q.returnJourney?base*2*.95:base;
   return r.fulfill({json:{ok:true,amount:journey+5,journeyFareGbp:journey,airportFixedCostsGbp:0,nightWeekendSurchargeGbp:0,vehicleType:q.vehicleType,distanceKm:25,durationMinutes:25}})
  }
  if(u.includes('/route/v1/'))return r.fulfill({json:{code:'Ok',routes:[{distance:25000,duration:1500,geometry:{coordinates:[]}}]}});
  if(/workers.dev/.test(u))return r.fulfill({json:{ok:true,available:true,blocked:false,settings:{}}});
  return r.abort();
 });
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 const journeys=[['HOME','BFS'],['BFS','HOME'],['HOME','BHD'],['BHD','HOME'],['HOME','DUB'],['DUB','HOME'],['BFS','DUB'],['DUB','BFS']];
 async function prepare(from,to,returning){
  await p.goto('http://127.0.0.1:3091/quote-review-check?from='+from+'&to='+to);
  await p.locator('#quote-section-passengers').waitFor();
  await p.waitForTimeout(150);
  await p.evaluate(returning=>window.dispatchEvent(new CustomEvent('quote-prefill-draft',{detail:{passengers:1,suitcases:1,returnJourney:returning,tripDate:'2026-10-22',tripTime:'12:00',returnDate:'2026-10-29',returnTime:'12:00'}})),returning);
  await p.getByRole('button',{name:'Get My Fixed Price',exact:false}).click();
  await p.locator('[data-quote-fare-status=ready]').waitFor();
 }
 for(const width of [375,390,430,1280]){
  await p.setViewportSize({width,height:900});
  for(const [from,to] of journeys)for(const returning of [false,true]){
   await prepare(from,to,returning);
   for(const vehicle of ['saloon','estate','executive','minibus']){
    const before=apiRequests.length;await p.locator('[data-vehicle-category='+vehicle+']').click();
    const card=p.locator('[data-quote-result-card]');
    if(vehicle==='executive'||vehicle==='minibus'){
     await card.locator('[data-quote-manual-state]').waitFor();assert.match(await card.innerText(),/REQUEST A QUOTE/);
     assert.doesNotMatch(await card.innerText(),/FIXED PRICE|£|Try again|No surprises|Included/);
     await p.waitForTimeout(70);assert.equal(apiRequests.length,before,'manual selection must not request an instant fare');
    }else{
     await card.locator('[data-quote-fare-status=ready]').waitFor();
     const fare=await card.locator('[data-quote-fare-status=ready]').innerText();assert.match(await card.locator('button[type=submit]').innerText(),new RegExp(fare.replace('£','£')));
     const benefit=card.locator('[data-quote-airport-benefits]');assert.equal(await benefit.count(),1);
     const headings=await benefit.locator('p.font-bold').allTextContents();
     const expected=(from!=='HOME'?1:0)+(to!=='HOME'?1:0);
     assert.equal(headings.length,returning?expected*2:expected);
     if(from!=='HOME')assert.equal(headings[0],'Terminal Pickup Included');
     if(to!=='HOME')assert.equal(headings[from!=='HOME'?1:0],'Terminal Drop-Off Included');
     if(from==='DUB'||to==='DUB')assert.doesNotMatch(await benefit.innerText(),/closest/);
    }
    const dimensions=await card.evaluate(e=>{const r=e.getBoundingClientRect();const btn=e.querySelector('button[type=submit]');return{width:r.width,scroll:e.scrollWidth,height:r.height,button:btn.getBoundingClientRect().height}});
    assert.ok(dimensions.scroll<=dimensions.width+1,'card clips horizontally');assert.ok(dimensions.button>=44,'tap target under 44px');
    results.push({width,from,to,returning,vehicle,...dimensions});
   }
  }
  console.log('OK width '+width+': 64 vehicle/journey/return states');
 }
 // Prove instant mode uses its server fare for every vehicle, rather than forcing manual.
 instantAll=true;await prepare('HOME','BFS',false);
 for(const vehicle of ['executive','minibus']){await p.locator('[data-vehicle-category='+vehicle+']').click();await p.locator('[data-quote-fare-status=ready]').waitFor();assert.match(await p.locator('[data-quote-result-card]').innerText(),/BOOK THIS TRANSFER/)}
 console.log('OK instant-config Business Class and minibus');
 // A tab with stale public settings must follow a server manual-quote signal.
 instantAll=false;stale=true;await prepare('HOME','BFS',false);await p.locator('[data-vehicle-category=executive]').click();await p.locator('[data-quote-manual-state]').waitFor();assert.doesNotMatch(await p.locator('[data-quote-result-card]').innerText(),/couldn’t load/);
 console.log('OK stale config 409 -> manual quote');
 stale=false;await prepare('HOME','BFS',false);await p.locator('[data-vehicle-category=executive]').click();await p.locator('[data-quote-manual-state]').waitFor();await p.locator('#quote-book-now-button').click();await p.locator('input[type=email]').waitFor();
 assert.equal(await p.locator('[data-quote-manual-state]').count(),0);assert.equal(await p.locator('text=Pay & Confirm').count(),0);
 console.log('OK request action reaches existing customer details');
 assert.deepEqual(errors,[]);console.log('OK no JavaScript exceptions');
 fs.writeFileSync(output+'/results.json',JSON.stringify(results,null,2));
 // Save internal visual QA only.
 await p.setViewportSize({width:390,height:844});await prepare('BFS','DUB',false);await p.locator('[data-quote-result-card]').scrollIntoViewIfNeeded();await p.locator('[data-quote-result-card]').screenshot({path:output+'/airport-mobile.png'});
 await b.close();server.kill();fs.rmSync(require('path').dirname(harness),{recursive:true});
})().catch(async e=>{console.error(e);if(b)await b.close();server.kill();fs.rmSync(require('path').dirname(harness),{recursive:true});process.exitCode=1});
