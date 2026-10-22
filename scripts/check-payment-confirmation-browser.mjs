/** Isolated verified-payment return screen checks. Never contacts SumUp or sends a booking/email. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
const engine=process.env.PLAYWRIGHT_BROWSER || 'chromium';
const base=process.env.TEST_BASE_URL||'http://localhost:3000';
const output=`test-results/homepage-booking/${engine}`;
await fs.mkdir(output,{recursive:true});
const browser=await ({chromium,webkit}[engine]).launch();
try {
 for (const width of [390,1280]) {
  let state='paid',calls=0;
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===new URL(base).origin)return route.continue();
   if(req.method()==='POST'&&url.pathname.includes('confirm')) {
    calls++;
    await new Promise(r=>setTimeout(r,400));
    if(state==='error'||state==='pending')return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:state==='pending'?'Payment has not been completed':'Unable to verify payment'})});
    return route.fulfill({contentType:'application/json',body:JSON.stringify({amountPaid:state==='deposit'?'£20.00':'£100.00',paymentReference:'SUMUP-EXAMPLE',customerReference:'MAT-1234',customerEmailSent:true,ownerEmailSent:true,emailSent:true,calendarLogged:true,...(state==='deposit'?{paymentMethod:'DEPOSIT_CASH',totalFare:100,onlineAmountPaid:20,cashBalanceDue:80}:{})})});
   }
   return route.abort();
  });
  const page=await context.newPage();
  await page.goto(`${base}/booking-confirmed/`);
  await page.getByRole('heading',{name:'Checking your payment',exact:true}).waitFor();
  assert.equal(await page.locator('[data-confirmed-booking-number]').count(),0);
  assert.equal(calls,0);
  const cookie=page.getByRole('button',{name:'Reject optional',exact:true});
  if(await cookie.isVisible())await cookie.click();
  for(const test of ['paid','deposit','error','pending']) {
   state=test;
   await page.goto(`${base}/booking-confirmed/?payment=return&checkout_id=test-${width}-${test}`);
   await page.getByRole('heading',{name:'Confirming payment',exact:true}).waitFor();
   assert.equal(await page.locator('[data-confirmed-booking-number]').count(),0);
   if(test==='paid'||test==='deposit') {
    await page.getByRole('heading',{name:'Booking confirmed',exact:true}).waitFor();
    assert.match(await page.locator('[data-confirmed-booking-number]').innerText(),/Your booking number\s+MAT-1234/i);
    assert.ok(await page.locator('[data-confirmed-booking-number]').isVisible());
    assert.match(await page.locator('main').innerText(),/Payment reference: SUMUP-EXAMPLE/);
    if(test==='deposit')assert.match(await page.locator('main').innerText(),/80/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`${output}/${width}-payment-confirmation-${test}.png`,fullPage:true});
    await page.getByRole('link',{name:'Back to home',exact:true}).click();
    await page.locator('#quote-section-passengers').waitFor();
    assert.equal(new URL(page.url()).pathname,'/');
   } else {
    await page.getByRole('heading',{name:test==='pending'?'Payment processing':'Payment check',exact:true}).waitFor();
    assert.equal(await page.locator('[data-confirmed-booking-number]').count(),0);
    assert.equal(await page.getByRole('heading',{name:'Booking confirmed',exact:true}).count(),0);
   }
  }
  console.log(`PASS ${width}px: direct visit/loading/pending/error cannot show success; verified paid/deposit show MAT number, payment reference and correct balances; no overflow`);
  await context.close();
 }
} finally { await browser.close(); }
