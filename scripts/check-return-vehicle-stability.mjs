/** Isolated delayed authoritative fares: vehicle selection must not move the viewport. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';
import { SALOON_VEHICLE, ESTATE_VEHICLE, EXECUTIVE_VEHICLE, MINIBUS_VEHICLE } from '../src/lib/vehicle-selection';
const base=process.env.TEST_BASE_URL || 'http://localhost:3000';
const output='test-results/homepage-booking';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch();
const results=[];
try {
 for (const width of [390,1280]) for (const returning of [false,true]) {
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
  const cookie=page.getByRole('button',{name:'Essential only',exact:true});if(await cookie.isVisible()) await cookie.click();
  if(returning) await page.getByRole('button',{name:/Return SAVE/}).click();
  await page.locator('#quote-section-passengers').selectOption('2');
  await page.locator('#quote-section-suitcases').selectOption('0');
  await page.getByRole('button',{name:/Get My Fixed Price/}).last().click();
  await page.getByRole('button',{name:/BOOK THIS TRANSFER.*£/i}).waitFor();
  if(returning) await page.locator('[data-homepage-return-breakdown]').waitFor();
  await page.waitForTimeout(1200);
  await page.locator('[data-quote-vehicle-options-heading]').scrollIntoViewIfNeeded();
  for(const [id,vehicle] of [['estate',ESTATE_VEHICLE],['executive',EXECUTIVE_VEHICLE],['minibus',MINIBUS_VEHICLE]]) {
   await page.evaluate(()=>{
    window.vehicleFrames=[];
    window.vehicleSampler=setInterval(()=>{const e=document.querySelector('[data-quote-vehicle-options-heading]');const top=e.getBoundingClientRect().top;window.vehicleFrames.push({top,documentTop:top+scrollY,y:scrollY})},16);
   });
   await page.locator(`[data-vehicle-category="${id}"]`).click();
   await page.waitForTimeout(450);
   if(returning) assert.equal(await page.locator('[data-homepage-return-breakdown]').count(),0,'must exercise the pending-fare layout');
   allowed.add(vehicle);for(const resolve of pending.get(vehicle)||[]) resolve(); pending.delete(vehicle);
   await page.getByRole('button',{name:/BOOK THIS TRANSFER.*£/i}).waitFor();
   if(returning) await page.locator('[data-homepage-return-breakdown]').waitFor();
   await page.waitForTimeout(250);
   const frames=await page.evaluate(()=>{clearInterval(window.vehicleSampler);return window.vehicleFrames});
   for(const key of ['top','documentTop','y']) assert.ok(Math.max(...frames.map(f=>f[key]))-Math.min(...frames.map(f=>f[key]))<=2,`${width}px ${returning?'return':'one-way'} ${id}: ${key} moved`);
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
