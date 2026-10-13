import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
const base=process.env.TEST_BASE_URL||'http://localhost:3000';
const output='test-results/ireland-north';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch();
try{
 for(const width of [390,1280])for(const [origin,destination] of [['dublin','belfast'],['cork','ballymena'],['galway','coleraine'],['derry','belfast']])for(const returnJourney of [false,true]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin===new URL(base).origin)return route.continue();
   if(url.pathname.includes('/route/v1/driving'))return route.fulfill({contentType:'application/json',body:JSON.stringify({code:'Ok',routes:[{distance:175000,duration:7500,geometry:{coordinates:[[-6.272,53.339],[-5.9358,54.5946]],type:'LineString'}}]})});
   if(url.pathname==='/quote/availability')return route.fulfill({contentType:'application/json',body:JSON.stringify({blocked:false,available:true,alternativeTimes:[]})});
   return route.abort();
  });
  const page=await context.newPage();await page.goto(`${base}/?previewJourney=ireland-north&previewOrigin=${origin}&previewDestination=${destination}&previewPax=4&previewBags=4&previewMinibus=1`);
  await page.waitForFunction(()=>document.getElementById('pickup')?.value.length>0);
  if(await page.getByRole('button',{name:'Essential only',exact:true}).isVisible())await page.getByRole('button',{name:'Essential only',exact:true}).click();
  if(returnJourney)await page.getByRole('button',{name:/Return/i}).first().click();
  await page.getByRole('button',{name:'Get My Fixed Price →',exact:true}).last().click();
  const book=page.getByRole('button',{name:/BOOK THIS TRANSFER/i});await book.waitFor();
  await page.locator('[data-vehicle-category="estate"]').click();
  const result=page.locator('[data-quote-results="ready"]');assert.match(await result.innerText(),/£\d/);
  assert.doesNotMatch(await result.innerText(),/Out-of-area pickup|request your fixed price/);
  await result.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${output}/${width}-${origin}-${destination}-${returnJourney?'return':'oneway'}-quote.png`});
  await book.click();await page.locator('#date').waitFor({state:'visible'});
  assert.ok(await page.locator('#name').isVisible());
  await page.locator('#date').fill('');await page.locator('#time').fill('');
  await page.locator('#step2-journey-summary').scrollIntoViewIfNeeded();
  await page.screenshot({path:`${output}/${width}-${origin}-${destination}-${returnJourney?'return':'oneway'}-booking.png`});
  await page.locator('[data-back-to-quote]').first().click();
  assert.equal(await page.locator('#quote-section-passengers').inputValue(),'4');
  assert.equal(await page.locator('#quote-section-suitcases').inputValue(),'4');
  console.log(`PASS ${width}px ${origin}-${destination} ${returnJourney?'return':'oneway'}: instant Estate quote, booking fields, selections retained, no overflow`);
  await context.close();
 }
}finally{await browser.close();}
