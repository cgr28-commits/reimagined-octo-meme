import fs from 'node:fs';
import path from 'node:path';
// Publish only the driver page and its static assets, never the booking/owner pages.
const keep = new Set(['driver', '_next', 'images', 'logo.png', 'logo.svg', 'favicon.ico']);
for (const entry of fs.readdirSync('out')) if (!keep.has(entry)) fs.rmSync(path.join('out', entry), { recursive: true, force: true });
fs.writeFileSync('out/index.html', '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="0;url=/driver/"><a href="/driver/">Open sample My Jobs</a>');
fs.writeFileSync('out/robots.txt', 'User-agent: *\nDisallow: /\n');
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; form-action 'none'; object-src 'none'; base-uri 'self'";
fs.writeFileSync('out/_headers', `/*\n  Content-Security-Policy: ${csp}\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n  Permissions-Policy: geolocation=(), camera=(), microphone=()\n`);
// A meta copy keeps network isolation in local/static artifact previews too.
const page = 'out/driver/index.html';
fs.writeFileSync(page, fs.readFileSync(page, 'utf8').replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`));
console.log('Prepared read-only driver preview. API connections and geolocation are blocked.');
