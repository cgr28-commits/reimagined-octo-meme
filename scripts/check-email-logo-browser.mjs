import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { evaluateAirportPickupReminder } from '../shared/airport-pickup-reminder';
const result=evaluateAirportPickupReminder({customerName:'Alex Example',customerEmail:'alex@example.invalid',pickupLabel:'Belfast International Airport',dropoffLabel:'12 High Street, Belfast',tripDate:'2026-10-02',tripTime:'16:30',journeyLeg:'outbound',isFromAirport:true,airportCode:'BFS',outboundAirportAccessOption:'express',bookingStatus:'confirmed',operationalStatus:'confirmed',customerReference:'MAT-1001'},new Date('2026-10-02T13:00:00Z'));
assert.ok(result.eligible);
const output='test-results/homepage-booking';
await fs.mkdir(output,{recursive:true});
const png=await fs.readFile('public/logo-email.png');
const map=await fs.readFile('public/maps/belfast-international-pick-up-drop-off.jpg');
const browser=await chromium.launch();
try {
 for (const colorScheme of ['light','dark']) {
  const context=await browser.newContext({viewport:{width:390,height:900},colorScheme});
  await context.route('**/*',route=>route.request().url().endsWith('/logo-email.png') ? route.fulfill({contentType:'image/png',body:png}) : route.request().url().endsWith('/belfast-international-pick-up-drop-off.jpg') ? route.fulfill({contentType:'image/jpeg',body:map}) : route.abort());
  const page=await context.newPage();
  await page.setContent(result.html);
  await page.waitForFunction(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0));
  assert.equal(await page.locator('img[alt="My Airport Taxi NI"]').count(),1);
  assert.equal(await page.locator('img[alt^="Belfast International Airport map"]').count(),1);
  assert.equal(await page.locator('img[alt="My Airport Taxi NI"]').getAttribute('alt'),'My Airport Taxi NI');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${output}/390-collection-email-${colorScheme}.png`,fullPage:true});
  await page.setContent(await fs.readFile('public/invoice-example.html','utf8'));
  await page.waitForFunction(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0));
  assert.equal(await page.locator('img[alt^="Belfast City Airport Express"]').count(),0);
  assert.ok(await page.getByText('Thank you, Alex',{exact:true}).isVisible());
  assert.ok(await page.getByText('MAT-1001',{exact:true}).first().isVisible());
  assert.ok(await page.getByRole('link',{name:'Manage Your Booking',exact:true}).isVisible());
  assert.ok(await page.getByRole('link',{name:'Save My Airport Taxi NI to Contacts',exact:true}).isVisible());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${output}/390-booking-email-${colorScheme}.png`,fullPage:true});
  await page.setContent(result.html);
  await page.locator('img[alt="My Airport Taxi NI"]').evaluate(i=>i.src='https://blocked.invalid/missing.png');
  await page.waitForTimeout(100);
  assert.ok(await page.locator('.matni-header').getByText('My Airport Taxi NI',{exact:true}).isVisible());
  console.log('PASS collection email: visible logo, mobile layout, '+colorScheme+', company name retained when image blocked');
  await context.close();
 }
} finally { await browser.close(); }
