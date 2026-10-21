/** Isolated delayed authoritative fares: vehicle selection must not move the viewport. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';
import { SALOON_VEHICLE, ESTATE_VEHICLE, EXECUTIVE_VEHICLE, MINIBUS_VEHICLE } from '../src/lib/vehicle-selection';
const base=process.env.TEST_BASE_URL || 'http://localhost:3000';
const engine=process.env.PLAYWRIGHT_BROWSER || 'chromium';
const output=`test-results/homepage-booking/${engine}`;
await fs.mkdir(output,{recursive:true});
const browser=await ({chromium,webkit}[engine]).launch();
const results=[];
try {
 for (const width of [320,360,375,390,430,1280]) for (const returning of [false,true]) {
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
  await page.evaluate(()=>document.fonts.ready);
  await page.getByRole('button',{name:'Reject optional',exact:true}).click();
  await page.getByRole('dialog',{name:'Cookie consent'}).waitFor({state:'hidden'});
  if(returning) await page.getByRole('button',{name:/Return SAVE/}).click();
  await page.locator('#quote-section-passengers').selectOption('2');
  await page.locator('#quote-section-suitcases').selectOption('0');
  // Main and candidate both require a complete schedule before quoting. The
  // old fixture never supplied the return collection and timed out on both.
  const futureDate=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
  await page.locator('#date').fill(futureDate(5));
  await page.locator('#time').fill('12:00');
  if(returning) {
   await page.locator('#returnDate').fill(futureDate(7));
   await page.locator('#returnTime').fill('14:00');
  }
  await page.getByRole('button',{name:/Get My Fixed Price/}).last().click();
  await page.getByRole('button',{name:/BOOK THIS TRANSFER.*£/i}).waitFor();
  if(returning) await page.locator(width < 768 ? '[data-homepage-return-breakdown]' : '[data-homepage-return-breakdown-desktop]').waitFor();
  await page.waitForTimeout(1200);
  await page.locator('[data-quote-vehicle-options-heading]').scrollIntoViewIfNeeded();
  for(const [id,vehicle] of [['estate',ESTATE_VEHICLE],['executive',EXECUTIVE_VEHICLE],['minibus',MINIBUS_VEHICLE]]) {
   // The initial mobile landing is the selected summary. Bring each original
   // stacked choice into view before measuring repricing, excluding the browser's
   // legitimate click-target reveal from the no-judder assertion.
   await page.locator(`[data-vehicle-category="${id}"]`).scrollIntoViewIfNeeded();
   await page.evaluate(()=>{
    window.vehicleFrames=[];
    window.vehicleSampler=setInterval(()=>{const e=document.querySelector('[data-quote-vehicle-options-heading]');const top=e.getBoundingClientRect().top;const action=document.querySelector("[data-quote-result-main-action]").getBoundingClientRect();const tools=document.querySelector("[data-quote-result-actions]").getBoundingClientRect();window.vehicleFrames.push({at:performance.now(),top,documentTop:top+scrollY,y:scrollY,action:action.top+scrollY,tools:tools.top+scrollY})},16);
   });
   await page.locator(`[data-vehicle-category="${id}"]`).click();
   await page.waitForTimeout(450);
   if(returning) assert.equal(await page.locator(width < 768 ? '[data-homepage-return-breakdown]' : '[data-homepage-return-breakdown-desktop]').count(),0,'must exercise the pending-fare layout');
   allowed.add(vehicle);for(const resolve of pending.get(vehicle)||[]) resolve(); pending.delete(vehicle);
   await page.getByRole('button',{name:/BOOK THIS TRANSFER.*£/i}).waitFor();
   if(returning) await page.locator(width < 768 ? '[data-homepage-return-breakdown]' : '[data-homepage-return-breakdown-desktop]').waitFor();
   await page.waitForTimeout(250);
   const frames=await page.evaluate(()=>{clearInterval(window.vehicleSampler);return window.vehicleFrames});
   // Existing vehicle-specific image spacing and pending/ready copy legitimately
   // change card height. Keep the continuous viewport-judder checks; require the
   // action rows to stop moving once the authoritative fare has settled.
   for(const key of ['top','documentTop','y']) assert.ok(Math.max(...frames.map(f=>f[key]))-Math.min(...frames.map(f=>f[key]))<=2,`${width}px ${returning?'return':'one-way'} ${id}: ${key} moved`);
   const settled=frames.filter(f=>f.at>=frames.at(-1).at-180);
   assert.ok(settled.length>=3,'enough settled frames to detect ongoing movement');
   for(const key of ['action','tools']) assert.ok(Math.max(...settled.map(f=>f[key]))-Math.min(...settled.map(f=>f[key]))<=2,`${width}px ${id}: settled ${key} keeps moving`);
   const booking=page.getByRole('button',{name:/BOOK THIS TRANSFER.*£/i});
   await booking.scrollIntoViewIfNeeded();
   const hit=await booking.evaluate(el=>{const r=el.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {visible:r.top>=document.querySelector('header').getBoundingClientRect().bottom&&r.bottom<=innerHeight,hit:el===target||el.contains(target),disabled:el.disabled};});
   assert.ok(hit.visible&&hit.hit&&!hit.disabled,'repriced booking button accessible: '+JSON.stringify(hit));
  }
  await page.screenshot({path:`${output}/${width}-${returning?'return':'one-way'}-vehicle-stability.png`});
  results.push(`${width}px ${returning?'return':'one-way'}: Estate, Business Class and 7-Seater delayed authoritative repricing keeps vehicle heading and scroll position within 2px`);
  console.log('PASS',results.at(-1));
  for(const list of pending.values()) for(const resolve of list) resolve();
  await context.close();
 }
} finally {
 await fs.writeFile(`${output}/vehicle-stability-results.json`,JSON.stringify(results,null,2));
 await browser.close();
}
