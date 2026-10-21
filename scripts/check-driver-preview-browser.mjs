import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let file = path.join(process.cwd(), 'out', decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(3107, '127.0.0.1', resolve));
fs.mkdirSync('artifacts/driver-preview', { recursive: true });
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const external = [];
      await page.route('**/*', route => {
        if (!route.request().url().startsWith('http://127.0.0.1:3107/')) { external.push(route.request().url()); return route.abort(); }
        return route.continue();
      });
      await page.goto('http://127.0.0.1:3107/driver/');
      await page.getByText('Booking MAT-PREVIEW-1001', { exact: true }).waitFor();
      assert.equal(await page.locator('input[type=password]').count(), 0);
      await page.getByRole('button', { name: 'Show flight updates', exact: true }).first().click();
      await page.getByText('Arrival 45 minutes later than scheduled', { exact: true }).waitFor();
      await page.screenshot({ path: `artifacts/driver-preview/${engine.name()}-today.png`, fullPage: true });
      await page.getByRole('button', { name: /Upcoming/i }).first().click();
      await page.getByText('Booking MAT-PREVIEW-1003', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.evaluate(() => fetch('https://preview.invalid/driver/journey', { method: 'POST' }).then(r => r.status)), 403);
      assert.deepEqual(external, [], 'No request may leave the preview origin');
      await page.screenshot({ path: `artifacts/driver-preview/${engine.name()}-future.png`, fullPage: true });
      console.log(`PASS ${engine.name()}: no key; today and +200-day jobs; flight warning; no external requests; writes denied`);
    } finally { await browser.close(); }
  }
} finally { server.close(); }
