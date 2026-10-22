import fs from 'node:fs';
import './prepare-driver-preview.mjs';
for (const file of ['out/_headers', 'out/driver/index.html']) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll("connect-src 'none'", "connect-src 'self'"));
console.log('Prepared secure staging assets. No production backend or optional tracking.');
