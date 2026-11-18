import { setQuoteCount } from './playwright-quote-count.mjs';
/** Run against a locally served build; external traffic is blocked. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { skipCookieConsent } from './playwright-cookie-consent.mjs';
const base = process.env.TEST_BASE_URL || 'http://localhost:38845';
await mkdir('test-results/homepage-fields', { recursive: true });
for (const [name, engine] of Object.entries(process.env.PLAYWRIGHT_BROWSER ? {[process.env.PLAYWRIGHT_BROWSER]: {chromium, webkit}[process.env.PLAYWRIGHT_BROWSER]} : {chromium, webkit})) {
  const browser = await engine.launch();
  try {
    for (const width of [320, 375, 390, 430, 768, 1280]) {
      const context = await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768,locale:'en-GB'});
      await skipCookieConsent(context);
      await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.goto(base);
      await page.locator('#date').waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal((await page.locator('h1').innerText()).replace(/\s+/g,' ').trim(),'Belfast & Dublin Airport Transfers');
      // The "Private airport transfers" eyebrow was removed from the hero (PR #699).
      assert.equal(await page.locator('.homepage-hero .section-eyebrow').count(), 0, 'hero has no eyebrow line');
      assert.equal((await page.locator('[data-homepage-intro]:visible, [data-d3-intro-sub]:visible, [data-d2-intro-sub]:visible').first().innerText()).replace(/\s+/g,' ').trim(),width===768 ? 'Professional, pre-booked airport transfers and private travel across Northern Ireland and beyond.' : 'Professional, pre-booked airport transfers across Northern Ireland and the Republic of Ireland.');
      assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontWeight),'800');
      assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).textAlign),'left');
      assert.equal(await page.locator('[data-desktop-quote-benefits]').isVisible(),width>=1200);
      async function checkFields() {
        for (const id of ['pickup','dropoff','date','time','quote-section-passengers','quote-section-suitcases']) {
          const control=page.locator('#'+id);
          assert.ok(await control.isVisible(),id);
          assert.ok(await control.isEnabled(),id);
          const box=await control.boundingBox();
          assert.ok(box.width>0 && box.x>=0 && box.x+box.width<=width+1,id+' fits viewport');
        }
        // Check legibility against the rendered field surface, including the entered values.
        const fields = await page.locator('#pickup,#dropoff,#date,#time,#quote-section-passengers,#quote-section-suitcases').evaluateAll(els=>els.map(el=>{
          const luminance = color => color.match(/[\d.]+/g).slice(0,3).reduce((sum,n,i)=>{
            const v=Number(n)/255;
            return sum+[0.2126,0.7152,0.0722][i]*(v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
          },0);
          let surface=el;
          while(surface.parentElement && getComputedStyle(surface).backgroundColor==='rgba(0, 0, 0, 0)') surface=surface.parentElement;
          const bg=getComputedStyle(surface).backgroundColor;
          const background=bg==='rgba(0, 0, 0, 0)'?1:luminance(bg);
          const foreground=luminance(getComputedStyle(el).color);
          return {id:el.id,contrast:(Math.max(background,foreground)+0.05)/(Math.min(background,foreground)+0.05)};
        }));
        for(const field of fields) assert.ok(field.contrast>=4.5,JSON.stringify(field));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      }
      await checkFields();
      const date=page.locator('#date');
      await date.focus();assert.ok(await date.evaluate(el=>el===document.activeElement));
      await date.fill('2027-02-10');assert.equal(await date.inputValue(),'2027-02-10');
      const picker=page.locator('[data-d3-time-trigger]:visible').first();
      if(await picker.count()) {
        await picker.click();
        const dialog=page.getByRole('dialog');
        await dialog.getByRole('group',{name:'Hour',exact:true}).getByRole('button',{name:'12',exact:true}).click();
        await dialog.getByRole('group',{name:'Minute',exact:true}).getByRole('button',{name:'30',exact:true}).click();
        await dialog.getByRole('button',{name:/Confirm.*time/}).click();
      } else await page.locator('#time').fill('12:30');
      assert.equal(await page.locator('#time').inputValue(),'12:30');
      await setQuoteCount(page,'passengers',2);
      await setQuoteCount(page,'suitcases',2);
      await checkFields();
      await page.getByRole('button',{name:/Return.*5%/}).click();
      await page.locator('#returnDate').fill('2027-02-12');
      await page.locator('#returnTime').fill('13:45');
      await checkFields();
      await page.screenshot({path:`test-results/homepage-fields/${name}-${width}.png`,fullPage:false});
      console.log(`PASS ${name} ${width}px: heading, responsive controls, focus, selected values, return dates, no overflow`);
      await context.close();
    }
  } finally { await browser.close(); }
}
