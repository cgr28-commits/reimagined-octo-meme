/** Isolated production-export tests. All external requests are mocked; no bookings/payments. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {defaultOwnerPricingSettings,toPublicOwnerPricingConfig} from '../shared/owner-pricing-config';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(`${process.env.PLAYWRIGHT_MODULE}/index.mjs`).href:'playwright');
const engine=process.env.PLAYWRIGHT_BROWSER||'chromium';
const root=path.resolve(process.env.STATIC_EXPORT_DIR||'out');
const base='http://localhost:3000';
const launch=engine==='chromium'&&process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage','--use-gl=disabled','--disable-gpu','--disable-software-rasterizer','--disable-webgl','--in-process-gpu','--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process']}:{};
await fs.mkdir(`test-results/quote-recovery/${engine}`,{recursive:true});
const scenarios=process.env.TEST_SCENARIO?[process.env.TEST_SCENARIO]:process.env.EXPECT_BASELINE_HANG?['quote-timeout']:['config-timeout','quote-timeout','routing-failure','success','dashboard'];
for(const scenario of scenarios){
 const browser=await({chromium,webkit}[engine]).launch(launch);
 console.log('START',engine,scenario);
 let page;
 try{
  const context=await browser.newContext({viewport:{width:scenario==='success'?1280:390,height:900},locale:'en-GB',timezoneId:'Europe/London',reducedMotion:'reduce'});
  let recover=scenario==='success',quoteCalls=0,configCalls=0;const errors=[];const mutations=[];
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(u.origin===base){
    try{
     const pathname=decodeURIComponent(u.pathname);const file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
     if(!file.startsWith(root+path.sep))throw Error('path');
     return route.fulfill({body:await fs.readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});
    }catch{return route.fulfill({status:404,body:''});}
   }
   if(u.pathname==='/addresses') {
    const airport=(u.searchParams.get('q')||u.searchParams.get('id')||'').includes('International');
    const name=airport?'Belfast International Airport':'Belfast City Hall',postcode=airport?'BT29 4AB':'BT1 5GS';
    const id=airport?'Belfast International':'city-hall';
    if(u.searchParams.has('id'))return json({address:`${name}, ${postcode}`,displayAddress:`${name}, ${postcode}`,formattedAddress:`${name}, ${postcode}`,placeId:id,lat:airport?54.6575:54.5966472,lng:airport?-6.2158:-5.9300677,countryCode:'GB',postalCode:postcode});
    return json({suggestions:[{id,label:`${name}, ${postcode}`,address:`${name}, ${postcode}`,mainText:name,secondaryText:postcode}]});
   }
   if(u.pathname==='/pricing/public'){
    configCalls++;if(scenario==='config-timeout'&&!recover)return;
    return json({config:toPublicOwnerPricingConfig(defaultOwnerPricingSettings())});
   }
   if(u.pathname.includes('/route/v1/driving'))return json({code:'Ok',routes:[{distance:25830,duration:1506,geometry:{coordinates:[[-5.9301,54.5966],[-6.2158,54.6575]],type:'LineString'}}]});
   if(u.pathname==='/quote/availability')return json({blocked:false,available:true,alternativeTimes:[]});
   if(u.pathname==='/quote/calculate'){
    quoteCalls++;if(scenario==='quote-timeout'&&!recover)return;
    if(scenario==='routing-failure'&&!recover)return json({ok:false,reason:'routing_unavailable',message:'Route unavailable'},422);
    const j=req.postDataJSON();const night=scenario==='success';return json({ok:true,amount:night?60:55,journeyFareGbp:night?60:55,nightWeekendSurchargeGbp:night?10:5,nightWeekendSurchargeLabel:night?'Night 20% / Weekend 10% surcharge':'Night & Weekend Surcharge (10%)',nightWeekendSurchargeExplanation:'Configured authoritative surcharge',airportFixedCostsGbp:0,vehicleType:j.vehicleType,premiumApplied:true,returnJourney:false,diagnostics:{distanceKm:25.83,routeDurationMinutes:25.1}});
   }
   if(req.method()==='POST'&&/payments|bookings/.test(u.pathname))mutations.push(u.pathname);
   return route.abort();
  });
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  if(scenario==='dashboard') {
   await page.goto(`${base}/owner/pricing-preview/`,{waitUntil:'domcontentloaded'});
   const consent=page.getByRole('button',{name:'Reject optional',exact:true});await consent.click();
   const toggle=page.getByRole('switch',{name:'Evening pricing enabled',exact:true});await toggle.waitFor();
   assert.equal(await toggle.getAttribute('aria-checked'),'false');
   await toggle.click();await page.getByRole('textbox',{name:'Evening surcharge',exact:true}).fill('15');
   await page.getByLabel('Evening starts',{exact:true}).fill('18:30');await page.getByLabel('Evening ends',{exact:true}).fill('22:00');
   await page.getByRole('textbox',{name:'Night surcharge',exact:true}).fill('25');
   await page.getByRole('button',{name:'Save Changes',exact:true}).click();
   await page.getByRole('dialog',{name:'Confirm pricing changes'}).getByRole('button',{name:'Save Pricing',exact:true}).click();
   await page.getByRole('dialog',{name:'Confirm pricing changes'}).waitFor({state:'hidden'});
   const persisted=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('matni:preview-pricing-settings')));
   assert.equal(persisted.evening.enabled,true);assert.equal(persisted.evening.surchargeRate,.15);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#evening-enabled[aria-checked="true"]').waitFor();
   assert.equal(await toggle.getAttribute('aria-checked'),'true');assert.equal(await page.getByRole('textbox',{name:'Evening surcharge',exact:true}).inputValue(),'15');
   assert.equal(await page.getByLabel('Evening starts',{exact:true}).inputValue(),'18:30');
   assert.equal(await page.getByRole('textbox',{name:'Night surcharge',exact:true}).inputValue(),'25');
   await page.locator('[data-evening-pricing]').screenshot({path:`test-results/quote-recovery/${engine}/evening-dashboard.png`});
   assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);
   console.log('PASS',engine,'dashboard: Evening and Night save/reload, no live writes');continue;
  }
  await page.goto(`${base}/?previewJourney=bfs`,{waitUntil:"domcontentloaded"});
  await page.getByRole('button',{name:'Reject optional',exact:true}).click();
  if(scenario==='config-timeout') {
   await page.locator('#pickup').fill('Belfast City Hall');
   await page.getByRole('button',{name:'Belfast City Hall BT1 5GS',exact:true}).click();
   await page.locator('#dropoff').fill('Belfast International');
   await page.getByRole('button',{name:'Belfast International Airport BT29 4AB',exact:true}).click();
   await page.getByRole('button',{name:'One Way',exact:true}).click();
  } else await page.waitForFunction(()=>document.getElementById('pickup')?.value.includes('City Hall'));
  await page.locator('#quote-section-passengers').selectOption('1');await page.locator('#quote-section-suitcases').selectOption('1');
  await page.locator('#date').fill('2026-10-24');await page.locator('#time').fill(scenario==='success'?'23:00':'09:59');
  await page.getByRole('button',{name:/Get My Fixed Price/}).last().click();
  const result=page.locator('[data-quote-result-card]');await result.waitFor();
  if(process.env.EXPECT_BASELINE_HANG){
   await page.waitForTimeout(22000);
   assert.equal(await result.locator('[data-quote-fare-status="pending"]').count(),1);
   assert.equal(await result.locator('[data-quote-price-retry]').count(),0);
   console.log('REPRODUCED baseline: stalled fare still Calculating after 22 seconds with no Retry');
  }else{
   if(!recover){
    const failed=result.locator('[data-quote-fare-status="unavailable"]');await failed.waitFor();
    assert.match(await failed.innerText(),/couldn’t load your price/i);
    assert.equal(await result.locator('[data-quote-fare-status="ready"]').count(),0);
    assert.equal(await result.locator('[data-quote-fare-status="pending"]').count(),0);
    if(scenario==='config-timeout')assert.equal(quoteCalls,0);
    await result.screenshot({path:`test-results/quote-recovery/${engine}/${scenario}.png`});
    recover=true;await result.locator('[data-quote-price-retry]').click();
   }
   const ready=result.locator('[data-quote-fare-status="ready"]');await ready.waitFor();assert.match(await ready.innerText(),scenario==='success'?/£65/:/£60/);
   if(scenario==='success')assert.match(await result.locator('[data-night-weekend-surcharge-badge]').innerText(),/Night 20% \/ Weekend 10%/);
   assert.equal(await result.locator('[data-quote-price-retry]').count(),0);
   assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
   if(scenario==='config-timeout')assert.ok(configCalls>=2);
   // The same confirmed places work when reversed, without a stale fare.
   await page.getByRole('button',{name:'Swap pickup and drop-off'}).click();
   await result.locator('[data-quote-fare-status="ready"]').waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   console.log('PASS',engine,scenario,'error/retry, authoritative fare, reverse journey, no side effects');
  }
 }catch(error){console.error(error);if(page)console.error((await page.locator("body").innerText()).slice(0,6500));throw error;}finally{await browser.close();}
}
