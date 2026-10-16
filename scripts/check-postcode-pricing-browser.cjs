// PLAYWRIGHT_EXECUTABLE_PATH=/path/to/chromium node --import tsx scripts/check-postcode-pricing-browser.cjs
// Production-shaped browser origin, but ALL requests are intercepted. Only a local dev server
// and an in-memory Worker are used. No real owner keys, live KV, messages or payments.
const {chromium}=require('playwright'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'), routeFile=path.join(root,'src/app/postcode-flow-check/page.tsx');
if(fs.existsSync(routeFile))throw new Error('Refusing to overwrite an existing route');
fs.mkdirSync(path.dirname(routeFile),{recursive:true});
fs.writeFileSync(routeFile,`'use client';import {useEffect,useState} from 'react';import OwnerPostcodePricingPanel from '@/components/OwnerPostcodePricingPanel';import QuoteCard from '@/components/QuoteCard';import {quickSelectToPlace} from '@/lib/selected-place';import {PREVIEW_BELFAST_CITY_HALL_PLACE} from '@/lib/preview-customer-quote';export default function Check(){const [mode,setMode]=useState('');const [airport,setAirport]=useState<'BFS'|'BHD'|'DUB'>('DUB');useEffect(()=>{const p=new URLSearchParams(location.search);setMode(p.get('mode')||'admin');setAirport((p.get('to')||'DUB') as 'BFS'|'BHD'|'DUB')},[]);return <main><div style={{maxWidth:900,margin:'auto',padding:16}}>{mode==='quote'?<QuoteCard presentation="homepage" initialPickupPlace={PREVIEW_BELFAST_CITY_HALL_PLACE} initialDropoffPlace={quickSelectToPlace(airport)}/>:mode==='admin'?<OwnerPostcodePricingPanel ownerKey="isolated-owner"/>:null}</div></main>}`);
const worker=require('../workers/addresses/src/index.ts').default;
const {defaultOwnerPricingSettings}=require('../shared/owner-pricing-config.ts');
const {getOwnerPricingSettings,saveOwnerPricingSettings}=require('../workers/addresses/src/owner-pricing-store.ts');
const data=new Map();
const store={async get(k,t){const v=data.get(k);return v==null?null:t==='json'?JSON.parse(v):v},async put(k,v){data.set(k,v)},async delete(k){data.delete(k)},async list(){return {keys:[],list_complete:true}}};
const env={TRACKING_STORE:store,OWNER_ACCESS_KEY:'isolated-owner',DRIVER_ACCESS_KEY:'isolated-driver',GOOGLE_PLACES_API_KEY:'isolated-test-google'};
const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3098'],{cwd:root,stdio:['ignore','pipe','pipe']});
 let log='',browser,activePage,historical,oldServer,frontendVersion='new',backendVersion='new';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
const date=new Date(Date.now()+10*86400000).toISOString().slice(0,10), failures=[], api=[];
const realFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=String(input instanceof Request?input.url:input);
 if(url.startsWith('http://127.0.0.1:3098/')||url.startsWith('http://127.0.0.1:3097/'))return realFetch(input,init);
 if(url.includes('maps.googleapis.com')||url.includes('places.googleapis.com'))return new Response(JSON.stringify({status:'OK',result:{geometry:{location:{lat:54.5964,lng:-5.9302}}},results:[{geometry:{location:{lat:54.5964,lng:-5.9302}}}],location:{latitude:54.5964,longitude:-5.9302}}),{headers:{'Content-Type':'application/json'}});
 if(url.includes('/route/v1/'))return new Response(JSON.stringify({code:'Ok',routes:[{distance:159000,duration:6720}]}),{headers:{'Content-Type':'application/json'}});
 throw new Error('Blocked unexpected external request in isolated browser test: '+url);
};
async function main(){try{
 historical=await require('./postcode-legacy-harness.cjs').startLegacyHarness(root);
 const oldRoute=path.join(historical.root,'src/app/postcode-flow-check/page.tsx');fs.mkdirSync(path.dirname(oldRoute),{recursive:true});fs.writeFileSync(oldRoute,fs.readFileSync(routeFile));
 oldServer=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3097'],{cwd:historical.root,stdio:['ignore','pipe','pipe']});oldServer.stdout.on('data',b=>log+=b);oldServer.stderr.on('data',b=>log+=b);
 for(let i=0;i<80;i++){try{await fetch('http://127.0.0.1:3098/',{signal:AbortSignal.timeout(1500)});break}catch{await new Promise(r=>setTimeout(r,500))}}
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',async r=>{
  const request=r.request(),u=new URL(request.url());
  if(u.origin==='https://www.myairporttaxini.co.uk'){
   const local=await fetch('http://127.0.0.1:'+(frontendVersion==='old'?'3097':'3098')+u.pathname+u.search);const headers=Object.fromEntries(local.headers);delete headers['content-encoding'];delete headers['content-length'];
   return r.fulfill({status:local.status,headers,body:Buffer.from(await local.arrayBuffer())});
  }
  if(u.pathname.includes('/route/v1/'))return r.fulfill({json:{code:'Ok',routes:[{distance:159000,duration:6720,geometry:{coordinates:[]}}]}});
  if(u.hostname.endsWith('workers.dev')){
   if(u.pathname==='/addresses'){
    const address='Belfast City Hall, Donegall Square N, Belfast BT1 5GS, UK';
    return r.fulfill({json:u.searchParams.has('id')?{address,formattedAddress:address,placeId:'isolated-city-hall',placeName:'Belfast City Hall',lat:54.5964,lng:-5.9302,countryCode:'GB',postalCode:'BT1 5GS',locality:'Belfast'}:{suggestions:[{id:'isolated-city-hall',label:address,address,mainText:'Belfast City Hall',secondaryText:'Belfast BT1 5GS'}]}});
   }
   if(['/owner/pricing','/pricing/public','/quote/calculate','/owner/postcode-preview'].includes(u.pathname)){
    if(backendVersion==='old'){const result=await historical.call({path:u.pathname,method:request.method(),headers:request.headers(),...(request.method()==='GET'?{}:{body:JSON.parse(request.postData())})});api.push({path:u.pathname,method:request.method(),status:result.status});return r.fulfill({status:result.status,json:result.body})}
    const headers={...request.headers(),Origin:'https://www.myairporttaxini.co.uk'};
    const result=await worker.fetch(new Request('https://worker.example'+u.pathname,{method:request.method(),headers,...(request.method()==='GET'?{}:{body:request.postData()})}),env);
    api.push({path:u.pathname,method:request.method(),status:result.status});
    return r.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:await result.text()});
   }
   return r.fulfill({json:{ok:true,available:true,blocked:false,settings:{}}});
  }
  // No third-party traffic can escape this harness.
  return r.abort();
 });
 const page=await context.newPage();activePage=page;page.on('pageerror',e=>failures.push(e.message));page.on('dialog',d=>d.accept());
 const url='https://www.myairporttaxini.co.uk/postcode-flow-check';
 const names={DUB:'Dublin Airport',BFS:'Belfast International Airport',BHD:'Belfast City Airport'};
 const row=(d,code='DUB')=>page.getByRole('row').filter({has:page.getByRole('rowheader',{name:d,exact:true})}).filter({has:page.getByRole('cell',{name:names[code],exact:true})}).filter({has:page.getByRole('cell',{name:/^To airport/})});
 const save=async()=>{await page.getByRole('button',{name:'Save postcode pricing',exact:true}).click();await page.getByRole('status').filter({hasText:'Postcode pricing rules saved.'}).waitFor();};
 const reloadPricing=async()=>{await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/owner/pricing'&&r.request().method()==='GET'),page.getByRole('button',{name:'Reload pricing',exact:true}).click()]);await row('BT2').waitFor();};
 const legacy={...defaultOwnerPricingSettings(),version:205,updatedAt:'2026-10-16T03:35:06.718Z',postcodeRules:require('../shared/postcode-pricing.ts').APPROVED_POSTCODE_RULES,profitability:require('../src/lib/owner-profitability-settings.ts').approvedProductionProfitabilitySettings()};delete legacy.postcodePricingEnabled;legacy.night.enabled=false;legacy.weekend.enabled=false;
 data.set('owner:pricing-settings',JSON.stringify(legacy));await historical.call({kind:'init',settings:legacy,ownerKey:'isolated-owner'});
 for(const [front,back] of [['new','old'],['old','new']]){
  frontendVersion=front;backendVersion=back;await page.setViewportSize({width:390,height:1000});
  for(const [airport,saloon,estate] of [['BHD',35,45],['BFS',55,65],['DUB',245,255]]){
   await page.goto(url+'?mode=quote&to='+airport);await page.locator('#quote-section-passengers').waitFor();
   await page.evaluate(date=>window.dispatchEvent(new CustomEvent('quote-prefill-draft',{detail:{passengers:2,suitcases:1,returnJourney:false,tripDate:date,tripTime:'12:00'}})),date);
   await page.getByRole('button',{name:'Get My Fixed Price',exact:false}).click();await page.getByRole('button',{name:new RegExp('BOOK THIS TRANSFER.*£'+saloon+'$')}).waitFor();
   await page.locator('[data-vehicle-category="estate"]').click();await page.getByRole('button',{name:new RegExp('BOOK THIS TRANSFER.*£'+estate+'$')}).waitFor();
   await page.getByRole('button',{name:new RegExp('BOOK THIS TRANSFER.*£'+estate+'$')}).click();await page.getByPlaceholder('John Smith').waitFor();
  }
  console.log('OK real '+front+' frontend / '+back+' Worker: all three airports Saloon/Estate unchanged through booking form, legacy v205 config not migrated');
 }
 frontendVersion='new';backendVersion='old';await page.goto(url);await page.getByRole('status').filter({hasText:'Postcode management upgrade pending'}).waitFor();assert.equal(await page.getByLabel('Enable postcode pricing feature',{exact:true}).isChecked(),true);assert.equal(await page.getByLabel('Enable postcode pricing feature',{exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Save postcode pricing',exact:true}).isDisabled(),true);
 assert.equal(JSON.stringify([...data].filter(([k])=>k.startsWith('owner:pricing'))),JSON.stringify([['owner:pricing-settings',JSON.stringify(legacy)]]),'Rollout customer/read-only admin flows do not rewrite pricing or audit');
 frontendVersion='new';backendVersion='new';
 for(const width of [390,1280]){
  data.clear();const defaults=defaultOwnerPricingSettings();defaults.night.enabled=false;defaults.weekend.enabled=false;defaults.profitability=require('../src/lib/owner-profitability-settings.ts').approvedProductionProfitabilitySettings();data.set('owner:pricing-settings',JSON.stringify(defaults));
  await page.setViewportSize({width,height:1000});await page.goto(url);
  await page.getByRole('button',{name:'Load approved BT1 / BT2 airport rules',exact:true}).waitFor();
  const cookie=page.getByRole('button',{name:'Essential only',exact:true});if(await cookie.isVisible())await cookie.click();
  await page.getByRole('button',{name:'Load approved BT1 / BT2 airport rules',exact:true}).click();
  assert.equal((await getOwnerPricingSettings(store)).postcodeRules.length,0,'Loading proposal does not activate it');
  assert.match(await row('BT1').innerText(),/£245.00\s+£255.00/);await save();
  assert.equal((await getOwnerPricingSettings(store)).postcodeRules.length,12);
  assert.equal((await getOwnerPricingSettings(store)).postcodePricingEnabled,false,'Saving draft fares keeps feature OFF');
  await page.getByLabel('Direction filter',{exact:true}).selectOption('to-airport');
  await row('BT1').getByRole('button',{name:/Preview/}).click();
  await page.locator('table').evaluate(t=>{t.parentElement.scrollLeft=0;});
  await page.screenshot({path:root+'/../postcode-management-admin-'+width+'.png',fullPage:true});
  await page.getByLabel('Direction filter',{exact:true}).selectOption('');
  await page.getByLabel('Enable postcode pricing feature',{exact:true}).check();
  for(const d of ['BT1','BT2'])for(const code of ['DUB','BFS','BHD'])await row(d,code).getByRole('checkbox').check();
  await save();
  await page.getByLabel('Fare approval',{exact:true}).selectOption('approved');
  await page.getByLabel('Rule enabled',{exact:true}).check();
  await page.getByLabel('Postcode district',{exact:true}).fill('bt3');await page.getByLabel('Destination airport',{exact:true}).selectOption('BHD');await page.getByLabel('Fixed Saloon fare',{exact:true}).fill('90');await page.getByRole('button',{name:'Add to draft',exact:true}).click();await save();
  await row('BT3','BHD').getByRole('button',{name:/Edit/}).click();await page.getByLabel('Fixed Saloon fare',{exact:true}).fill('95');await page.getByRole('button',{name:'Update draft rule',exact:true}).click();await save();
  await row('BT3','BHD').getByRole('checkbox').uncheck();await save();
  await page.getByLabel('Search configured rules',{exact:true}).fill('bt3');assert.equal(await page.getByRole('rowheader').count(),1);assert.match(await row('BT3','BHD').innerText(),/£95.00\s+£105.00/);
  await row('BT3','BHD').getByRole('button',{name:/Delete/}).click();await save();await page.getByLabel('Search configured rules',{exact:true}).fill('');
  await reloadPricing();assert.equal(await page.getByRole('rowheader').count(),12);
  await row('BT1').getByRole('button',{name:/Preview/}).click();await page.getByText('Customer fare: £245.00',{exact:true}).waitFor();
  await page.getByLabel('Preview vehicle',{exact:true}).selectOption('estate');await page.getByText('Customer fare: £255.00',{exact:true}).waitFor();
  await page.locator('#postcode-preview-address').fill('Belfast City Hall');
  await page.getByRole('option').filter({hasText:'Belfast City Hall'}).first().click();
  const beforePreview=JSON.stringify([...data]);
  await page.getByRole('button',{name:'Measure profitability',exact:true}).click();
  await page.getByText('Total working mileage',{exact:true}).waitFor();
  assert.equal(JSON.stringify([...data]),beforePreview,'Private preview never persists or activates anything');
  await page.getByLabel('Postcode district',{exact:true}).fill('BT1');await page.getByLabel('Destination airport',{exact:true}).selectOption('DUB');await page.getByLabel('Fixed Saloon fare',{exact:true}).fill('100');await page.getByRole('button',{name:'Add to draft',exact:true}).click();await page.getByRole('alert').filter({hasText:'Only one rule'}).waitFor();
  // A second admin save makes this UI stale; its next save must not overwrite the new version.
  const current=await getOwnerPricingSettings(store);await saveOwnerPricingSettings(store,current,{expectedVersion:current.version});
  await row('BT1').getByRole('checkbox').uncheck();await page.getByRole('button',{name:'Save postcode pricing',exact:true}).click();await page.getByRole('alert').filter({hasText:'another session'}).waitFor();
  await reloadPricing();assert.equal(await row('BT1').getByRole('checkbox').isChecked(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:root+'/../postcode-admin-'+width+'.png',fullPage:true});
  console.log('OK '+width+'px admin: load proposal without activation, owner API save/readback, add/edit/disable/delete/search, duplicate validation, stale-save protection, no page overflow');
  for(const [airport,saloon,estate] of [['DUB',245,255],['BFS',55,65],['BHD',35,45]]){
  await page.goto(url+'?mode=quote&to='+airport);await page.locator('#quote-section-passengers').waitFor();
  await page.evaluate(date=>window.dispatchEvent(new CustomEvent('quote-prefill-draft',{detail:{passengers:2,suitcases:1,returnJourney:false,tripDate:date,tripTime:'12:00'}})),date);
  await page.getByRole('button',{name:'Get My Fixed Price',exact:false}).click();
  await page.getByRole('button',{name:new RegExp('BOOK THIS TRANSFER.*£'+saloon+'$')}).waitFor();
  await page.locator('[data-vehicle-category="estate"]').click();await page.getByRole('button',{name:new RegExp('BOOK THIS TRANSFER.*£'+estate+'$')}).waitFor();
  await page.getByRole('button',{name:new RegExp('BOOK THIS TRANSFER.*£'+estate+'$')}).click();await page.getByPlaceholder('John Smith').waitFor();
  assert.match(await page.locator('body').innerText(),new RegExp('£'+estate));
  console.log('OK '+width+'px '+airport+': saved rules → Worker quote → final £'+saloon+' Saloon / £'+estate+' Estate including airport charges → booking details');
  }
  const penceSettings=await getOwnerPricingSettings(store);await saveOwnerPricingSettings(store,{...penceSettings,postcodeRules:penceSettings.postcodeRules.map(r=>r.district==='BT1'&&r.airportCode==='DUB'&&(r.direction||'to-airport')==='to-airport'?{...r,saloonFareGbp:245.45}:r)},{expectedVersion:penceSettings.version});
  await new Promise(r=>setTimeout(r,10500)); // Existing public quote settings cache; no product cache changes.
  await page.goto(url+'?mode=quote&to=DUB');await page.locator('#quote-section-passengers').waitFor();
  await page.evaluate(date=>window.dispatchEvent(new CustomEvent('quote-prefill-draft',{detail:{passengers:2,suitcases:1,returnJourney:false,tripDate:date,tripTime:'12:00'}})),date);
  await page.getByRole('button',{name:'Get My Fixed Price',exact:false}).click();await page.getByRole('button',{name:/BOOK THIS TRANSFER.*£245\.45$/}).waitFor();
  await page.locator('[data-vehicle-category="estate"]').click();await page.getByRole('button',{name:/BOOK THIS TRANSFER.*£255\.45$/}).waitFor();
  console.log('OK '+width+'px explicitly configured pence fare: fixed £245.45 / £255.45 shown exactly, ordinary whole-pound rounding unaffected');
  await page.goto(url);await page.getByRole('button',{name:'Load inactive workbook drafts',exact:true}).waitFor();
  await page.getByRole('button',{name:'Load inactive workbook drafts',exact:true}).click();
  await page.getByLabel('Status filter',{exact:true}).selectOption('needs-verification');
  await page.getByRole('status').filter({hasText:'474 matching rules'}).waitFor();assert.equal(await page.getByRole('rowheader').count(),25);
  await page.getByLabel('Airport filter',{exact:true}).selectOption('BHD');
  await page.getByLabel('Direction filter',{exact:true}).selectOption('from-airport');
  await page.getByRole('status').filter({hasText:'80 matching rules'}).waitFor();assert.equal(await page.getByRole('rowheader').count(),25);
  await page.getByRole('button',{name:'Next rules',exact:true}).click();await page.getByRole('status').filter({hasText:'Page 2 of 4'}).waitFor();await page.getByRole('button',{name:'Previous rules',exact:true}).click();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export CSV',exact:true}).click();
  const download=await downloadPromise;const csv=fs.readFileSync(await download.path(),'utf8');assert.match(csv,/district,airportCode,direction,saloonFareGbp/);assert.equal(csv.trim().split('\n').length,481);
  await page.getByLabel('Import postcode CSV',{exact:true}).setInputFiles({name:'draft.csv',mimeType:'text/csv',buffer:Buffer.from('district,airportCode,direction,saloonFareGbp,approvalStatus,enabled,updatedAt\r\nBT58,DUB,to-airport,200.00,approved,true,\r\n')});
  await page.getByLabel('Status filter',{exact:true}).selectOption('');await page.getByLabel('Airport filter',{exact:true}).selectOption('');await page.getByLabel('Direction filter',{exact:true}).selectOption('');await page.getByLabel('Search configured rules',{exact:true}).fill('BT58');
  assert.equal(await page.getByRole('rowheader').count(),1);assert.equal(await row('BT58').getByRole('checkbox').isDisabled(),true);assert.equal(await row('BT58').getByRole('checkbox').isChecked(),false);
  assert.equal((await getOwnerPricingSettings(store)).postcodeRules.length,12,'Bulk loading/import/export stays draft until Save');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('OK '+width+'px workbook/filter/CSV: 480 district-direction records, preserved approved keys, downloaded all rows, forced inactive/unverified import, no implicit persistence or overflow');
 }
 assert.deepEqual(failures,[]);assert.ok(api.some(x=>x.path==='/owner/pricing'&&x.method==='POST'&&x.status===200));assert.ok(api.some(x=>x.status===409));assert.ok(api.some(x=>x.path==='/quote/calculate'&&x.status===200));
 console.log('OK full browser → authenticated API → in-memory KV/audit → customer quote/booking flow; no JS exceptions; no live writes or payments');
 } catch(e) {console.error('Isolated failure state:',JSON.stringify({api,failures,settings:await getOwnerPricingSettings(store),page:activePage?await activePage.locator('body').innerText():null}));throw e;}
 finally {globalThis.fetch=realFetch;fs.rmSync(path.dirname(routeFile),{recursive:true});if(browser)await browser.close();server.kill();if(oldServer)oldServer.kill();if(historical)historical.close();fs.writeFileSync(root+'/../postcode-browser-server.log',log);}
}
void main().catch(e=>{console.error(e);process.exitCode=1});
