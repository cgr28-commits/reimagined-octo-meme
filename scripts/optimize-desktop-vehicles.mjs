import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

// Sources are faithful edits of the existing approved photographs. Never overwrite mobile assets.
await mkdir('public/images/vehicles/desktop', { recursive: true });
for (const vehicle of ['saloon', 'estate', 'business-class', 'minibus']) {
  for (const width of [640, 960, 1600]) {
    const image = sharp(`design/desktop-vehicles/${vehicle}.png`).resize(width, width / 2, { fit: 'contain', background: '#00000000' });
    await image.clone().webp({ quality: 84, alphaQuality: 100 }).toFile(`public/images/vehicles/desktop/${vehicle}-${width}.webp`);
    await image.clone().avif({ quality: 60, effort: 4 }).toFile(`public/images/vehicles/desktop/${vehicle}-${width}.avif`);
  }
}
