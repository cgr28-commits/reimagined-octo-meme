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
  assert.equal((await call('/driver/portal/exchange', { body: { code } })).status, 401);
  for (const [profile, expected] of [['owner', 5], ['other', 1], ['empty', 0]]) {
    const cookie = profile === 'owner' ? owner : await login(profile);
    const response = await call('/driver/jobs?scope=assigned-page', { cookie });
    assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const { jobs } = await response.json(); assert.equal(jobs.length, expected);
    if (profile === 'owner') {
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
      const context = await browser.newContext({ viewport: { width, height: 844 }, ignoreHTTPSErrors: true });
      const page = await context.newPage(); const external = [];
      await page.route('**/*', route => { if (!route.request().url().startsWith(origin)) { external.push(route.request().url().split('?')[0]); return route.abort(); } return route.continue(); });
      await page.goto(origin + '/driver/');
      await page.getByRole('button', { name: 'Open test jobs', exact: true }).click();
      await page.getByText('Booking MAT-STAGE-OUTBOUND', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.cookie.includes('__Host-matni-driver')), false);
      assert.equal(await page.evaluate(() => localStorage.getItem('matni-driver-portal-session')), null);
      assert.ok((await context.cookies()).find(c => c.name === '__Host-matni-driver').httpOnly);
      await page.reload(); await page.getByText('Booking MAT-STAGE-OUTBOUND', { exact: true }).waitFor();
      await page.getByText(/10:30.*Titanic Belfast/).waitFor();
      await page.getByText('Booking cancelled', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Show flight updates', exact: true }).first().click();
      await page.getByText('Arrival 45 minutes later than scheduled', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
      await page.getByText('Booking MAT-STAGE-RETURN', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.getByRole('dialog', { name: 'Cookie consent' }).count(), 0);
      assert.equal(await page.locator('script[src*="googletagmanager"],script[src*="tgtag.io"],script[src*="tawk.to"]').count(), 0);
      await page.screenshot({ path: `artifacts/driver-secure-staging/${engine.name()}-${width}.png`, fullPage: true });
      await page.getByLabel('Test driver', { exact: true }).selectOption('other'); await page.getByRole('button', { name: 'Open test jobs', exact: true }).click();
      await page.getByText('Booking MAT-STAGE-OTHER', { exact: true }).waitFor(); assert.equal(await page.getByText('Booking MAT-STAGE-OUTBOUND', { exact: true }).count(), 0);
      await page.getByLabel('Test driver', { exact: true }).selectOption('empty'); await page.getByRole('button', { name: 'Open test jobs', exact: true }).click();
      await page.getByText('No jobs assigned to you for this date yet.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor(); await page.reload(); await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
      await page.route('**/driver/jobs?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Staging data unavailable. Please retry."}' }));
      await page.getByLabel('Test driver', { exact: true }).selectOption('owner'); await page.getByRole('button', { name: 'Open test jobs', exact: true }).click();
      await page.getByText('Staging data unavailable. Please retry.', { exact: true }).waitFor();
      assert.deepEqual(external, []); await context.close();
    } console.log(`PASS ${engine.name()}: secure login/reload/logout, 320/390px, jobs/return/flight/cancellation, isolation, empty/error states, no overflow or advertising.`);
    } finally { await browser.close(); }
  }
} finally { await mf.dispose(); fs.rmSync(temp, { recursive: true, force: true }); }
