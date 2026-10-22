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
   await toggle.scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/dashboard-formula/${name}-${width}-defaults.png`});
   assert.equal(Number(await page.getByRole('textbox',{name:'Starting charge',exact:true}).inputValue()),10);
   assert.equal(Number(await page.getByRole('textbox',{name:'Price per passenger road mile',exact:true}).inputValue()),2.2);
   assert.equal(Number(await page.getByRole('textbox',{name:'Formula minimum fare',exact:true}).inputValue()),30);
   const rate=page.getByRole('textbox',{name:'Price per passenger road mile',exact:true});
   const saveButton=page.getByRole('button',{name:'Save Changes',exact:true});
   const discardButton=page.getByRole('button',{name:'Discard Changes',exact:true});
   assert.equal(await rate.getAttribute('inputmode'),'decimal');
   assert.equal(await rate.getAttribute('type'),'text');
   assert.equal(await saveButton.isDisabled(),true,'loading must not edit the rate');
   await rate.fill('');
   assert.equal(await saveButton.isDisabled(),true,'blank cannot save the previous numeric value');
   assert.equal(await discardButton.isEnabled(),true,'an empty text edit can be discarded');
   await discardButton.click();assert.equal(await rate.inputValue(),'2.20');
   await rate.fill('2.');await rate.blur();assert.equal(await rate.inputValue(),'2.');
   assert.equal(await saveButton.isDisabled(),true,'trailing decimal cannot save');
   await discardButton.click();assert.equal(await rate.inputValue(),'2.20');
   await page.getByRole('textbox',{name:'Starting charge',exact:true}).fill('12');await page.getByRole('textbox',{name:'Price per passenger road mile',exact:true}).fill('2.35');await page.getByRole('textbox',{name:'Formula minimum fare',exact:true}).fill('32');await toggle.check();
   async function save(){await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.getByRole('dialog',{name:'Confirm pricing changes'}).getByRole('button',{name:'Save Pricing',exact:true}).click();await page.getByRole('dialog',{name:'Confirm pricing changes'}).waitFor({state:'hidden'});}
   let original;
   for (const amount of ['2.35','2.50','2.75']) {
    await rate.fill('');await rate.pressSequentially('2.');assert.equal(await rate.inputValue(),'2.');
    assert.equal(await page.getByRole('button',{name:'Save Changes',exact:true}).isDisabled(),true);
    await rate.pressSequentially(amount.slice(2));assert.equal(await rate.inputValue(),amount);
    await rate.pressSequentially('9');assert.equal(await rate.inputValue(),amount,'reject third decimal');
    for(const invalid of ['2..35','-2.35','2e2','2.351','abc']) {
     await rate.fill(invalid);assert.equal(await rate.inputValue(),amount,`reject invalid paste ${invalid}`);
    }
    await save();await page.reload({waitUntil:'networkidle'});assert.equal(await rate.inputValue(),amount);
    const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('matni:preview-pricing-settings')));
    assert.equal(stored.saloonFormula.ratePerMileGbp,Number(amount));
    if(!original)original=stored;
    for(const key of ['saloon','postcodeRules','night','weekend','estate','returnDiscount','meetGreet'])assert.deepEqual(stored[key],original[key],key);
   }
   await rate.fill('');assert.equal(await page.getByRole('button',{name:'Save Changes',exact:true}).isDisabled(),true);
   await rate.pressSequentially('2..35');assert.equal(await rate.inputValue(),'2.35');
   await save();await page.reload({waitUntil:'networkidle'});assert.equal(await toggle.isChecked(),true);
   await rate.fill('3');await rate.blur();assert.equal(await rate.inputValue(),'3.00');
   await discardButton.click();assert.equal(await rate.inputValue(),'2.35');
   assert.equal(await saveButton.isDisabled(),true);
   assert.equal(Number(await page.getByRole('textbox',{name:'Starting charge',exact:true}).inputValue()),12);
   assert.equal(Number(await page.getByRole('textbox',{name:'Price per passenger road mile',exact:true}).inputValue()),2.35);
   assert.equal(Number(await page.getByRole('textbox',{name:'Formula minimum fare',exact:true}).inputValue()),32);
   await toggle.uncheck();await save();await page.reload({waitUntil:'networkidle'});assert.equal(await toggle.isChecked(),false);
   const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('matni:preview-pricing-settings')));
   if(original)for(const key of ['saloon','postcodeRules','night','weekend','estate','returnDiscount','meetGreet'])assert.deepEqual(saved[key],original[key],key);
   assert.equal(writes,0);assert.deepEqual(errors,[]);
   await toggle.scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/dashboard-formula/${name}-${width}.png`});
   console.log(`PASS ${name} ${width}px: decimal typing, invalid/third-decimal rejection, incomplete save blocked, discard, 2.35/2.50/2.75 save/reload, ON/OFF, preserved settings, no browser errors or external writes`);await context.close();
  }}finally{await browser.close();}
 }
}finally{server.close();}
