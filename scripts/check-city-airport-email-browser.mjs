import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const output = 'test-results/city-airport-emails';
const logo = await fs.readFile('public/logo-email.png');
const map = await fs.readFile('public/maps/belfast-city-express-pick-up-drop-off.jpg');
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
 for (const colorScheme of ['light','dark']) {
  const context = await browser.newContext({viewport:{width:390,height:844},colorScheme});
  await context.route('**/*',route=>{
   const url=route.request().url();
   if(url.endsWith('/logo-email.png')) return route.fulfill({contentType:'image/png',body:logo});
   if(url.endsWith('/belfast-city-express-pick-up-drop-off.jpg')) return route.fulfill({contentType:'image/jpeg',body:map});
   return route.abort();
  });
  const page=await context.newPage();
  for(const file of (await fs.readdir(output)).filter(file=>file.endsWith('.html'))) {
   const html=await fs.readFile(`${output}/${file}`,'utf8');
   await page.setContent(html);
   await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${file}: mobile overflow`);
   assert.equal(await page.locator('img[alt="My Airport Taxi NI"]').count(),1);
   const expected=file==='ordinary-journey-reminder.html'?0:1;
   assert.equal(await page.locator('img[alt^="Belfast City Airport Express"]').count(),expected);
   if(expected) {
    const picture=page.locator('img[alt^="Belfast City Airport Express"]');
    assert.ok(await picture.evaluate(img=>img.naturalWidth>=2000));
    const box=await picture.boundingBox();assert.ok(box.width<=390);
    assert.ok((await picture.locator('..').getAttribute('href')).endsWith('.pdf'));
   }
   if(html.includes('class="matni-light"')) {
    assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(255, 255, 255)');
    assert.ok(await page.locator('p,h1,h2,td,div').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).color==='rgb(7, 28, 56)')));
   }
   await page.screenshot({path:`${output}/${file.replace('.html','')}-${colorScheme}.png`,fullPage:true});
  }
  await context.close();console.log(`PASS 390px ${colorScheme}: logos, loaded maps, PDF links, white/navy reminders and no overflow`);
 }
} finally {await browser.close();}
