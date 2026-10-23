import fs from 'node:fs';
// Keep only the disabled customer tracking landing page for review, never booking/admin pages.
const disabledTrackingPage = fs.readFileSync('out/track/index.html', 'utf8');
await import('./prepare-driver-preview.mjs');
for (const file of ['out/_headers', 'out/driver/index.html']) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll("connect-src 'none'", "connect-src 'self'"));
const cspMeta = fs.readFileSync('out/driver/index.html', 'utf8').match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)?.[0];
if (!cspMeta) throw new Error('Staging CSP missing');
fs.mkdirSync('out/track', { recursive: true });
fs.writeFileSync('out/track/index.html', disabledTrackingPage.replace('<head>', `<head>${cspMeta}`));
console.log('Prepared secure staging assets. No production backend or optional tracking.');
