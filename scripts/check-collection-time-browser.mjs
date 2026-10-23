/** Isolated dashboard session only. External requests are blocked. */
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('out');
const server=http.createServer(async(req,res)=>{try{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error();const content=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(content);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(3194,'127.0.0.1',r));
await fs.mkdir('test-results/collection-time',{recursive:true});
try {
  for(const [name,engine] of Object.entries({chromium,webkit})) {
    const browser=await engine.launch();
    try {for(const width of [375,1280]) {
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',...(width<500?{isMobile:true,hasTouch:true}: {})});
      const errors=[];
      await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:3194'?route.continue():route.abort());
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:3194/owner/pricing-preview/',{waitUntil:'networkidle'});
      await page.getByRole('button',{name:'Reject optional',exact:true}).click();
      const evening=page.getByRole('switch',{name:'Evening pricing enabled'}), overnight=page.getByRole('switch',{name:'Overnight pricing enabled'});
      assert.equal(await evening.getAttribute('aria-checked'),'false');assert.equal(await overnight.getAttribute('aria-checked'),'false');
      assert.equal(await evening.isEnabled(),true);assert.equal(await overnight.isEnabled(),true);
      assert.equal(await page.getByRole('textbox',{name:'Evening premium',exact:true}).inputValue(),'10');
      assert.equal(await page.getByRole('textbox',{name:'Overnight premium',exact:true}).inputValue(),'15');
      assert.equal(await page.getByText('18:00–21:59: OFF — saved 10%',{exact:true}).isVisible(),true);
      assert.equal(await page.getByText('22:00–05:59: OFF — saved 15%',{exact:true}).isVisible(),true);
      assert.equal(await page.getByRole('checkbox',{name:'Use mileage formula for new quotes'}).isChecked(),false);
      const legacyBefore={night:await page.getByRole('switch',{name:'Night pricing enabled',exact:true}).getAttribute('aria-checked'),weekend:await page.getByRole('switch',{name:'Weekend pricing enabled',exact:true}).getAttribute('aria-checked'),nightRate:await page.getByRole('textbox',{name:'Night surcharge',exact:true}).inputValue(),weekendRate:await page.getByRole('textbox',{name:'Weekend surcharge',exact:true}).inputValue()};
      await page.getByText('Collection-time pricing — Europe/London',{exact:true}).scrollIntoViewIfNeeded();
      await page.screenshot({path:`test-results/collection-time/${name}-${width}-defaults-off.png`});
      await page.getByRole('textbox',{name:'Evening premium',exact:true}).fill('7.5');
      await page.getByRole('textbox',{name:'Overnight premium',exact:true}).fill('18');
      await evening.click();
      async function save(){await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.getByRole('dialog',{name:'Confirm pricing changes'}).getByRole('button',{name:'Save Pricing',exact:true}).click();await page.getByRole('dialog',{name:'Confirm pricing changes'}).waitFor({state:'hidden'});await page.reload({waitUntil:'networkidle'});}
      await save();
      assert.equal(await evening.getAttribute('aria-checked'),'true');assert.equal(await overnight.getAttribute('aria-checked'),'false');
      assert.equal(await page.getByRole('textbox',{name:'Evening premium',exact:true}).inputValue(),'7.5');
      assert.equal(await page.getByRole('textbox',{name:'Overnight premium',exact:true}).inputValue(),'18');
      await evening.click();await overnight.click();await save();
      assert.equal(await evening.getAttribute('aria-checked'),'false');assert.equal(await overnight.getAttribute('aria-checked'),'true');
      await page.getByText('Collection-time pricing — Europe/London',{exact:true}).scrollIntoViewIfNeeded();
      await page.screenshot({path:`test-results/collection-time/${name}-${width}-overnight-only.png`});
      await overnight.click();await save();
      assert.equal(await evening.getAttribute('aria-checked'),'false');assert.equal(await overnight.getAttribute('aria-checked'),'false');
      const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('matni:preview-pricing-settings')));
      assert.equal(stored.collectionTimePricing.evening.surchargeRate,.075);assert.equal(stored.collectionTimePricing.overnight.surchargeRate,.18);
      assert.equal(stored.saloonFormula.enabled,false);assert.deepEqual(stored.saloonFormula,{enabled:false,startingChargeGbp:10,ratePerMileGbp:2.2,minimumFareGbp:30});
      const legacyAfter={night:await page.getByRole('switch',{name:'Night pricing enabled',exact:true}).getAttribute('aria-checked'),weekend:await page.getByRole('switch',{name:'Weekend pricing enabled',exact:true}).getAttribute('aria-checked'),nightRate:await page.getByRole('textbox',{name:'Night surcharge',exact:true}).inputValue(),weekendRate:await page.getByRole('textbox',{name:'Weekend surcharge',exact:true}).inputValue()};
      assert.deepEqual(legacyAfter,legacyBefore);assert.deepEqual(errors,[]);
      console.log(`PASS ${name} ${width}px defaults OFF, rates save/reload, independent switches and preserved legacy/#675 settings`);
      await context.close();
    }}finally{await browser.close();}
  }
}finally{server.close();}
