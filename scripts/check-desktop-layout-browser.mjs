/** Desktop geometry and unchanged mobile/tablet screenshots; isolated providers only.
 * TEST_BASE_URL=http://localhost:3000 BASELINE_URL=http://localhost:3001 node --import tsx scripts/check-desktop-layout-browser.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';
const base=process.env.TEST_BASE_URL||'http://localhost:3000';
const baseline=process.env.BASELINE_URL;
const output=process.env.DESKTOP_OUTPUT||'test-results/desktop-layout';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}:{});
const results=[];
async function capture(url,width,label){
 const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,reducedMotion:'reduce',locale:'en-GB'});
 await context.route('**/*',route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin===new URL(url).origin)return route.continue();
  const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(u.pathname==='/pricing/public')return json({config:toPublicOwnerPricingConfig(defaultOwnerPricingSettings())});
  if(u.pathname.includes('/route/v1/driving'))return json({code:'Ok',routes:[{distance:25000,duration:1800,geometry:{coordinates:[[-5.9302,54.5964],[-6.2158,54.6575]],type:'LineString'}}]});
  if(u.pathname==='/quote/availability')return json({blocked:false,available:true,alternativeTimes:[]});
  if(u.pathname.endsWith('/quote/calculate')){const j=req.postDataJSON();return json({ok:true,amount:60,amountLabel:'£60',vehicleType:j.vehicleType,vehicleChoice:'Saloon',premiumApplied:false,returnJourney:false,journeyFareGbp:60,airportFixedCostsGbp:0,nightWeekendSurchargeGbp:0,distanceKm:25,durationMinutes:30});}
  return route.abort();
 });
 const page=await context.newPage();await page.goto(url);await page.locator('#pickup').waitFor();await page.getByRole('button',{name:'Reject optional',exact:true}).click();await page.evaluate(()=>document.fonts.ready);
 const shot=async name=>{await page.waitForTimeout(300);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width&&r.height&&r.top<innerHeight&&r.bottom>0}).map(i=>i.decode().catch(()=>{})));});return page.screenshot({path:`${output}/${label}-${width}-${name}.png`,animations:'disabled'});};
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));const home=await shot('homepage');
 const nav=await page.locator('header').evaluate(header=>{const els=[...header.querySelectorAll('a')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height});const collisions=[];for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){const a=els[i].getBoundingClientRect(),b=els[j].getBoundingClientRect();if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)collisions.push([els[i].textContent,els[j].textContent]);}return collisions;});
 if(width>=1024&&label==='after')assert.deepEqual(nav,[],`${width}px header overlap`);
 await page.goto(url+'/?previewJourney=bfs&previewMinibus=1');await page.waitForFunction(()=>document.querySelector('#pickup')?.value.includes('City Hall'));await page.locator('#date').fill('2027-02-10');await page.locator('#time').fill('12:00');await page.locator('#quote-section-passengers').selectOption('2');await page.locator('#quote-section-suitcases').selectOption('2');await page.locator('#quote-section-suitcases').blur();await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));const fields=await shot('completed-form');
 for(const id of ['date','time']){await page.locator('#'+id).focus();await page.evaluate(()=>scrollTo({top:Math.max(0,document.querySelector('#pickup').getBoundingClientRect().top+scrollY-300),behavior:'instant'}));await shot(id+'-focused');}
 await page.getByRole('button',{name:/Get My Fixed Price/}).last().click();await page.getByRole('button',{name:/BOOK THIS TRANSFER/}).waitFor();await page.waitForTimeout(900); // existing quote reveal scroll animation
 await page.evaluate(()=>scrollTo({top:document.querySelector('#quote-results-summary').getBoundingClientRect().top+scrollY-document.querySelector('header').getBoundingClientRect().height-12,behavior:'instant'}));
 const vehicle=await shot('vehicle-selection');
 const metrics=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};return {headline:box('h1'),result:box('#quote-results-summary'),art:box('[data-vehicle-art-size="result"]'),button:box('#quote-book-now-button'),header:box('header'),overflow:document.documentElement.scrollWidth>innerWidth};});
 if(label==='after'&&width>=1024){assert.equal(metrics.overflow,false);assert.ok(metrics.button.bottom<=900,`${width}px booking button below fold: ${metrics.button.bottom}`);assert.ok(metrics.button.y>=metrics.header.bottom);assert.equal(await page.locator('#quote-section-passengers').inputValue(),'2');assert.equal(await page.locator('#quote-section-suitcases').inputValue(),'2');}
 results.push({label,width,nav,metrics});await context.close();return {home,fields,vehicle};
}
try{for(const width of [375,390,768,1023,1024,1280,1440,1920]){const before=baseline?await capture(baseline,width,'before'):null;const after=await capture(base,width,'after');if(before&&width<1024)for(const state of ['home','fields','vehicle']){const a=PNG.sync.read(before[state]),b=PNG.sync.read(after[state]);assert.equal(a.width,b.width);assert.equal(a.height,b.height);let changed=0;for(let i=0;i<a.data.length;i+=4)if(Math.max(...[0,1,2].map(c=>Math.abs(a.data[i+c]-b.data[i+c])))>20)changed++;assert.ok(changed<=a.width*a.height*0.0001,`${width}px ${state}: ${changed} materially changed pixels`);};console.log(`PASS ${width}px: ${width<1024?'unchanged mobile/tablet screenshots':'navigation, fare/button visibility, overflow and selected values'}`);}await fs.writeFile(`${output}/measurements.json`,JSON.stringify(results,null,2));}finally{await browser.close();}
