// Mocked APIs only: never sends owner emails or starts real payments.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'), fs=require('node:fs');
const {spawn}=require('node:child_process');
const {defaultOwnerPricingSettings,toPublicOwnerPricingConfig}=require('../shared/owner-pricing-config.ts');
const server=spawn('python3',['-m','http.server','3096','--bind','127.0.0.1','--directory','out'],{stdio:'ignore'});
async function main(){
 let browser, activePage;
 try {
  for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:3096')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
  fs.mkdirSync('test-results/booking-funnel',{recursive:true});
  for(const width of (process.env.FUNNEL_OWNER_ONLY ? [] : [320,360,375,390,1440])){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
   const events=[];const errors=[];
   await context.route('**/*',async route=>{
    const u=route.request().url();
    if(u.startsWith('http://127.0.0.1:3096/'))return route.continue();
    if(u.includes('/quote-leads')){events.push(route.request().postDataJSON());if(width===390 && events.filter(e=>e.kind==='booking_started').length===1 && events.at(-1).kind==='booking_started')return route.fulfill({status:503,json:{error:'Simulated email outage'}});return route.fulfill({json:{ok:true,recorded:true,emailed:true}});}
    if(u.includes('/pricing/public'))return route.fulfill({json:{ok:true,config:toPublicOwnerPricingConfig(defaultOwnerPricingSettings())}});
    if(u.includes('/saved-quotes/settings'))return route.fulfill({json:{ok:true,settings:{enabled:true,popupEnabled:false}}});
    if(u.includes('/quote/calculate'))return route.fulfill({json:{ok:true,amount:50,journeyFareGbp:50,airportFixedCostsGbp:0,nightWeekendSurchargeGbp:0,vehicleType:route.request().postDataJSON().vehicleType,distanceKm:25,durationMinutes:25}});
    if(u.includes('/route/v1/'))return route.fulfill({json:{code:'Ok',routes:[{distance:25000,duration:1500,geometry:{coordinates:[]}}]}});
    if(u.includes('workers.dev')||u.includes('localhost:8787')||u.startsWith('https://booking-funnel.test/'))return route.fulfill({json:{ok:true,available:true,blocked:false,settings:{}}});
    return route.abort();
   });
   const page=await context.newPage();activePage=page;page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:3096/?previewJourney=bfs&previewPax=1&previewBags=1');
   await page.getByRole('button',{name:'Reject optional',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#pickup')?.value && document.querySelector('#dropoff')?.value);
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('quote-prefill-draft',{detail:{passengers:1,suitcases:1,vehicle:'Standard Saloon (1–4 passengers)',returnJourney:false,tripDate:new Date(Date.now()+10*86400000).toISOString().slice(0,10),tripTime:'12:00'}})));
   await page.getByRole('button',{name:'Get My Fixed Price',exact:false}).click();
   await page.locator('[data-quote-result-card] #quote-book-now-button').waitFor();
   assert.equal(events.filter(e=>e.kind==='booking_started').length,0);
   await page.locator('[data-quote-result-card] #quote-book-now-button').click();
   await page.getByPlaceholder('John Smith').waitFor();
   await page.waitForTimeout(200);
   assert.equal(events.filter(e=>e.kind==='booking_started').length,1, 'Immediate booking-click event');
   const click=events.find(e=>e.kind==='booking_started');
   for(const key of ['customerName','customerEmail','mobileNumber'])assert.equal(click[key],undefined);
   for(const key of ['pickupLabel','dropoffLabel','vehicle','estimatedPrice','quoteTransactionId'])assert.ok(click[key]);
   await page.getByPlaceholder('John Smith').fill('Test Only');
   await page.waitForTimeout(200);
   assert.equal(events.filter(e=>e.kind==='details_opened').length,1);
   assert.equal(events.filter(e=>e.kind==='contact'||e.kind==='details_submitted').length,0,'Typing must not send contact details');
   await page.getByRole('button',{name:'Back to your quote',exact:false}).first().click();
   await page.locator('[data-quote-result-card] #quote-book-now-button').click();
   await page.getByPlaceholder('John Smith').waitFor();await page.waitForTimeout(200);
   assert.equal(events.filter(e=>e.kind==='booking_started').length,width===390?2:1,'Retry failed send on next click, dedupe successful sends');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`test-results/booking-funnel/booking-${width}.png`});
   assert.deepEqual(errors,[]);await context.close();console.log('PASS booking click and contact focus at',width);
  }
  for(const width of [320,1440]){
   const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
   const statsRequests=[];
   await context.addInitScript(()=>sessionStorage.setItem('matni-owner-key','mock-owner-only'));
   await context.route('**/*',async route=>{
    const u=route.request().url();if(u.startsWith('http://127.0.0.1:3096/'))return route.continue();
    if(u.includes('/quote-stats')){
     statsRequests.push({url:u,key:route.request().headers()['x-driver-key']});
     if(new URL(u).searchParams.get('day')==='2026-10-22')return route.fulfill({json:{ok:true,funnel:{day:'2026-10-22',truncated:false,quotes:0,started:0,detailsOpened:0,detailsSubmitted:0,paymentOpened:0,paid:0,rows:[]}}});
     return route.fulfill({json:{ok:true,funnel:{day:'2026-10-23',truncated:false,quotes:2,started:2,detailsOpened:1,detailsSubmitted:1,paymentOpened:1,paid:1,rows:[
     {quoteTransactionId:'quote_example123',pickupLabel:'Belfast City Hall',dropoffLabel:'Dublin Airport',vehicle:'Saloon',estimatedPriceLabel:'£255',booked:false,lastStage:'Booking started',lastAt:'2026-10-23T12:00:00Z',possiblyAbandoned:true},
     {quoteTransactionId:'quote_example456',pickupLabel:'Belfast',dropoffLabel:'Belfast International Airport',vehicle:'Estate',estimatedPriceLabel:'£55',booked:true,lastStage:'Payment confirmed',lastAt:'2026-10-23T12:15:00Z',possiblyAbandoned:false}]}}});
    }
    return route.fulfill({json:{ok:true,role:'owner',jobs:[],drivers:[],availableDrivers:[],configured:true,entries:[],settings:{}}});
   });
   const page=await context.newPage();activePage=page;await page.goto('http://127.0.0.1:3096/owner/?tab=more');
   await page.getByRole('button',{name:'Reject optional',exact:true}).click();
   await page.getByRole('dialog',{name:'Cookie consent'}).waitFor({state:'hidden'});
   const [statsResponse]=await Promise.all([
    page.waitForResponse(r=>new URL(r.url()).pathname==='/quote-stats',{timeout:10000}),
    page.getByRole('button',{name:'Enquiries',exact:false}).click(),
   ]);
   assert.equal(statsResponse.status(),200,'Owner panel must fetch the funnel fixture');
   assert.ok(statsRequests.length>0,'No funnel API request: check the build-time NEXT_PUBLIC_BOOKINGS_API_URL');
   assert.ok(statsRequests.every(r=>new URL(r.url).origin==='https://booking-funnel.test' && r.key==='mock-owner-only'),'Funnel requests must use the configured mock API and existing owner header');
   const panel=page.locator('[data-booking-funnel]');await panel.waitFor();
   await page.getByText('Possibly abandoned — no recent stage recorded',{exact:true}).waitFor();
   await panel.scrollIntoViewIfNeeded();
   assert.equal(await panel.locator('li').count(),2);
   assert.deepEqual(await panel.locator('dd').allTextContents(),['2','2','1','1','1','1']);
   assert.equal(await panel.getByText('Possibly abandoned — no recent stage recorded',{exact:true}).count(),1);
   assert.ok((await panel.locator('li').nth(1).innerText()).includes('Payment confirmed'));
   assert.ok(!(await panel.locator('li').nth(1).innerText()).includes('Possibly abandoned'));
   assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth));
   await panel.screenshot({path:`test-results/booking-funnel/dashboard-${width}.png`});
   const nextDate=page.waitForResponse(r=>new URL(r.url()).pathname==='/quote-stats' && new URL(r.url()).searchParams.get('day')==='2026-10-22');
   await panel.locator('input[type=date]').fill('2026-10-22');await nextDate;
   await panel.getByText('No quote sessions recorded for this date.',{exact:true}).waitFor();
   assert.equal(await panel.locator('li').count(),0,'Selecting another date must not retain old attempts');
   assert.deepEqual(await panel.locator('dd').allTextContents(),['0','0','0','0','0','0']);
   await context.close();console.log('PASS owner dashboard, authorization header, stages and date change at',width);
  }
 } catch(error) {
  if(activePage && !activePage.isClosed()){
   await activePage.screenshot({path:'test-results/booking-funnel/failure.png',fullPage:true}).catch(()=>{});
   fs.writeFileSync('test-results/booking-funnel/failure.txt',await activePage.locator('body').innerText().catch(()=>''));
  }
  throw error;
 } finally {await browser?.close();server.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
