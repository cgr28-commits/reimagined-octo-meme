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
// Optional diagnostic subset only; the required Homepage review uses the full matrix.
const widths=process.env.VEHICLE_STABILITY_WIDTHS?.split(',').map(Number) || [320,360,375,390,430,1280];
assert.ok(widths.every(width=>[320,360,375,390,430,1280].includes(width)));
try {
 for (const width of widths) for (const returning of [false,true]) {
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
   // Paired main/PR677 runs: scrollIntoViewIfNeeded can leave Minibus under the
   // fixed header (360px WebKit / 375px Chromium). Playwright then scrolls
   // 830/832px to click it; document layout stays fixed on both branches.
   // Reveal the entire choice before sampling, without relaxing the 2px limit.
   const option=page.locator(`[data-vehicle-category="${id}"]`);
   await option.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
   assert.ok(await option.evaluate(el=>{const r=el.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=document.querySelector('header').getBoundingClientRect().bottom&&r.bottom<=innerHeight&&(el===target||el.contains(target));}),'vehicle choice must be fully visible and unobstructed before measuring');
   const layout=()=>page.evaluate(id=>{
    const measure=selector=>{const el=document.querySelector(selector);if(!el)return null;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {top:r.top,documentTop:r.top+scrollY,height:r.height,width:r.width,marginBottom:s.marginBottom,padding:s.padding,border:s.borderWidth,font:s.font,lineHeight:s.lineHeight};};
    return {y:scrollY,heading:measure('[data-quote-vehicle-options-heading]'),option:measure(`[data-vehicle-category="${id}"]`),art:measure('[data-quote-result-art]'),price:measure('[data-quote-result-price]'),fare:measure('[data-quote-fare-status]'),fareStatus:document.querySelector('[data-quote-fare-status]')?.getAttribute('data-quote-fare-status'),action:measure('[data-quote-result-main-action]'),documentHeight:document.documentElement.scrollHeight};
   },id);
   const before=await layout();
   await page.evaluate(()=>{
    window.vehicleFrames=[];
    window.vehiclePhase='click';
    window.vehicleSampler=setInterval(()=>{const e=document.querySelector('[data-quote-vehicle-options-heading]');const top=e.getBoundingClientRect().top;const action=document.querySelector("[data-quote-result-main-action]").getBoundingClientRect();const tools=document.querySelector("[data-quote-result-actions]").getBoundingClientRect();window.vehicleFrames.push({at:performance.now(),phase:window.vehiclePhase,top,documentTop:top+scrollY,y:scrollY,action:action.top+scrollY,tools:tools.top+scrollY})},16);
   });
   await page.locator(`[data-vehicle-category="${id}"]`).click();
   const clicked=await layout();
   await page.evaluate(()=>{window.vehiclePhase='pending';});
   await page.waitForTimeout(450);
   const pendingLayout=await layout();
   assert.ok(['pending','updating'].includes(pendingLayout.fareStatus),'selected vehicle must await its held authoritative response');
   if(returning) assert.equal(await page.locator(width < 768 ? '[data-homepage-return-breakdown]' : '[data-homepage-return-breakdown-desktop]').count(),0,'must exercise the pending-fare layout');
   const confirmedResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/quote/calculate' && response.request().postDataJSON()?.vehicleType===vehicle && response.ok());
   allowed.add(vehicle);for(const resolve of pending.get(vehicle)||[]) resolve(); pending.delete(vehicle);
   await page.evaluate(()=>{window.vehiclePhase='response';});
   await page.getByRole('button',{name:/BOOK THIS TRANSFER.*£/i}).waitFor();
   const genericButtonAt=await page.evaluate(()=>performance.now());
   // The generic CTA can still show a fallback price while the new response is
   // rendering. Paired 1280px WebKit runs show the same 14px pending/ready change
   // on main and PR677, but at different times (140ms vs 53ms after release).
   // Start the settled-frame check only after the selected authoritative fare
   // has rendered, keeping the continuous 2px viewport checks throughout.
   await confirmedResponse;
   await page.waitForFunction(()=>{
    const price=document.querySelector('[data-quote-fare-status="ready"]');
    const button=document.getElementById('quote-book-now-button');
    const amount=price?.textContent?.trim();
    // The customer total includes the existing airport fees/return treatment;
    // it is not just the mock's journey-fare component.
    return /^£\d+(?:\.\d{2})?$/.test(amount || '') && button?.textContent?.trim()===`BOOK THIS TRANSFER — ${amount}` && !button.disabled;
   });
   if(returning) await page.locator(width < 768 ? '[data-homepage-return-breakdown]' : '[data-homepage-return-breakdown-desktop]').waitFor();
   // WebKit can expose the new DOM text before its updated font/layout has
   // painted. Await those resources and two rendering frames, not an arbitrary
   // grace period or a widened movement tolerance.
   const fareReadyAt=await page.evaluate(async()=>{
    const price=document.querySelector('[data-quote-fare-status="ready"]');
    price.getBoundingClientRect();
    await document.fonts.ready;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    price.getBoundingClientRect();
    return performance.now();
   });
   await page.waitForTimeout(250);
   const frames=await page.evaluate(()=>{clearInterval(window.vehicleSampler);return window.vehicleFrames});
   const ready=await layout();
   const booking=page.getByRole('button',{name:/BOOK THIS TRANSFER.*£/i});
   // Reveal the whole action before the accessibility check, as for vehicle
   // choices above. Chromium's nearest-edge scrolling can round to an integer
   // scroll offset and leave 0.34px outside the viewport with fractional layout.
   // Sampling has stopped; keep the strict visibility and movement assertions.
   await booking.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
   const hit=await booking.evaluate(el=>{const r=el.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {top:r.top,bottom:r.bottom,visible:r.top>=document.querySelector('header').getBoundingClientRect().bottom&&r.bottom<=innerHeight,hit:el===target||el.contains(target),disabled:el.disabled,overflow:document.documentElement.scrollWidth>innerWidth};});
   const ranges=Object.fromEntries(['top','documentTop','y','action','tools'].map(key=>[key,Math.max(...frames.map(f=>f[key]))-Math.min(...frames.map(f=>f[key]))]));
   const changes=frames.filter((f,i)=>i===0||['phase','top','documentTop','y','action','tools'].some(key=>f[key]!==frames[i-1][key]));
   const legacyWindow=frames.filter(f=>f.at>=genericButtonAt+70 && f.at<=genericButtonAt+250);
   const legacyActionRange=legacyWindow.length ? Math.max(...legacyWindow.map(f=>f.action))-Math.min(...legacyWindow.map(f=>f.action)) : null;
   const diagnostic={engine,width,returning,id,ranges,before,clicked,pendingLayout,ready,hit,changes,genericButtonAt,fareReadyAt,legacyActionRange};
   console.log('VEHICLE_STABILITY',JSON.stringify(diagnostic));
   await fs.writeFile(`${output}/${width}-${returning?'return':'one-way'}-${id}-measurements.json`,JSON.stringify({...diagnostic,frames},null,2));
   await page.screenshot({path:`${output}/${width}-${returning?'return':'one-way'}-${id}-button.png`});
   // Existing vehicle-specific image spacing and pending/ready copy legitimately
   // change card height. Keep the continuous viewport-judder checks; require the
   // action rows to stop moving once the authoritative fare has settled.
   const initial={top:before.heading.top,documentTop:before.heading.documentTop,y:before.y};
   for(const key of ['top','documentTop','y']) {
    const values=[initial[key],...frames.map(f=>f[key])];
    assert.ok(Math.max(...values)-Math.min(...values)<=2,`${width}px ${returning?'return':'one-way'} ${id}: ${key} moved`);
   }
   const settled=frames.filter(f=>f.at>=fareReadyAt);
   assert.ok(settled.length>=3,'enough settled frames to detect ongoing movement');
   assert.ok(settled.at(-1).at-settled[0].at>=180,'observe at least 180ms after the confirmed fare renders');
   for(const key of ['action','tools']) assert.ok(Math.max(...settled.map(f=>f[key]))-Math.min(...settled.map(f=>f[key]))<=2,`${width}px ${id}: settled ${key} keeps moving`);
   assert.ok(hit.visible&&hit.hit&&!hit.disabled&&!hit.overflow,'repriced booking button accessible: '+JSON.stringify(hit));
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
