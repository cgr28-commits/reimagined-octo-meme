import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import './prepare-driver-preview.mjs';
for (const file of ['out/_headers', 'out/driver/index.html']) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll("connect-src 'none'", "connect-src 'self'"));
await build({ entryPoints: ['scripts/driver-integration/preview-worker.ts'], outfile: 'out/_worker.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', define: { STAGING_SESSION_SEED: JSON.stringify(randomBytes(32).toString('hex')) } });
fs.writeFileSync('out/_routes.json', JSON.stringify({ version: 1, include: ['/driver/jobs', '/driver/flight', '/driver/preview-session', '/driver/assignment', '/driver/journey*', '/driver/location', '/driver/portal/*', '/driver/sharing'], exclude: [] }));
console.log('Prepared isolated server-backed staging preview. No KV bindings or service credentials.');
