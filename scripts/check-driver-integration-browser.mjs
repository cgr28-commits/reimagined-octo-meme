import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { previewRequest } from './driver-integration/preview-worker.ts';
const origin = 'http://127.0.0.1:3108';
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const request = new Request(origin + req.url, { method: req.method, headers: req.headers, ...(body.length ? { body } : {}) });
    const response = await previewRequest(request, 'browser-test-only');
    if (response) { res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return; }
    let file = path.join(process.cwd(), 'out', new URL(request.url).pathname);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(500).end('Test server unavailable'); }
});
await new Promise(resolve => server.listen(3108, '127.0.0.1', resolve));
fs.mkdirSync('artifacts/driver-integration', { recursive: true });
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      for (const width of [320, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 844 } });
        const external = [];
        await page.route('**/*', route => { if (!route.request().url().startsWith(origin)) { external.push(route.request().url().split('?')[0]); return route.abort(); } return route.continue(); });
        await page.goto(origin + '/driver/');
        await page.getByText('Booking MAT-STAGE-OUTBOUND', { exact: true }).waitFor();
        await page.getByText(/10:30.*Titanic Belfast/).waitFor();
        assert.equal(await page.getByRole('dialog', { name: 'Cookie consent' }).count(), 0);
        assert.equal(await page.locator('script[src*="googletagmanager"],script[src*="tgtag.io"],script[src*="tawk.to"]').count(), 0);
        await page.getByText('Booking cancelled', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Show flight updates', exact: true }).first().click();
        await page.getByText('Arrival 45 minutes later than scheduled', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
        await page.getByText('Booking MAT-STAGE-RETURN', { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: `artifacts/driver-integration/${engine.name()}-${width}.png`, fullPage: true });
        await page.getByLabel('Test driver', { exact: true }).selectOption('other');
        await page.getByText('Booking MAT-STAGE-OTHER', { exact: true }).waitFor();
        assert.equal(await page.getByText('Booking MAT-STAGE-OUTBOUND', { exact: true }).count(), 0);
        await page.getByLabel('Test driver', { exact: true }).selectOption('empty');
        await page.getByText('No jobs assigned to you for this date yet.', { exact: true }).waitFor();
        assert.deepEqual(external, []);
        await page.route('**/driver/jobs?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Staging data unavailable. Please retry."}' }));
        await page.getByLabel('Test driver', { exact: true }).selectOption('owner');
        await page.getByText('Staging data unavailable. Please retry.', { exact: true }).waitFor();
        await page.close();
      }
      console.log(`PASS ${engine.name()}: 320/390px, server-backed jobs, cancellations, flight delay, future return, same-name separation, empty/error states, no overflow or external tracking`);
    } finally { await browser.close(); }
  }
} finally { server.close(); }
