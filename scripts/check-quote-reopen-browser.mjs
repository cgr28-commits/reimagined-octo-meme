import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('test-results/quote-reopen',{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 for(const width of [390,1280]) {
  const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();let externalWrites=0;const errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{const u=new URL(route.request().url());if(!['localhost','127.0.0.1'].includes(u.hostname)){if(route.request().method()!=='GET')externalWrites++;return route.abort();}return route.continue();});
  await page.goto('http://127.0.0.1:3000/owner/quote-review-preview/');
  const essential=page.getByRole('button',{name:'Essential only',exact:true});if(await essential.isVisible())await essential.click();
  await page.getByLabel('Quote reference, customer name or email').fill('MAT-DEMO');await page.getByRole('button',{name:'Find quote',exact:true}).click();
  const saved=page.locator('article').filter({hasText:'MAT-DEMO'}).first();await saved.getByRole('button',{name:'Reopen quote',exact:true}).click();
  await saved.scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/quote-reopen/${width}-saved-review.png`,fullPage:true});
  await saved.getByRole('button',{name:'Reopen & email customer',exact:true}).click();await page.getByText('Quote MAT-DEMO emailed to demo@example.com.',{exact:true}).waitFor();
  assert.match(await saved.innerText(),/Amended Belfast address/);assert.match(await saved.innerText(),/£80.00/);
  await saved.getByRole('button',{name:'Resend quote email',exact:true}).click();
  await saved.getByRole('button',{name:'Preview return offer — 5% discount',exact:true}).click();await saved.getByText('Review return offer',{exact:true}).waitFor();assert.match(await saved.innerText(),/Fixed price for both journeys: £152.00/);
  await page.screenshot({path:`test-results/quote-reopen/${width}-saved-return-review.png`,fullPage:true});
  await saved.getByRole('button',{name:'Cancel',exact:true}).click();
  const a2a=page.locator('article').filter({hasText:'DEMO-EXPIRED'});await a2a.getByRole('button',{name:'Edit journey',exact:true}).click();await a2a.getByLabel('Include a return journey').check();
  await a2a.getByLabel('Return date',{exact:true}).fill('2030-12-24');await a2a.getByLabel('Return time',{exact:true}).fill('12:00');await a2a.getByRole('button',{name:'Save changes',exact:true}).click();
  await a2a.getByLabel('Return transfer fare (£)').fill('80');assert.match(await a2a.innerText(),/fixed price £152.00/);
  await a2a.scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/quote-reopen/${width}-personalised-return-review.png`,fullPage:true});
  await a2a.getByRole('button',{name:'Reopen quote & email customer',exact:true}).click();await page.getByText(/Reopened DEMO-EXPIRED at £152.00/).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);assert.equal(externalWrites,0);assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: saved quote lookup/reopen/resend, preserved address/fare, return preview, personalised return/reopen, no overflow or external writes.`);await context.close();
 }
}finally{await browser.close();}
