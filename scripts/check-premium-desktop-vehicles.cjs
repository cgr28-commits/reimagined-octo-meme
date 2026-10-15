// Run: PLAYWRIGHT_EXECUTABLE_PATH=/path/to/chromium node --import tsx scripts/check-premium-desktop-vehicles.cjs
// All API responses are intercepted. No live requests, customer messages or payments are made.
const {chromium}=require('playwright'),assert=require('assert/strict'),fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..'),harness=path.join(root,'src/app/desktop-style-check/page.tsx');
if(fs.existsSync(harness))throw new Error('Refusing to replace an existing test route');
fs.mkdirSync(path.dirname(harness),{recursive:true});
fs.writeFileSync(harness,`'use client';import {useEffect,useState} from 'react';import QuoteCard from '@/components/QuoteCard';import {quickSelectToPlace} from '@/lib/selected-place';import {PREVIEW_BELFAST_CITY_HALL_PLACE} from '@/lib/preview-customer-quote';export default function Check(){const [codes,setCodes]=useState<string[]|null>(null);useEffect(()=>{const p=new URLSearchParams(location.search);setCodes([p.get('from')||'BHD',p.get('to')||'HOME']);},[]);if(!codes)return null;const place=(c:string)=>c==='HOME'?PREVIEW_BELFAST_CITY_HALL_PLACE:quickSelectToPlace(c as 'BFS'|'BHD'|'DUB');return <main className="pt-24"><div className="homepage-hero-layout grid px-4"><div className="homepage-hero-quote"><QuoteCard presentation="homepage" initialPickupPlace={place(codes[0])} initialDropoffPlace={place(codes[1])}/></div></div></main>}`);
const {defaultOwnerPricingSettings,toPublicOwnerPricingConfig}=require('../shared/owner-pricing-config.ts');
const config=toPublicOwnerPricingConfig(defaultOwnerPricingSettings());config.executive.requestQuote=true;config.minibus={...config.minibus,requestQuote:true,publicEnabled:true};
const date=new Date(Date.now()+10*86400000).toISOString().slice(0,10),retDate=new Date(Date.now()+12*86400000).toISOString().slice(0,10);
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3097'],{cwd:root,stdio:['ignore','pipe','pipe']});server.stdout.resume();server.stderr.resume();
let browser;let publicSummary,requestCount=0;const payments=[],errors=[],submitted=[];
(async()=>{for(let i=0;i<80;i++){try{await fetch('http://127.0.0.1:3097/',{signal:AbortSignal.timeout(1500)});break}catch{await new Promise(r=>setTimeout(r,500))}}
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});const c=await browser.newContext();
 await c.route('https://**/*',async r=>{const u=r.request().url();
  if(u.includes('/pricing/public'))return r.fulfill({json:{config}});
  if(u.includes('/route/v1/'))return r.fulfill({json:{code:'Ok',routes:[{distance:25000,duration:1500,geometry:{coordinates:[]}}]}});
  if(u.includes('/quote/calculate')){const q=r.request().postDataJSON();return r.fulfill({json:{ok:true,vehicleType:q.vehicleType,amount:65,journeyFareGbp:60,airportFixedCostsGbp:0,nightWeekendSurchargeGbp:0,distanceKm:25,durationMinutes:25}})}
  if(u.includes('/a2a-quotes/by-token'))return r.fulfill({json:{ok:true,quote:publicSummary}});
  if(u.endsWith('/a2a-quotes')){requestCount++;submitted.push(r.request().postDataJSON());return r.fulfill({json:{ok:true,reference:'MATNI-AQ-ISOLATED-TEST',status:'AWAITING_QUOTE'}})}
  if(u.endsWith('/bookings'))return r.fulfill({json:{ok:true,bookingReference:'MATNI-TEST',bookingSaved:true,emailSent:true}});
  if(u.endsWith('/payments')){payments.push(r.request().postDataJSON());return r.fulfill({json:{ok:true,checkoutId:'isolated-checkout',paymentUrl:'http://127.0.0.1:3097/sandbox-checkout'}})}
  if(u.includes('workers.dev'))return r.fulfill({json:{ok:true,available:true,blocked:false,settings:{}}});return r.abort();
 });
 await c.route('**/sandbox-checkout',r=>r.fulfill({body:'Isolated checkout test — no payment taken',contentType:'text/html'}));
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));

 const ids=['saloon','estate','executive','minibus'];
 const results=[];
 for(const width of [320,375,390,430,768,1023,1024,1280,1440,1920]) {
  await p.setViewportSize({width,height:1100});
  await p.goto('http://127.0.0.1:3097/desktop-style-check?from=HOME&to=BFS');
  await p.locator('#quote-section-passengers').waitFor();
  const consent=p.getByRole('button',{name:'Essential only',exact:true});if(await consent.isVisible())await consent.click();
  await p.evaluate(({date})=>window.dispatchEvent(new CustomEvent('quote-prefill-draft',{detail:{passengers:1,suitcases:1,returnJourney:false,tripDate:date,tripTime:'12:00'}})),{date});
  await p.getByRole('button',{name:'Get My Fixed Price',exact:false}).click();
  await p.locator('[data-quote-result-card]').waitFor();
  for (const id of ids) {
   await p.locator('[data-vehicle-category='+id+']').click();
   await p.waitForFunction(id=>document.querySelector('[data-vehicle-category='+id+']')?.getAttribute('aria-pressed')==='true',id);
   if (id==='executive'||id==='minibus') await p.locator('[data-quote-manual-state]').waitFor();
   else await p.getByRole('button',{name:/BOOK THIS TRANSFER/}).waitFor();
   const state=await p.evaluate(()=>{
    const rect=n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height}};
    const nodes=[...document.querySelectorAll('[data-vehicle-category]')];
    return {cards:nodes.map(n=>({id:n.dataset.vehicleCategory,...rect(n),text:n.innerText,bg:getComputedStyle(n).backgroundImage,border:getComputedStyle(n).borderColor,image:n.querySelector('img').currentSrc,imageReady:n.querySelector('img').naturalWidth>0})),summary:rect(document.querySelector('[data-quote-result-card]')),text:document.querySelector('[data-quote-result-card]').innerText,overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...document.querySelectorAll('[data-vehicle-category] span,[data-quote-result-card] p')].filter(n=>n.innerText.trim()&&!n.closest(".sr-only")&&n.clientWidth>8&&n.clientHeight>8&&n.scrollWidth>n.clientWidth+2).map(n=>n.innerText),contact:[...document.querySelectorAll('[data-quote-help-inline]')].map(n=>getComputedStyle(n).display)};
   });
   assert.deepEqual(state.cards.map(n=>n.id),ids);
   if(width>=1024)assert.ok(state.cards[3].x+state.cards[3].w-state.cards[0].x<=864,'fixture must respect real homepage quote width');
   assert.equal(state.overflow,false,width+' '+id+' horizontal overflow');
   assert.deepEqual(state.clipped,[],width+' '+id+' clipped text');
   assert.ok(state.cards.every(n=>n.imageReady));
   assert.match(state.cards[2].text,/1–3 passengers/);
   if(id==='executive')assert.match(state.text,/1–3 passengers/);
   assert.ok(state.summary.y>=Math.max(...state.cards.map(n=>n.y+n.h))-1);
   if(width>=1024){
    for(const card of state.cards){assert.ok(Math.abs(card.y-state.cards[0].y)<1);assert.ok(Math.abs(card.w-state.cards[0].w)<1);assert.ok(Math.abs(card.h-state.cards[0].h)<1);assert.match(card.bg,/gradient/);assert.match(card.image,/-transparent.webp/)}
    assert.ok(state.contact.every(v=>v==='none'));
   } else if(width<=767) {
    assert.ok(state.cards.every((n,i)=>i===0||n.y>state.cards[i-1].y));
    assert.ok(state.cards.every(n=>n.image.includes('-transparent.webp')));
   } else assert.ok(state.cards.every(n=>!n.image.includes('-transparent.webp')));
   if(width===1440&&(id==='saloon'||id==='minibus')) {
    await p.evaluate(()=>window.scrollTo(0,0));await p.waitForTimeout(200);
    const clip=await p.evaluate(()=>{const a=document.querySelector('[data-quote-vehicle-categories]').getBoundingClientRect(),b=document.querySelector('[data-quote-result-card]').getBoundingClientRect();return {x:a.x-12,y:a.y+scrollY-12,width:a.width+24,height:b.bottom-a.y+24}});
    await p.screenshot({path:root+'/../premium-desktop-'+id+'.png',clip,fullPage:true});
   }
   results.push({width,id,...state});
  }
  console.log('OK '+width+'px: all four selections, pricing/manual actions, images, text and geometry');
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(root+'/../premium-desktop-browser-results.json',JSON.stringify(results,null,2));
 fs.rmSync(path.dirname(harness),{recursive:true});await browser.close();server.kill();
})().catch(async e=>{console.error(e);fs.rmSync(path.dirname(harness),{recursive:true});if(browser)await browser.close();server.kill();process.exitCode=1});
