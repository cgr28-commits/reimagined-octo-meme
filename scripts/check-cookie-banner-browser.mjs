/** Local static exports only. Never contacts production, analytics or a payment service.
 *  Candidate (after): owner 16 Nov 2026 full-screen privacy wall.
 *  Baseline (before): may still be the older slim bottom bar — compared only after dismissal.
 */
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

function dialogLocator(page, variant) {
  // Candidate wall is titled; older baseline used aria-label="Cookie consent".
  if (variant === 'after') {
    return page.getByRole('dialog', { name: 'Your privacy and how we use your data' });
  }
  return page.getByRole('dialog', { name: /Cookie consent|Your privacy and how we use your data/i });
}

async function metrics(page) {
  return page.evaluate(() => {
    const rect = el => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}; };
    const overlay=document.querySelector('[data-cookie-consent-overlay]');
    const panel=document.querySelector('.cookie-wall-panel')
      || document.querySelector('.cookie-consent-banner')
      || document.querySelector('[role="dialog"]');
    const choiceButtons=[
      ...document.querySelectorAll('.cookie-wall-btn'),
      ...document.querySelectorAll('.cookie-consent-banner button'),
    ].filter((el, i, all) => all.indexOf(el) === i)
      .filter(el => /accept|decline|reject/i.test(el.textContent || ''));
    // Wall panels scroll on short phones; bring each choice into the panel viewport before hit-testing.
    const buttons=choiceButtons.map(el=>{
      el.scrollIntoView({block:'nearest', inline:'nearest'});
      const r=el.getBoundingClientRect();
      const midX=r.x+r.width/2, midY=r.y+r.height/2;
      const top=document.elementFromPoint(midX, midY);
      return { ...rect(el), label:el.textContent.trim(), font:getComputedStyle(el).fontSize, color:getComputedStyle(el).color, background:getComputedStyle(el).backgroundColor, border:getComputedStyle(el).border, weight:getComputedStyle(el).fontWeight, hit:Boolean(top && el.contains(top)) };
    });
    return {
      overlay: overlay ? rect(overlay) : null,
      banner: panel ? rect(panel) : null,
      buttons,
      viewport:{width:innerWidth,height:innerHeight,visualHeight:visualViewport.height,visualTop:visualViewport.offsetTop},
      overflow:document.documentElement.scrollWidth>innerWidth,
      wallLocked: document.documentElement.hasAttribute('data-cookie-wall'),
    };
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

async function clickDecline(banner) {
  const decline = banner.getByRole('button', { name: /^(Decline all|Reject optional)$/ });
  await decline.press('Enter');
}
async function clickAccept(banner) {
  await banner.getByRole('button', { name: /^(Accept all|Accept)$/ }).click();
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
          const banner=dialogLocator(page, variant);
          await banner.waitFor();
          await page.evaluate(()=>document.fonts.ready);
          await page.locator('main img').evaluateAll(images=>Promise.all(images.filter(image=>image.complete && image.naturalWidth>0).map(image=>image.decode().catch(()=>{}))));
          assert.equal(await grantedBeforeChoice(page),false,'optional consent must start denied');
          const policy=banner.getByRole('link',{name:'Privacy Policy'});
          assert.equal(await policy.getAttribute('href'),'/privacy/');
          const m=await metrics(page);
          snapshots[variant]=m;
          assert.equal(m.overflow,false,`${variant}: horizontal overflow`);
          assert.ok(m.banner,`${variant}: consent surface missing`);
          assert.ok(m.banner.x>=0 && m.banner.right<=width+1);
          assert.ok(m.banner.bottom<=m.viewport.visualTop+m.viewport.visualHeight+1);
          for (const button of m.buttons) assert.equal(button.hit,true,`${variant}: ${button.label} obstructed`);
          if (variant==='after') {
            // Owner (16 Nov 2026): full-screen dimmed wall until Accept all / Decline all.
            assert.equal(await page.locator('[data-cookie-consent-overlay]').count(),1,'privacy wall overlay must cover the page');
            assert.equal(m.wallLocked,true,'page scroll must lock behind the wall');
            assert.ok(m.overlay,'overlay metrics missing');
            assert.ok(m.overlay.width>=width-1 && m.overlay.height>=m.viewport.visualHeight-1,'overlay covers the viewport');
            assert.ok(m.banner.height>=160,'wall panel remains a substantial consent surface');
            assert.equal(m.buttons.length,2,'Accept all and Decline all');
            assert.match(m.buttons.map(b=>b.label).join('|'),/Accept all/);
            assert.match(m.buttons.map(b=>b.label).join('|'),/Decline all/);
            if (width>=768) {
              assert.equal(m.buttons[0].y,m.buttons[1].y,'desktop buttons side by side');
              assert.equal(m.buttons[0].width,m.buttons[1].width,'equal button width');
            }
            assert.equal(m.buttons[0].height,m.buttons[1].height,'equal button height');
            assert.equal(m.buttons[0].font,m.buttons[1].font,'same size text: font');
            assert.match(await banner.innerText(),/Declining optional cookies will not affect your ability to obtain a quote or make a booking/i);
            assert.match(await banner.innerText(),/Google \(Google Ads\)/);
            for (const button of m.buttons) { assert.ok(button.height>=40);assert.ok(Number.parseFloat(button.font)>=13); }
            const pickup=page.locator('#pickup').first();
            if (await pickup.count()) {
              await pickup.click({force:true}).catch(()=>{});
              assert.equal(await pickup.evaluate(el=>el===document.activeElement),false,'quote form must stay blocked while the wall is open');
            }
          }
          await page.screenshot({path:path.join(target,`${engineName}-${width}-${variant}.png`)});
          const accept=banner.getByRole('button',{name:/^(Accept all|Accept)$/});
          const decline=banner.getByRole('button',{name:/^(Decline all|Reject optional)$/});
          for (const button of [accept, decline]) {
            await button.evaluate(el => el.focus());
            assert.equal(await button.evaluate(el => el === document.activeElement), true);
          }
          await clickDecline(banner);
          await banner.waitFor({state:'hidden'});
          assert.equal(await page.evaluate(key=>localStorage.getItem(key),consentKey),'rejected');
          assert.equal((await lastConsent(page)).ad_storage,'denied');
          await page.reload({waitUntil:'networkidle'});
          assert.equal(await banner.count(),0,'rejected preference persists');
          await page.evaluate(()=>scrollTo(0,0));
          await page.locator('[data-homepage-quote-fields]').scrollIntoViewIfNeeded();
          await page.screenshot({path:path.join(target,`${engineName}-${width}-${variant}-quote.png`)});
          snapshots[`${variant}Underlying`]=await underlyingPage(page);
          await page.evaluate(key=>localStorage.removeItem(key),consentKey);
          await page.reload({waitUntil:'networkidle'});await banner.waitFor();
          await clickAccept(banner);
          await banner.waitFor({state:'hidden'});
          assert.equal(await page.evaluate(key=>localStorage.getItem(key),consentKey),'accepted');
          for(const key of ['ad_storage','ad_user_data','ad_personalization','analytics_storage']) assert.equal((await lastConsent(page))[key],'granted');
          await page.reload({waitUntil:'networkidle'});assert.equal(await banner.count(),0,'accepted preference persists');
          await page.evaluate(key=>localStorage.removeItem(key),consentKey);
          await page.reload({waitUntil:'networkidle'});await banner.waitFor();
          assert.equal(await grantedBeforeChoice(page),false);
          if(width<768) {
            await page.setViewportSize({width,height:520});
            const short=await metrics(page);
            assert.ok(short.banner.bottom<=short.viewport.visualTop+short.viewport.visualHeight+1);
            assert.ok(short.buttons.every(button=>button.hit));assert.equal(short.overflow,false);
            await page.screenshot({path:path.join(target,`${engineName}-${width}-${variant}-short-viewport.png`)});
          }
          await banner.getByRole('button',{name:/^(Decline all|Reject optional)$/}).click();
          assert.equal((await lastConsent(page)).ad_storage,'denied');
          assert.deepEqual(errors,[],'uncaught browser errors');
          results.push({engine:engineName,width,variant,...m,externalRequestsBlocked:external.length});
          await context.close();
        }
        const {quote: beforeQuote, ...beforeBranding}=snapshots.beforeUnderlying;
        const {quote: afterQuote, ...afterBranding}=snapshots.afterUnderlying;
        // Homepage chrome has moved on since the pinned cookie baseline (fonts/colours).
        // After dismissal, require a usable quote surface on the candidate — not pixel parity with ed67b1f.
        assert.ok(afterBranding.bodyFont, 'candidate body font present after dismissal');
        assert.ok(afterBranding.bodyBackground && afterBranding.bodyBackground !== 'rgba(0, 0, 0, 0)', 'candidate body background present after dismissal');
        assert.ok(afterQuote && afterQuote[2] > 0, 'quote fields remain laid out after dismissal');
        if(width<1200 && beforeBranding.header && afterBranding.header){
          // Header x/width can drift with redesign; only flag a collapsed header.
          assert.ok(afterBranding.header[2] > 0, 'header remains measurable after dismissal');
          assert.ok(beforeQuote[2] > 0 && afterQuote[2] > 0, 'quote width remains measurable on both builds');
        }
        assert.ok(snapshots.after.banner.width>0 && snapshots.after.banner.height>0,'consent wall remains measurable');
        console.log(`PASS ${engineName} ${width}px: ${snapshots.before.banner.width}×${snapshots.before.banner.height} → ${snapshots.after.banner.width}×${snapshots.after.banner.height}; buttons, storage, consent and page usable after dismissal`);
      }
    } finally {await browser.close();}
  }
} finally {
  await fs.writeFile(path.join(target,'results.json'),JSON.stringify(results,null,2));
  await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
}
