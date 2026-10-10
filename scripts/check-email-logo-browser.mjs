import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { evaluateAirportPickupReminder } from '../shared/airport-pickup-reminder';
const result=evaluateAirportPickupReminder({customerName:'Alex Example',customerEmail:'alex@example.invalid',pickupLabel:'Belfast International Airport',dropoffLabel:'12 High Street, Belfast',tripDate:'2026-10-02',tripTime:'16:30',journeyLeg:'outbound',isFromAirport:true,airportCode:'BFS',outboundAirportAccessOption:'express',bookingStatus:'confirmed',operationalStatus:'confirmed',customerReference:'MAT-1001'},new Date('2026-10-02T13:00:00Z'));
assert.ok(result.eligible);
const output='test-results/homepage-booking';
await fs.mkdir(output,{recursive:true});
const png=await fs.readFile('public/logo-email.png');
const browser=await chromium.launch();
try {
 for (const colorScheme of ['light','dark']) {
  const context=await browser.newContext({viewport:{width:390,height:900},colorScheme});
  await context.route('**/*',route=>route.request().url().endsWith('/logo-email.png') ? route.fulfill({contentType:'image/png',body:png}) : route.abort());
  const page=await context.newPage();
  await page.setContent(result.html);
  await page.waitForFunction(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0));
  assert.equal(await page.locator('img').count(),1);
  assert.equal(await page.locator('img').getAttribute('alt'),'My Airport Taxi NI');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${output}/390-collection-email-${colorScheme}.png`,fullPage:true});
  await page.locator('img').evaluate(i=>i.src='https://blocked.invalid/missing.png');
  await page.waitForTimeout(100);
  assert.ok(await page.getByText('MY AIRPORT TAXI NI',{exact:true}).isVisible());
  console.log('PASS collection email: visible logo, mobile layout, '+colorScheme+', company name retained when image blocked');
  await context.close();
 }
} finally { await browser.close(); }
