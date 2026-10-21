/** Isolated static preview; all remote requests aborted, no live settings writes. */
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('out');
const server=http.createServer(async(req,res)=>{try{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error();const content=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(content);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(3194,'127.0.0.1',r));
await fs.mkdir('test-results/dashboard-formula',{recursive:true});
try {
 for(const [name,engine] of Object.entries({chromium,webkit})) {
  const browser=await engine.launch();
  try {for(const width of [320,360,375,390,1280]) {
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',...(name==='webkit'&&width<500?{isMobile:true,hasTouch:true}: {})});
   const errors=[];let writes=0;
   await context.route('**/*',route=>{const request=route.request();if(new URL(request.url()).origin==='http://127.0.0.1:3194')return route.continue();if(request.method()!=='GET')writes++;return route.abort();});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:3194/owner/pricing-preview/',{waitUntil:'networkidle'});
   const consent=page.getByRole('button',{name:'Reject optional',exact:true});if(await consent.isVisible())await consent.click();
   const toggle=page.getByRole('checkbox',{name:'Use mileage formula for new quotes'});
   await toggle.waitFor();assert.equal(await toggle.isChecked(),false);assert.equal(await toggle.isEnabled(),true);
   assert.equal(Number(await page.getByLabel('Starting charge',{exact:true}).inputValue()),10);
   assert.equal(Number(await page.getByLabel('Price per passenger road mile',{exact:true}).inputValue()),2.2);
   assert.equal(Number(await page.getByLabel('Formula minimum fare',{exact:true}).inputValue()),30);
   const original=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('matni:preview-pricing-settings')));
   await page.getByLabel('Starting charge',{exact:true}).fill('12');await page.getByLabel('Price per passenger road mile',{exact:true}).fill('2.35');await page.getByLabel('Formula minimum fare',{exact:true}).fill('32');await toggle.check();
   async function save(){await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.getByRole('dialog',{name:'Confirm pricing changes'}).getByRole('button',{name:'Save Pricing',exact:true}).click();await page.getByRole('dialog',{name:'Confirm pricing changes'}).waitFor({state:'hidden'});}
   await save();await page.reload({waitUntil:'networkidle'});assert.equal(await toggle.isChecked(),true);
   assert.equal(Number(await page.getByLabel('Starting charge',{exact:true}).inputValue()),12);
   assert.equal(Number(await page.getByLabel('Price per passenger road mile',{exact:true}).inputValue()),2.35);
   assert.equal(Number(await page.getByLabel('Formula minimum fare',{exact:true}).inputValue()),32);
   await toggle.uncheck();await save();await page.reload({waitUntil:'networkidle'});assert.equal(await toggle.isChecked(),false);
   const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('matni:preview-pricing-settings')));
   if(original)for(const key of ['saloon','postcodeRules','night','weekend','estate','returnDiscount','meetGreet'])assert.deepEqual(saved[key],original[key],key);
   assert.equal(writes,0);assert.deepEqual(errors,[]);
   await toggle.scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/dashboard-formula/${name}-${width}.png`});
   console.log(`PASS ${name} ${width}px default OFF, edited values save/reload, ON/OFF, preserved settings, no browser errors or external writes`);await context.close();
  }}finally{await browser.close();}
 }
}finally{server.close();}
