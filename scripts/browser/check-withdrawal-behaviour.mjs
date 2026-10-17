import {spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium,webkit}=await import(process.env.MATNI_PLAYWRIGHT_MODULE || 'playwright-core');
const repository=fileURLToPath(new URL('../../',import.meta.url));
const site='http://127.0.0.1:3012';
const server=spawn(process.execPath,process.env.MATNI_STATIC_EXPORT==='true'?['scripts/browser/serve-isolated-export.mjs']:['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3012'],{cwd:repository,env:{...process.env,NEXT_PUBLIC_BOOKINGS_API_URL:'http://127.0.0.1:8789/bookings',NEXT_PUBLIC_ADDRESSES_API_URL:'http://127.0.0.1:8789/addresses',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_GOOGLE_ADS_ID:'AW-1234567890'}});
process.on('exit',()=>server.kill('SIGTERM'));
server.stderr.on('data',b=>fs.appendFileSync('/tmp/matni-browser-server.log',b));
await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{fs.appendFileSync('/tmp/matni-browser-server.log',b);if(String(b).includes('Ready'))resolve()});server.on('exit',c=>reject(Error('server exit '+c)));setTimeout(()=>reject(Error('server timeout')),40000).unref()});
const launchBrowser=()=>process.env.MATNI_BROWSER==='webkit'?webkit.launch({headless:true}):chromium.launch({executablePath:process.env.MATNI_CHROMIUM_PATH,args:['--no-sandbox','--no-zygote','--single-process','--disable-gpu','--disable-software-rasterizer','--use-gl=disabled','--disable-dev-shm-usage'],headless:true});

const key='matni-cookie-consent-v2';
const googleFile=process.env.MATNI_GOOGLE_TAG_FILE;
if(!googleFile) throw Error('Set MATNI_GOOGLE_TAG_FILE to a reviewed Google gtag.js fixture downloaded with fictional AW-1234567890; every external request is intercepted.');
const google=fs.readFileSync(googleFile,'utf8');
const active=`(()=>{try{new Worker(URL.createObjectURL(new Blob(['fetch(\"https://www.google-analytics.com/g/collect?fixture=worker\")'],{type:'application/javascript'})))}catch{window.__workerBlocked=true}const frame=document.createElement('iframe');frame.src='https://www.googletagmanager.com/fixture-frame';document.body.append(frame);window.__transportTicks=0;const probe=()=>{window.__transportTicks++;fetch('https://www.google-analytics.com/g/collect?fixture=fetch').catch(()=>{});navigator.sendBeacon('https://www.google-analytics.com/g/collect?fixture=beacon','synthetic');const i=new Image();i.src='https://www.google-analytics.com/g/collect?fixture=pixel&t='+Date.now()};setInterval(probe,100);addEventListener('online',probe);probe()})();`;
const results=[];
async function run(mode, mobile=false){
 const browser=await launchBrowser(),context=await browser.newContext({serviceWorkers:'allow',viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile}),page=await context.newPage();
 page.setDefaultTimeout(20000);
 if(mode==='storage-failure')page.on('framenavigated',frame=>{if(frame===page.mainFrame())console.log('storage-failure document navigation',frame.url());});
 let ack=false,tags=0;const collected=[];
 const expires=mode==='expiry'?Date.now()+15000:Date.now()+3600000;
 await context.addInitScript(({key,expires,mode})=>{
  window.__consentFixtureDocument=crypto.randomUUID();
  window.__cspDirectives=[];document.addEventListener('securitypolicyviolation',e=>window.__cspDirectives.push(e.effectiveDirective));
  if(!sessionStorage.getItem('seeded')){localStorage.setItem(key,JSON.stringify({id:'11111111-1111-4111-8111-111111111111',version:'2026-10-17',recordedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(expires).toISOString(),advertising:mode!=='analytics',analytics:true,personalization:false}));sessionStorage.setItem('seeded','1');sessionStorage.setItem('operational-test-draft','keep');}
 },{key,expires,mode});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.origin===site)return route.continue();
  if(u.hostname==='www.googletagmanager.com'&&u.pathname==='/gtag/js'){tags++;return route.fulfill({contentType:'application/javascript',body:google+';\n'+active});}
  if(u.port==='8789')return route.fulfill({status:u.pathname==='/measurement/withdraw'?(ack?200:503):200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},contentType:'application/json',body:'{"ok":true}'});
  collected.push(u.href);return route.fulfill({contentType:u.pathname.endsWith('.js')?'application/javascript':'text/plain',body:''});
 });
 try{
  await page.goto(site+'/',{waitUntil:'domcontentloaded',timeout:90000});
  if(mode==='analytics'){
   await page.waitForTimeout(500);assert.equal(tags,0);await page.reload();await page.waitForTimeout(300);assert.equal(tags,0);console.log('PASS analytics-only persistence');return;
  }
  await page.waitForFunction(()=>window.__transportTicks>1);assert.equal(tags,1);assert.ok(collected.length>=3,'live transports observed before withdrawal');
  await page.waitForFunction(()=>window.__cspDirectives.includes('worker-src')); assert.equal(collected.some(u=>u.includes('fixture-frame')||u.includes('fixture=worker')),false,'independent transports blocked');
  const googleEvidence=await page.evaluate(()=>!!window.google_tag_manager);assert.ok(googleEvidence,'actual Google bootstrap executed');
  if(mode==='expiry'){
   await page.waitForFunction(()=>!document.querySelector('script[src*="googletagmanager.com/gtag"]'),null,{timeout:20000});
   assert.equal(tags,1);const count=collected.length;await page.waitForTimeout(500);assert.equal(collected.length,count);console.log('PASS actual Google expiry shutdown');return;
  }
  const previousDocument=await page.evaluate(()=>window.__consentFixtureDocument);
  if(mode==='offline')await context.setOffline(true);
  if(mode==='storage-failure')await page.evaluate(()=>{Storage.prototype.setItem=function(){throw Error('blocked test storage')};Storage.prototype.removeItem=function(){throw Error('blocked test storage')};});
  if(mode==='cross-tab'){
   const other=await context.newPage();await other.goto(site+'/cookies/',{waitUntil:'domcontentloaded'});await other.waitForFunction(()=>window.__transportTicks>1);await other.getByRole('button',{name:'Cookie Settings',exact:true}).first().click();await other.getByRole('button',{name:'Essential only',exact:true}).click();
  }else{
   await page.getByRole('button',{name:'Cookie Settings',exact:true}).first().click();await page.getByRole('button',{name:'Essential only',exact:true}).click();
  }
  if(mode==='offline'){
   await page.waitForFunction(()=>[...document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')].some(m=>m.content.includes("connect-src 'none'")));
   const count=collected.length,ticks=await page.evaluate(()=>window.__transportTicks);
   await page.waitForTimeout(600);assert.ok(await page.evaluate(()=>window.__transportTicks)>ticks,'old callbacks still execute');assert.equal(collected.length,count,'CSP blocks all active transport attempts');
   ack=true;await context.setOffline(false);
  }
  await page.waitForFunction(()=>!document.querySelector('script[src*="googletagmanager.com/gtag"]'));
  // Script removal happens before navigation; wait for the replacement document,
  // otherwise WebKit can correctly interrupt our next navigation with the reload.
  await page.waitForFunction(previous=>window.__consentFixtureDocument!==previous&&typeof window.__transportTicks==='undefined',previousDocument);
  await page.waitForLoadState('domcontentloaded');
  const stopped=collected.length;await page.waitForTimeout(600);assert.equal(collected.length,stopped,'no new external requests after withdrawal');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('operational-test-draft')),'keep');
  if(mode==='storage-failure'){
   assert.ok(page.url().includes('measurement=off'));
   console.log('storage-failure before policy navigation',await page.evaluate(()=>({url:location.href,denialCookie:document.cookie.includes('matni-measurement-denied=1'),oldCallbackPresent:typeof window.__transportTicks!=='undefined'})));
   await page.goto(site+'/cookies/',{waitUntil:'domcontentloaded'}).catch(error=>{
    if(!error.message.includes('interrupted by another navigation'))throw error;
    console.log('policy navigation interruption; requiring the intended URL and rendered policy');
   });
   // WebKit can report an interruption from client history synchronisation.
   // Do not retry navigation or accept the wrong page: the original navigation
   // must actually finish at the policy and render its heading.
   await page.waitForURL(site+'/cookies/',{waitUntil:'domcontentloaded'});
   await page.getByRole('heading',{name:'Cookie Policy',exact:true}).waitFor();
   await page.waitForTimeout(300);assert.equal(collected.length,stopped,'essential denial cookie protects other URLs after blocked preference storage');
  }
  else{
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('matni-cookie-consent-v2')).advertising),false);
   if(mode!=='offline'){assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('matni-consent-withdrawals-v1')).length>0));ack=true;await page.evaluate(()=>dispatchEvent(new Event('online')));}
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('matni-consent-withdrawals-v1')||'[]').length===0);
  }
  await page.reload();await page.waitForTimeout(300);assert.equal(collected.length,stopped);console.log('PASS actual Google withdrawal',mode,mobile?'mobile':'desktop');
 }finally{results.push({mode,mobile,tags,interceptedRequests:collected.length,googleRequests:collected.filter(u=>!u.includes("fixture=")).length});await context.close();await browser.close();}
}
try{if(process.env.MATNI_CONSENT_EXTRA_MOBILE==='true'){for(const mode of ['storage-failure','cross-tab','analytics'])await run(mode,true);}else{for(const mode of ['failed-delivery','offline','storage-failure','cross-tab','expiry','analytics'])await run(mode);for(const mode of ['failed-delivery','offline','storage-failure','cross-tab','expiry','analytics'])await run(mode,true);}}finally{fs.writeFileSync('/tmp/matni-withdrawal-behaviour-results.json',JSON.stringify(results,null,2));server.kill('SIGTERM');}
