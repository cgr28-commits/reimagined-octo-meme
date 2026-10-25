/** Run against a locally served build; external traffic is blocked. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import sharp from 'sharp';
const base = process.env.TEST_BASE_URL || 'http://localhost:38845';
await mkdir('test-results/homepage-fields', { recursive: true });
for (const [name, engine] of Object.entries(process.env.PLAYWRIGHT_BROWSER ? {[process.env.PLAYWRIGHT_BROWSER]: {chromium, webkit}[process.env.PLAYWRIGHT_BROWSER]} : {chromium, webkit})) {
  const browser = await engine.launch();
  try {
    for (const width of [320, 375, 390, 430, 768, 1280]) {
      const context = await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768,locale:'en-GB'});
      await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.goto(base);
      await page.locator('#date').waitFor();
      const cookie = page.getByRole('button', {name:'Reject optional',exact:true});
      if (await cookie.isVisible()) await cookie.click();
      assert.equal((await page.locator('h1').innerText()).replace(/\s+/g,' ').trim(),'Belfast & Dublin Pre-Booked Airport Taxi Transfers');
      // The "Private airport transfers" eyebrow was removed from the hero (PR #699).
      assert.equal(await page.locator('.homepage-hero .section-eyebrow').count(), 0, 'hero has no eyebrow line');
      assert.equal(await page.locator('h1 + p').innerText(),'Fixed fares to Belfast International, Belfast City & Dublin Airport.');
      assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontWeight),'600');
      assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).textAlign),'center');
      assert.equal(await page.locator('[data-swap-locations]').count(),0);
      async function checkFields() {
        const metrics = await page.evaluate(() => {
          const controls = [...document.querySelectorAll('.homepage-hero [data-schedule-control], .homepage-hero .homepage-compact-control')];
          return controls.map(el => {
            const input = el.querySelector('input,select'), icon = el.querySelector('svg'), prompt = el.querySelector('.homepage-schedule-prompt');
            const r=el.getBoundingClientRect(), i=icon.getBoundingClientRect(), s=getComputedStyle(input);
            const textLeft=prompt ? prompt.getBoundingClientRect().left : input.getBoundingClientRect().left+parseFloat(s.borderLeftWidth)+parseFloat(s.paddingLeft);
            return {height:r.height,delta:Math.abs(i.y+i.height/2-r.y-r.height/2),gap:textLeft-i.right,visible:input.type,disabled:input.disabled};
          });
        });
        // Allow one CSS pixel for transformed SVG/border rounding after scrolling.
        for (const m of metrics) {assert.equal(m.height,44);assert.ok(m.delta<=1,JSON.stringify(m));assert.ok(m.gap>=10 && m.gap<=13,JSON.stringify(m));assert.equal(m.disabled,false);}
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      }
      const fieldSelectors = ['#pickup','#dropoff','#date','#time','#quote-section-passengers','#quote-section-suitcases'];
      async function palette(selector) {
        return page.locator(selector).evaluate(el => {
          const shell=el.matches('.address-input') ? el.parentElement.parentElement : el.closest('[data-schedule-control]') || el;
          const prompt=shell.querySelector('.homepage-schedule-prompt');
          const style=getComputedStyle(shell);
          return {background:style.backgroundColor,border:style.borderTopColor,borderWidth:style.borderTopWidth,
            color:getComputedStyle(prompt || el).color,placeholder:getComputedStyle(el,'::placeholder').color};
        });
      }
      for(const selector of fieldSelectors) {
        const color=await palette(selector);
        assert.equal(color.background,'rgb(30, 48, 71)',selector);
        assert.equal(color.border,'rgb(82, 99, 122)',selector);
        assert.equal(color.borderWidth,'1px',selector);
        if(selector==='#pickup'||selector==='#dropoff') {
          // WebKit does not expose ::placeholder reliably through getComputedStyle.
          const {data,info}=await sharp(await page.locator(selector).screenshot()).raw().toBuffer({resolveWithObject:true});
          let matches=0;
          for(let n=0;n<data.length;n+=info.channels) if(Math.abs(data[n]-193)<9 && Math.abs(data[n+1]-202)<9 && Math.abs(data[n+2]-214)<9) matches++;
          assert.ok(matches>3,selector+' visibly paints the approved placeholder colour');
        } else assert.equal(color.color,'rgb(193, 202, 214)',selector);
        await page.locator(selector).focus();
        await page.waitForFunction(selector=>{
          const el=document.querySelector(selector);
          const shell=el.matches('.address-input')?el.parentElement.parentElement:el.closest('[data-schedule-control]')||el;
          return getComputedStyle(shell).borderTopColor===getComputedStyle(document.querySelector('.homepage-field-icon')).color;
        },selector);
        await page.locator(selector).blur();
        await page.waitForFunction(selector=>{
          const el=document.querySelector(selector);
          const shell=el.matches('.address-input')?el.parentElement.parentElement:el.closest('[data-schedule-control]')||el;
          return getComputedStyle(shell).borderTopColor==='rgb(82, 99, 122)';
        },selector);
      }
      const quoteHeading=page.locator('[data-site-nav-heading="quote"]');
      assert.ok((await quoteHeading.evaluate(el=>getComputedStyle(el).fontFamily)).toLowerCase().includes('manrope'));
      assert.equal(await quoteHeading.evaluate(el=>getComputedStyle(el).fontWeight),'600');
      await checkFields();
      for (const [id,value] of [['date','2027-02-10'],['time','12:30']]) {
        const input=page.locator('#'+id); if(width<768) await input.tap(); else await input.click(); assert.equal(await input.evaluate(el=>document.activeElement===el),true); await input.fill(value); assert.equal(await input.inputValue(),value);
      }
      await page.locator('#quote-section-passengers').selectOption('2');
      await page.locator('#quote-section-suitcases').selectOption('2');
      await page.locator('h1').click();
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('#quote-section-passengers')).borderTopColor==='rgb(82, 99, 122)');
      for(const selector of fieldSelectors.slice(2)) {
        await page.waitForFunction(selector=>getComputedStyle(document.querySelector(selector)).color==='rgb(255, 255, 255)',selector);
        assert.equal((await palette(selector)).color,'rgb(255, 255, 255)',selector);
      }
      await checkFields();
      await page.getByRole('button',{name:/Return.*5%/}).click();
      await page.locator('#returnDate').fill('2027-02-12');
      await page.locator('#returnTime').fill('13:45');
      await checkFields();
      await page.screenshot({path:`test-results/homepage-fields/${name}-${width}.png`,fullPage:false});
      console.log(`PASS ${name} ${width}px: heading, 44px fields, centered icons, text gap, native input focus/values, return dates, no overflow`);
      await context.close();
    }
  } finally { await browser.close(); }
}
