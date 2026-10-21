/** Isolated delayed authoritative fares: vehicle selection must not move the viewport. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';
import { SALOON_VEHICLE, ESTATE_VEHICLE, EXECUTIVE_VEHICLE, MINIBUS_VEHICLE } from '../src/lib/vehicle-selection';
const base=process.env.TEST_BASE_URL || 'http://localhost:3000';
const output='test-results/homepage-booking';
const baselineRun=process.env.VEHICLE_STABILITY_BASELINE==='main';
const baselineFile=`${output}/vehicle-stability-main.json`;
const reference=baselineRun?null:JSON.parse(await fs.readFile(baselineFile,'utf8'));
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch();
const results=[], measurements={};
try {
 for (const width of [320,375,390,430,1280]) for (const returning of [false,true]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  const settings=defaultOwnerPricingSettings(); settings.minibus.publicEnabled=true;
  await context.addInitScript(settings=>localStorage.setItem('matni:preview-pricing-settings',JSON.stringify(settings)),settings);
  const allowed=new Set([SALOON_VEHICLE]), pending=new Map();
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===new URL(base).origin) return route.continue();
   const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   if(url.pathname.includes('/route/v1/driving')) return json({code:'Ok',routes:[{distance:26000,duration:1800,geometry:{coordinates:[[-5.9302,54.5964],[-6.2158,54.6575]],type:'LineString'}}]});
   if(url.pathname==='/pricing/public') return json({config:toPublicOwnerPricingConfig(settings)});
   if(url.pathname==='/quote/availability') return json({blocked:false,available:true,alternativeTimes:[]});
   if(url.pathname==='/quote/calculate') {
    const body=req.postDataJSON(),vehicle=body.vehicleType;
    if(!allowed.has(vehicle)) await new Promise(resolve=>{const list=pending.get(vehicle)||[];list.push(resolve);pending.set(vehicle,list)});
    const fare=vehicle===SALOON_VEHICLE?60:vehicle===ESTATE_VEHICLE?70:vehicle===EXECUTIVE_VEHICLE?100:95;
    return json({ok:true,amount:fare,journeyFareGbp:fare,airportFixedCostsGbp:13,nightWeekendSurchargeGbp:0,vehicleType:vehicle,returnJourney:body.returnJourney,outboundOneWayBeforeAccessGbp:fare/2,returnOneWayBeforeAccessGbp:fare/2});
   }
   return route.abort();
  });
  const page=await context.newPage();
  await page.goto(`${base}/?previewJourney=bfs`);
  await page.waitForFunction(()=>document.getElementById('pickup')?.value.includes('City Hall'));
  const cookie=page.getByRole('button',{name:/^(Essential only|Reject optional)$/,exact:true});if(await cookie.isVisible()) await cookie.click();
  if(returning) await page.getByRole('button',{name:/Return SAVE/}).click();
  await page.locator('#quote-section-passengers').selectOption('2');
  await page.locator('#quote-section-suitcases').selectOption('0');
  await page.getByRole('button',{name:/Get My Fixed Price/}).last().click();
  await page.getByRole('button',{name:/BOOK THIS TRANSFER.*£/i}).waitFor();
  if(returning) await page.locator(width < 768 ? '[data-homepage-return-breakdown]' : '[data-homepage-return-breakdown-desktop]').waitFor();
  await page.waitForTimeout(1200);
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('[data-quote-vehicle-options-heading]').scrollIntoViewIfNeeded();
  for(const [id,vehicle] of [['estate',ESTATE_VEHICLE],['executive',EXECUTIVE_VEHICLE],['minibus',MINIBUS_VEHICLE]]) {
   // The initial mobile landing is the selected summary. Bring each original
   // stacked choice into view before measuring repricing, excluding the browser's
   // legitimate click-target reveal from the no-judder assertion.
   await page.locator(`[data-vehicle-category="${id}"]`).scrollIntoViewIfNeeded();
   await page.evaluate(()=>{
    window.measureVehicle=()=>{const e=document.querySelector('[data-quote-vehicle-options-heading]');const top=e.getBoundingClientRect().top;const action=document.querySelector('[data-quote-result-main-action]');const tools=document.querySelector('[data-quote-result-actions]');const css=getComputedStyle(action);return {top,documentTop:top+scrollY,y:scrollY,action:action.getBoundingClientRect().top+scrollY,tools:tools.getBoundingClientRect().top+scrollY,font:css.fontFamily,fontSize:css.fontSize,lineHeight:css.lineHeight}};
    window.vehicleBefore=window.measureVehicle();
   });
   await page.locator(`[data-vehicle-category="${id}"]`).click();
   await page.evaluate(()=>{window.vehicleFrames=[window.measureVehicle()];window.vehicleSampler=setInterval(()=>window.vehicleFrames.push(window.measureVehicle()),16)});
   await page.waitForTimeout(450);
   const pendingState=await page.evaluate(()=>window.measureVehicle());
   if(returning) assert.equal(await page.locator(width < 768 ? '[data-homepage-return-breakdown]' : '[data-homepage-return-breakdown-desktop]').count(),0,'must exercise the pending-fare layout');
   allowed.add(vehicle);for(const resolve of pending.get(vehicle)||[]) resolve(); pending.delete(vehicle);
   await page.getByRole('button',{name:/BOOK THIS TRANSFER.*£/i}).waitFor();
   if(returning) await page.locator(width < 768 ? '[data-homepage-return-breakdown]' : '[data-homepage-return-breakdown-desktop]').waitFor();
   await page.waitForTimeout(250);
   const sample=await page.evaluate(()=>{clearInterval(window.vehicleSampler);const settled=window.measureVehicle();return {before:window.vehicleBefore,settled,frames:[...window.vehicleFrames,settled]}});
   const key=`${width}-${returning?'return':'one-way'}-${id}`;
   measurements[key]={...sample,pending:pendingState};
   // Keep the viewport/vehicle-list no-judder checks. The action rows can move
   // with the existing selected artwork and pending price text. Measure those
   // against the SAME gated-response harness on pinned main, not a zero-motion
   // assumption or a timer-dependent first frame after React commits.
   for(const field of ['top','documentTop','y']) assert.ok(Math.max(...sample.frames.map(f=>f[field]))-Math.min(...sample.frames.map(f=>f[field]))<=2,`${key}: ${field} moved`);
   if(reference) {
    const main=reference[key]; assert.ok(main,`Missing main measurement: ${key}`);
    for(const phase of ['before','pending','settled']) {
     const actual=measurements[key][phase],expected=main[phase];
     for(const field of ['font','fontSize','lineHeight']) assert.equal(actual[field],expected[field],`${key} ${phase}: ${field}`);
     for(const field of ['documentTop','action','tools']) assert.ok(Math.abs(actual[field]-expected[field])<=2,`${key} ${phase}: ${field} differs from main (${actual[field]} vs ${expected[field]})`);
    }
    for(const field of ['action','tools']) {
     const mainOffsets=[0,...main.frames.map(f=>f[field]-main.before[field]),main.pending[field]-main.before[field]];
     const min=Math.min(...mainOffsets),max=Math.max(...mainOffsets);
     for(const frame of sample.frames) assert.ok(frame[field]-sample.before[field]>=min-2 && frame[field]-sample.before[field]<=max+2,`${key}: ${field} exceeded main movement envelope [${min}, ${max}]`);
    }
   }
   console.log('VEHICLE MOVEMENT '+JSON.stringify({source:baselineRun?'main':'pr',key,before:sample.before.action,pending:pendingState.action,settled:sample.settled.action,delta:sample.settled.action-sample.before.action,range:Math.max(...sample.frames.map(f=>f.action))-Math.min(...sample.frames.map(f=>f.action))}));
   const booking=page.getByRole('button',{name:/BOOK THIS TRANSFER.*£/i});
   await booking.scrollIntoViewIfNeeded(); await booking.click({trial:true});
   assert.ok(await booking.evaluate(el=>{const r=el.getBoundingClientRect(),header=document.querySelector('header.fixed, header[class*="fixed"]')?.getBoundingClientRect().bottom||0;return r.top>=header && r.bottom<=visualViewport.height && [.2,.5,.8].every(x=>[.2,.5,.8].every(y=>el.contains(document.elementFromPoint(r.left+r.width*x,r.top+r.height*y))))}),`${key}: booking must be visible and unobstructed after normal scrolling`);
  }
  await page.screenshot({path:`${output}/${width}-${returning?'return':'one-way'}-vehicle-stability.png`});
  await page.getByRole('button',{name:/BOOK THIS TRANSFER.*£/i}).click();
  await page.getByPlaceholder('John Smith').waitFor();
  results.push(`${width}px ${returning?'return':'one-way'}: Estate, Business Class and 7-Seater delayed authoritative repricing keeps vehicle heading and scroll position within 2px`);
  console.log('PASS',results.at(-1));
  for(const list of pending.values()) for(const resolve of list) resolve();
  await context.close();
 }
} finally {
 await fs.writeFile(baselineRun?baselineFile:`${output}/vehicle-stability-pr.json`,JSON.stringify(measurements,null,2));
 await fs.writeFile(`${output}/vehicle-stability-${baselineRun?'main':'pr'}-results.json`,JSON.stringify(results,null,2));
 await browser.close();
}
