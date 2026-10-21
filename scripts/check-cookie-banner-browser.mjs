/** Local static exports only. Never contacts production, analytics or a payment service. */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const target = path.resolve('test-results/cookie-banner');
await fs.mkdir(target, { recursive: true });
const consentKey = 'matni-cookie-consent-v1';
const results = [];
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
async function serve(directory, port) {
  const root = path.resolve(directory);
  const server = http.createServer(async (req, res) => {
    try {
      let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (name.startsWith('/isolated-api/')) {
        // Both builds use the same mock API; the comparison page is on another local port.
        // Permit that fixture request in WebKit without silencing any browser errors.
        res.setHeader('Access-Control-Allow-Origin','*');
        res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers','Accept, Content-Type');
        res.setHeader('Content-Type','application/json');
        res.end('{}'); return;
      }
      if (name.endsWith('/')) name += 'index.html';
      const file = path.resolve(root, '.' + name);
      assert.ok(file.startsWith(root + path.sep));
      const body = await fs.readFile(file);
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      res.end(body);
    } catch { res.statusCode = 404; res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return server;
}
const servers = [await serve(process.env.BASELINE_OUT || '../taxi-cookie-baseline-out',3198), await serve('out',3199)];
async function metrics(page) {
  return page.evaluate(() => {
    const rect = el => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}; };
    const banner=document.querySelector('.cookie-consent-banner');
    const buttons=[...banner.querySelectorAll('button')].map(el=>({ ...rect(el), label:el.textContent.trim(), font:getComputedStyle(el).fontSize, color:getComputedStyle(el).color, background:getComputedStyle(el).backgroundColor, weight:getComputedStyle(el).fontWeight, hit:el.contains(document.elementFromPoint(el.getBoundingClientRect().x+el.getBoundingClientRect().width/2,el.getBoundingClientRect().y+el.getBoundingClientRect().height/2)) }));
    return {banner:rect(banner),buttons,viewport:{width:innerWidth,height:innerHeight,visualHeight:visualViewport.height,visualTop:visualViewport.offsetTop},overflow:document.documentElement.scrollWidth>innerWidth,paddingBottom:getComputedStyle(banner).paddingBottom};
  });
}
async function underlyingPage(page) {
  return page.evaluate(() => {
    const rect = el => { const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height]; };
    return {header:rect(document.querySelector('[data-site-header]')),quote:rect(document.querySelector('[data-homepage-quote-fields]')),images:[...document.querySelectorAll('main img')].map(el=>({src:el.getAttribute('src'),alt:el.alt})),bodyFont:getComputedStyle(document.body).fontFamily,bodyBackground:getComputedStyle(document.body).backgroundColor};
  });
}
async function grantedBeforeChoice(page) {
  return page.evaluate(() => (window.dataLayer || []).some(item=>item[0]==='consent' && ['default','update'].includes(item[1]) && Object.values(item[2]||{}).includes('granted')));
}
async function lastConsent(page) {
  return page.evaluate(() => [...(window.dataLayer || [])].reverse().find(item=>item[0]==='consent' && item[1]==='update')?.[2]);
}
try {
  for (const [engineName,engine] of Object.entries({chromium,webkit})) {
    const browser=await engine.launch();
    try {
      for (const width of [320,360,375,390,1280]) {
        const snapshots={};
        for (const [variant,port] of [['before',3198],['after',3199]]) {
          const context=await browser.newContext({viewport:{width,height:width<768?740:900},reducedMotion:'reduce',...(width<768?{isMobile:true,hasTouch:true,deviceScaleFactor:1}: {})});
          const errors=[];
          const external=[];
          await context.route('**/*',route=>{
            const req=route.request(), url=new URL(req.url());
            if (url.hostname==='127.0.0.1') return route.continue();
            external.push({url:req.url(),method:req.method()});
            return route.fulfill({status:200,contentType:'application/javascript',body:'/* Isolated browser test: external request blocked. */'});
          });
          const page=await context.newPage();
          page.on('pageerror',error=>errors.push(error.message));
          await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
          const banner=page.getByRole('dialog',{name:'Cookie consent'});
          await banner.waitFor();
          await page.evaluate(()=>document.fonts.ready);
          // Offscreen lazy images have no request yet; waiting for decode would never finish.
          await page.locator('main img').evaluateAll(images=>Promise.all(images.filter(image=>image.complete && image.naturalWidth>0).map(image=>image.decode().catch(()=>{}))));
          assert.equal(await grantedBeforeChoice(page),false,'optional consent must start denied');
          const policy=banner.getByRole('link',{name:'Privacy Policy'});
          assert.equal(await policy.getAttribute('href'),'/privacy/');
          const m=await metrics(page);
          snapshots[variant]=m;
          assert.equal(m.overflow,false,`${variant}: horizontal overflow`);
          assert.ok(m.banner.x>=0 && m.banner.right<=width+1);
          assert.ok(m.banner.bottom<=m.viewport.visualTop+m.viewport.visualHeight+1);
          for (const button of m.buttons) assert.equal(button.hit,true,`${variant}: ${button.label} obstructed`);
          if (variant==='after') {
            assert.equal(m.buttons[0].y,m.buttons[1].y,'buttons side by side');
            assert.equal(m.buttons[0].width,m.buttons[1].width,'equal button width');
            assert.equal(m.buttons[0].height,m.buttons[1].height,'equal button height');
            for (const key of ['color','background','weight','font']) assert.equal(m.buttons[0][key],m.buttons[1][key],`equal prominence: ${key}`);
            for (const button of m.buttons) { assert.ok(button.height>=(width<768?44:36));assert.ok(Number.parseFloat(button.font)>=13); }
            if(width>=768) {assert.ok(m.banner.width<=360);assert.ok(m.banner.x>=12);assert.ok(m.buttons[0].height<=40);}
          }
          await page.screenshot({path:path.join(target,`${engineName}-${width}-${variant}.png`)});
          await page.locator('[data-homepage-quote-fields]').scrollIntoViewIfNeeded();
          await page.screenshot({path:path.join(target,`${engineName}-${width}-${variant}-quote.png`)});
          // Keyboard users can reach both choices; focus is visibly indicated.
          for(const label of ['Reject optional','Accept']) {
            const button=banner.getByRole('button',{name:label,exact:true});
            await button.focus();assert.equal(await button.evaluate(el=>el===document.activeElement),true);
          }
          await banner.getByRole('button',{name:'Reject optional',exact:true}).press('Enter');
          await banner.waitFor({state:'hidden'});
          assert.equal(await page.evaluate(key=>localStorage.getItem(key),consentKey),'rejected');
          assert.equal((await lastConsent(page)).ad_storage,'denied');
          await page.reload({waitUntil:'networkidle'});
          assert.equal(await banner.count(),0,'rejected preference persists');
          await page.evaluate(()=>scrollTo(0,0));
          snapshots[`${variant}Underlying`]=await underlyingPage(page);
          // Existing reset/reopen behaviour: clearing stored choice and reloading.
          // There is no separate preferences/withdrawal control in unchanged main.
          await page.evaluate(key=>localStorage.removeItem(key),consentKey);
          await page.reload({waitUntil:'networkidle'});await banner.waitFor();
          await banner.getByRole('button',{name:'Accept',exact:true}).click();
          await banner.waitFor({state:'hidden'});
          assert.equal(await page.evaluate(key=>localStorage.getItem(key),consentKey),'accepted');
          for(const key of ['ad_storage','ad_user_data','ad_personalization','analytics_storage']) assert.equal((await lastConsent(page))[key],'granted');
          await page.reload({waitUntil:'networkidle'});assert.equal(await banner.count(),0,'accepted preference persists');
          // Withdraw through the same stored-choice reset path, then decline.
          await page.evaluate(key=>localStorage.removeItem(key),consentKey);
          await page.reload({waitUntil:'networkidle'});await banner.waitFor();
          assert.equal(await grantedBeforeChoice(page),false);
          if(width<768) {
            // A shorter visible viewport approximates expanded browser chrome, not a physical Safari toolbar.
            await page.setViewportSize({width,height:520});
            const short=await metrics(page);
            assert.ok(short.banner.bottom<=short.viewport.visualTop+short.viewport.visualHeight+1);
            assert.ok(short.buttons.every(button=>button.hit));assert.equal(short.overflow,false);
            await page.screenshot({path:path.join(target,`${engineName}-${width}-${variant}-short-viewport.png`)});
          }
          await banner.getByRole('button',{name:'Reject optional',exact:true}).click();
          assert.equal((await lastConsent(page)).ad_storage,'denied');
          assert.deepEqual(errors,[],'uncaught browser errors');
          results.push({engine:engineName,width,variant,...m,externalRequestsBlocked:external.length});
          await context.close();
        }
        assert.deepEqual(snapshots.beforeUnderlying,snapshots.afterUnderlying,'homepage geometry, images and branding unchanged after dismissal');
        if(width>=768) assert.ok(snapshots.after.banner.width*snapshots.after.banner.height<snapshots.before.banner.width*snapshots.before.banner.height,'desktop banner footprint reduced');
        else assert.ok(snapshots.after.banner.height<=snapshots.before.banner.height+1,'mobile banner must not become taller');
        console.log(`PASS ${engineName} ${width}px: ${snapshots.before.banner.width}×${snapshots.before.banner.height} → ${snapshots.after.banner.width}×${snapshots.after.banner.height}; buttons, storage, consent and unchanged page`);
      }
    } finally {await browser.close();}
  }
} finally {
  await fs.writeFile(path.join(target,'results.json'),JSON.stringify(results,null,2));
  await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
}
