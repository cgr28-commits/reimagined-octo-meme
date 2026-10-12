import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig } from '../shared/owner-pricing-config';
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const output = 'test-results/meet-greet';
await fs.mkdir(output, {recursive:true});
const browser = await chromium.launch();
try {
  for (const width of [390,1280]) {
    const context = await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(base).origin) return route.continue();
      const json = body => route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
      if (url.pathname.includes('/route/v1/driving')) return json({code:'Ok',routes:[{distance:26000,duration:1800,geometry:{coordinates:[[-5.9302,54.5964],[-6.2158,54.6575]],type:'LineString'}}]});
      if (url.pathname === '/pricing/public') {
        const pricing = defaultOwnerPricingSettings(); pricing.meetGreet={bfsGbp:25,bhdGbp:25,dubGbp:25};
        return json({config:toPublicOwnerPricingConfig(pricing)});
      }
      if (url.pathname === '/quote/availability') return json({blocked:false,available:true,alternativeTimes:[]});
      return route.abort(); // Never call live booking, payment or email services.
    });
    const previewPricing = defaultOwnerPricingSettings();
    previewPricing.meetGreet={bfsGbp:25,bhdGbp:25,dubGbp:25};
    await context.addInitScript(settings => localStorage.setItem('matni:preview-pricing-settings',JSON.stringify(settings)),previewPricing);
    const page = await context.newPage();
    await page.goto(`${base}/?previewJourney=bfs&previewMinibus=1`);
    await page.waitForFunction(()=>document.getElementById('pickup')?.value.includes('City Hall'));
    if (await page.getByRole('button',{name:'Essential only',exact:true}).isVisible()) await page.getByRole('button',{name:'Essential only',exact:true}).click();
    await page.getByRole('button',{name:'Swap pickup and drop-off',exact:true}).click();
    await page.locator('#quote-section-passengers').selectOption('2');
    await page.locator('#quote-section-suitcases').selectOption('2');
    await page.getByRole('button',{name:'Get My Fixed Price →',exact:true}).last().click();
    await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).click();
    const card = page.locator('[data-meet-greet-leg="outbound"]');
    await card.waitFor();
    const checkbox = card.getByRole('checkbox');
    assert.equal(await checkbox.isChecked(),false);
    assert.match(await card.innerText(),/\+£25/);
    assert.ok(await card.evaluate(el=>document.getElementById('child-seat-availability').getBoundingClientRect().top < el.getBoundingClientRect().top));
    const total = () => page.locator('#step2-journey-summary').innerText().then(s=>Number(s.match(/Total £([\d,.]+)/)[1].replaceAll(',','')));
    const before = await total();
    await checkbox.check();
    await page.waitForTimeout(200);
    assert.equal(await total(),before+25);
    await card.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`${output}/${width}-meet-greet-selected.png`});
    await checkbox.uncheck();
    assert.equal(await total(),before);
    await checkbox.check();
    await page.locator('[data-back-to-quote]').first().click();
    await page.getByRole('button',{name:/BOOK THIS TRANSFER/i}).click();
    assert.equal(await checkbox.isChecked(),true);
    console.log(`PASS ${width}px: below child seats, dashboard £25, optional total toggle, back-to-quote persistence, no overflow`);
    await context.close();
  }
} finally { await browser.close(); }
