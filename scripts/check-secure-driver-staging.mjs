import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { chromium, webkit } from 'playwright';
import { stagingStore } from './driver-integration/staging-store.ts';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'myjobs-secure-'));
const { outputFiles } = await build({ entryPoints: ['workers/addresses/src/driver-staging.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const options = {
  cf: false, modules: true, script: outputFiles[0].text, compatibilityDate: '2026-10-01', https: true, host: '127.0.0.1',
  durableObjects: { DRIVER_AUTH: { className: 'DriverAuthCoordinator', useSQLite: true } },
  kvNamespaces: ['STAGING_BOOKINGS'], bindings: { STAGING_ONLY: 'true' },
  durableObjectsPersist: path.join(temp, 'do'), kvPersist: path.join(temp, 'kv'),
  outboundService: () => { throw new Error('External network prohibited in staging'); },
  serviceBindings: { ASSETS: async request => {
    const root = path.resolve('out'); let file = path.resolve(root, '.' + new URL(request.url).pathname);
    if (!file.startsWith(root + path.sep)) return new Response('', { status: 404 });
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return new Response('', { status: 404 });
    return new Response(fs.readFileSync(file), { headers: { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' } });
  } },
};
let mf = new Miniflare({ ...convertV4MiniflareOptions(options), resourcePersistencePath: temp });
const base = 'https://staging.invalid';
async function call(url, { cookie, body, method = body === undefined ? 'GET' : 'POST', origin = base, headers = {} } = {}) {
  return mf.dispatchFetch(base + url, { method, headers: { Origin: origin, 'X-Driver-Intent': 'portal', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function issue(profile) { const response = await call('/driver/staging/invite', { body: { profile } }); assert.equal(response.status, 200); return (await response.json()).code; }
async function login(profile) { const response = await call('/driver/portal/exchange', { body: { code: await issue(profile) } }); assert.equal(response.status, 200); const body = await response.json(); assert.deepEqual(Object.keys(body).sort(), ['driverName', 'ok']); const cookie = response.headers.get('Set-Cookie'); for (const value of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(value)); assert.ok(!cookie.includes('Domain=')); return cookie.split(';')[0]; }
try {
  const fixture = await stagingStore('local-synthetic-only');
  console.log('Starting isolated Worker runtime…');
  let kv = await mf.getKVNamespace('STAGING_BOOKINGS');
  const records = [...fixture.data].filter(([key]) => !key.startsWith('driver-portal-'));
  for (const [key, value] of records) await kv.put(key, value);
  assert.equal((await call('/driver/jobs?scope=assigned-page')).status, 401);
  const code = await issue('owner');
  const raced = await Promise.all(Array.from({ length: 8 }, () => call('/driver/portal/exchange', { body: { code } })));
  assert.equal(raced.filter(r => r.status === 200).length, 1, 'Invitation exchange must be atomic');
  assert.equal(raced.filter(r => r.status === 401).length, 7);
  const owner = raced.find(r => r.status === 200).headers.get('Set-Cookie').split(';')[0];
  let ownerJobs = [];
  assert.equal((await call('/driver/portal/exchange', { body: { code } })).status, 401);
  for (const [profile, expected] of [['owner', 5], ['other', 1], ['empty', 0]]) {
    const cookie = profile === 'owner' ? owner : await login(profile);
    const response = await call('/driver/jobs?scope=assigned-page', { cookie });
    assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const { jobs } = await response.json(); assert.equal(jobs.length, expected);
    if (profile === 'owner') {
      ownerJobs = jobs;
      assert.ok(!jobs.some(j => ['staging-other', 'staging-unassigned', 'staging-legacy'].includes(j.token)));
      assert.equal(jobs.find(j => j.journeyLeg === 'return').flightNumber, 'RETURN123');
      assert.deepEqual(jobs.find(j => j.bookingStatus === 'cancelled').allowedJourneyActions, []);
      for (const token of ['staging-other', 'staging-unassigned', 'staging-legacy']) assert.equal((await call('/driver/flight', { cookie, body: { token } })).status, 404);
      const flight = await call('/driver/flight', { cookie, body: { token: 'staging-arrival' } }); assert.equal((await flight.json()).flight.delayMinutes, 45);
      for (const token of ['staging-cancelled', 'staging-missing-flight']) assert.equal((await (await call('/driver/flight', { cookie, body: { token } })).json()).flight, null);
    }
  }
  assert.equal((await call('/driver/jobs?key=legacy')).status, 401);
  assert.equal((await call('/driver/jobs', { cookie: owner, headers: { 'X-Driver-Session': 'dps_legacy' } })).status, 401);
  assert.equal((await call('/driver/portal/exchange?access=secret', { body: { code: 'bad' } })).status, 400);
  assert.equal((await call('/driver/portal/exchange', { body: null })).status, 400);
  assert.equal((await call('/driver/portal/logout', { cookie: owner, body: {}, origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await call('/driver/portal/logout', { cookie: owner, body: {}, headers: { 'X-Driver-Intent': '' } })).status, 403);
  for (const route of ['journey', 'assignment', 'location', 'portal/request-code', 'portal/invite']) assert.equal((await call('/driver/' + route, { cookie: owner, body: {} })).status, 403);
  await mf.dispose(); mf = new Miniflare({ ...convertV4MiniflareOptions(options), resourcePersistencePath: temp }); await mf.ready;
  assert.equal((await call('/driver/portal/session', { cookie: owner })).status, 200, 'Session must persist across worker restart');
  assert.equal((await call('/driver/jobs?scope=assigned-page', { cookie: owner })).status, 200);
  const logout = await call('/driver/portal/logout', { cookie: owner, body: {} }); assert.equal(logout.status, 200); assert.ok(logout.headers.get('Set-Cookie').includes('Max-Age=0'));
  assert.equal((await call('/driver/jobs?scope=assigned-page', { cookie: owner })).status, 401, 'Old cookie must be revoked server-side');
  kv = await mf.getKVNamespace('STAGING_BOOKINGS'); for (const [key, value] of records) assert.equal(await kv.get(key), value, 'Booking records must remain unchanged');
  console.log('PASS: real Durable Object atomic exchange, replay denial, cookie flags, persistent sessions/KV, server logout, CSRF, no URL/legacy credentials, per-driver permissions, cancellations, returns, missing flights, read-only booking records and external network denial.');
  fs.mkdirSync('artifacts/driver-secure-staging', { recursive: true });
  const origin = (await mf.ready).origin;
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try { for (const width of [320, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce', ignoreHTTPSErrors: true });
      const page = await context.newPage(); const external = [];
      await page.addInitScript(() => {
        window.__testGeoCalls = 0;
        for (const method of ['watchPosition', 'getCurrentPosition']) Object.defineProperty(navigator.geolocation, method, { configurable: true, value: () => { window.__testGeoCalls++; return 0; } });
      });
      const gpsRequests = [];
      page.on('request', request => {
        if (/\/driver\/(location|location-history|sharing|journey-session)(?:\?|$)|\/track\/(location|sharing|[a-f0-9]{32})(?:\?|$)/.test(request.url())) gpsRequests.push(new URL(request.url()).pathname);
      });
      await page.route('**/*', route => { if (!route.request().url().startsWith(origin)) { external.push(route.request().url().split('?')[0]); return route.abort(); } return route.continue(); });
      await page.goto(origin + '/driver/');
      await page.getByRole('button', { name: 'Open test jobs', exact: true }).click();
      await page.getByText('Booking MAT-STAGE-OUTBOUND', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.cookie.includes('__Host-matni-driver')), false);
      assert.equal(await page.evaluate(() => localStorage.getItem('matni-driver-portal-session')), null);
      assert.ok((await context.cookies()).find(c => c.name === '__Host-matni-driver').httpOnly);
      await page.reload(); await page.getByText('Booking MAT-STAGE-OUTBOUND', { exact: true }).waitFor();
      const outbound = page.locator('#owner-job-staging-outbound');
      await outbound.locator('[data-pickup-time]').filter({ hasText: '10:30' }).waitFor();
      await outbound.getByText('Titanic Belfast', { exact: true }).waitFor();
      assert.ok((await outbound.getByRole('link', { name: 'Navigate to pickup', exact: true }).getAttribute('href')).includes('Titanic%20Belfast'));
      assert.ok((await outbound.getByRole('link', { name: 'Call customer', exact: true }).getAttribute('href')).startsWith('tel:'));
      assert.ok((await outbound.getByRole('link', { name: 'WhatsApp customer', exact: true }).getAttribute('href')).startsWith('https://wa.me/'));
      const pending = page.locator('#owner-job-staging-missing-flight');
      await pending.getByText(/Flight number missing/).waitFor();
      assert.equal(await pending.getByRole('link', { name: /customer/ }).count(), 0, 'Pending jobs must not reveal contact links');
      assert.equal(await pending.getByRole('button', { name: 'Driver On Way', exact: true }).count(), 0);
      const notice = page.getByRole('complementary', { name: 'Staging test controls' });
      assert.equal(await notice.evaluate(node => getComputedStyle(node).position), 'static', 'Staging controls must stay in document flow');
      assert.equal(await page.getByText('Not yet open', { exact: true }).count(), 0, 'GPS timing must not look like a job lock');
      assert.deepEqual(await page.locator('article[id^="owner-job-"] a, article[id^="owner-job-"] button').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height < 44).map(node => node.textContent)), [], 'Card tap targets must be at least 44px tall');
      await page.getByText('Booking cancelled', { exact: true }).waitFor();
      assert.equal(await page.locator('#owner-job-staging-cancelled').getByRole('button').count(), 0, 'Cancelled jobs must have no assignment/journey actions');
      await page.getByRole('button', { name: 'Show flight updates', exact: true }).first().click();
      await page.getByText('Arrival 45 minutes later than scheduled', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
      await page.getByText('Booking MAT-STAGE-RETURN', { exact: true }).waitFor();
      await page.locator('#owner-job-staging-return').getByText('Flight RETURN123 · BFS', { exact: true }).waitFor();
      assert.equal(await page.locator('#owner-job-staging-return').getByRole('button', { name: 'Driver On Way', exact: true }).isEnabled(), true, 'Future jobs must not be locked by the GPS window');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.getByRole('dialog', { name: 'Cookie consent' }).count(), 0);
      assert.equal(await page.locator('script[src*="googletagmanager"],script[src*="tgtag.io"],script[src*="tawk.to"]').count(), 0);
      await page.evaluate(() => window.scrollTo(0, 0));
      assert.equal(await notice.evaluate(node => node.getBoundingClientRect().top >= document.querySelector('header').getBoundingClientRect().bottom), true, 'Staging controls must sit below the fixed header at the top of the page');
      await page.screenshot({ path: `artifacts/driver-secure-staging/${engine.name()}-${width}.png`, fullPage: true });
      // Browser-only fictional responses exercise the existing handlers and action mappings.
      // No mutation reaches the staging Worker, KV, customer messaging or a live service.
      await page.getByRole('button', { name: 'Today', exact: true }).click();
      await outbound.waitFor();
      await page.evaluate(() => { window.__testWhatsApp = []; window.open = href => { window.__testWhatsApp.push(href); return {}; }; });
      const transitions = [
        ['Driver On Way', 'start_tracking', 'tracking', 'Driver on the way'],
        ['Driver Arrived', 'arrived_pickup', 'arrived_pickup', 'Driver has arrived'],
        ['Passenger On Board', 'start_journey', 'en_route', 'Journey underway'],
        ['Arrived at Destination', 'arrived_destination', 'arrived_destination', 'Arrived at destination'],
        ['Journey Completed', 'complete_journey', 'completed', 'Journey completed'],
      ];
      const actions = [];
      await page.route('**/driver/journey', route => {
        const { token, action } = route.request().postDataJSON();
        assert.equal(token, 'staging-outbound');
        assert.equal(route.request().method(), 'POST');
        const transition = transitions[actions.length];
        assert.equal(action, transition[1]); actions.push(action);
        // A stale server claiming GPS is active must still not start browser geolocation.
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, token, journeyStatus: transition[2], journeyStatusLabel: transition[3], allowedActions: [], sharingActive: transition[2] !== 'completed', customerWhatsAppMessage: 'Fictional notification contract' }) });
      });
      for (const [label, , , status] of transitions) {
        await outbound.getByRole('button', { name: label, exact: true }).click();
        await outbound.getByText(status, { exact: true }).waitFor();
      }
      assert.deepEqual(actions, transitions.map(t => t[1]));
      assert.equal(await outbound.getByRole('button').count(), 0, 'Completed job must have no further journey buttons');
      assert.equal(await page.evaluate(() => window.__testWhatsApp.length), 2, 'Existing on-way/arrived manual WhatsApp behavior is preserved');
      assert.equal(await page.evaluate(() => window.__testWhatsApp.every(href => href.includes(encodeURIComponent('Fictional notification contract')))), true);
      assert.equal(await page.evaluate(() => window.__testGeoCalls), 0, 'No location permissions, watch or polling after status changes');
      assert.equal(await page.getByRole('button', { name: /Stop tracking|Share live location|Resume GPS/ }).count(), 0);
      assert.equal(await page.locator('.leaflet-container').count(), 0);
      assert.equal(await page.getByText(/Sharing live location for this job|Waiting for GPS|GPS live/).count(), 0);
      await page.unroute('**/driver/journey');
      const assignmentActions = [];
      await page.route('**/driver/assignment', route => {
        const { token, action } = route.request().postDataJSON();
        assert.equal(token, 'staging-missing-flight'); assignmentActions.push(action);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, job: { ...ownerJobs.find(j => j.token === token), assignmentStatus: action === 'accept' ? 'accepted' : 'declined', customerMobile: action === 'accept' ? '07000000000' : '' } }) });
      });
      await pending.getByRole('button', { name: 'Accept Job', exact: true }).click();
      await pending.getByRole('link', { name: 'Call customer', exact: true }).waitFor();
      await pending.getByRole('button', { name: 'Driver On Way', exact: true }).waitFor();
      await page.reload(); // The read-only fixture remains pending; acceptance above was browser-only.
      await pending.getByRole('button', { name: 'Decline', exact: true }).click();
      await pending.waitFor({ state: 'detached' });
      assert.deepEqual(assignmentActions, ['accept', 'decline']);
      await page.unroute('**/driver/assignment');
      await page.getByLabel('Test driver', { exact: true }).selectOption('other'); await page.getByRole('button', { name: 'Open test jobs', exact: true }).click();
      await page.getByText('Booking MAT-STAGE-OTHER', { exact: true }).waitFor(); assert.equal(await page.getByText('Booking MAT-STAGE-OUTBOUND', { exact: true }).count(), 0);
      await page.getByLabel('Test driver', { exact: true }).selectOption('empty'); await page.getByRole('button', { name: 'Open test jobs', exact: true }).click();
      await page.getByText('No jobs assigned to you for this date yet.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor(); await page.reload(); await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
      await page.route('**/driver/jobs?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Staging data unavailable. Please retry."}' }));
      await page.getByLabel('Test driver', { exact: true }).selectOption('owner'); await page.getByRole('button', { name: 'Open test jobs', exact: true }).click();
      await page.getByText('Staging data unavailable. Please retry.', { exact: true }).waitFor();
      await page.goto(origin + '/track/?id=' + 'a'.repeat(32));
      await page.getByRole('heading', { name: 'Driver location sharing', exact: true }).waitFor();
      await page.getByRole('link', { name: 'Contact us on WhatsApp', exact: true }).waitFor();
      assert.equal(await page.locator('.leaflet-container').count(), 0);
      assert.equal(await page.evaluate(() => window.__testGeoCalls), 0);
      assert.deepEqual(gpsRequests, [], 'No GPS upload, history or customer polling requests');
      assert.deepEqual(external, []); await context.close();
    } console.log(`PASS ${engine.name()}: secure login/reload/logout, 320/390px, 44px card controls, unobstructed staging banner, time/navigation/contact privacy, fictional accept/decline and journey action mappings, returns/flight/cancellation, isolation, empty/error states, no overflow, external messages or advertising.`);
    } finally { await browser.close(); }
  }
  kv = await mf.getKVNamespace('STAGING_BOOKINGS');
  for (const [key, value] of records) assert.equal(await kv.get(key), value, 'Browser tests must not change booking records');
} finally { await mf.dispose(); fs.rmSync(temp, { recursive: true, force: true }); }
