/**
 * Phone and tablet hero photographs for the four /airports/* guide pages
 * (Design 3, up to 1199px). Desktop keeps its existing images.
 * Run: node scripts/optimize-airport-page-heroes.mjs
 *
 * Owner-supplied originals live in design/airport-page-heroes/ (not published). Commons originals
 * are fetched into a temp folder and are not committed; only the cropped, resized outputs are. Credits live in
 * public/images/hero/IMAGE-LICENSE.md and src/app/photo-credits/page.tsx.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public/images/hero/optimized");
const cacheDir = join(tmpdir(), "matni-airport-page-heroes");
const USER_AGENT = "MyAirportTaxiNI-image-prep/1.0 (bookings@myairporttaxini.co.uk)";

/** Phone: homepage-style photo on the right of the heading (3:2). Tablet hero (3:2). */
const VARIANTS = [
  { name: "phone", width: 640, height: 427, avif: 50, webp: 66, jpeg: 72 },
  { name: "tablet", width: 960, height: 640, avif: 40, webp: 58, jpeg: 68 },
];

/**
 * focus: [x, y, zoom] — the part of the photo to keep (0 = left/top, 1 = right/bottom); zoom > 1
 * crops tighter. The left of the phone photo fades into navy, so the subject sits right of centre.
 * `phoneSource` overrides the photo for phones only. Commons URLs are pinned to the exact files
 * whose licences were checked on 19 Nov 2026.
 */
const PHOTOS = [
  {
    output: "airport-page-bfs",
    // Owner-supplied sunset photo (19 Nov 2026).
    source: { local: "design/airport-page-heroes/bfs-owner.jpg" },
    focus: { phone: [0.4, 0.5], tablet: [0.42, 0.5] },
  },
  {
    output: "airport-page-bhd",
    // Owner-supplied sunset photo (19 Nov 2026).
    source: { local: "design/airport-page-heroes/bhd-owner.jpg" },
    focus: { phone: [0.5, 0.42], tablet: [0.5, 0.45] },
  },
  {
    output: "airport-page-dub",
    // Owner-supplied sunset photo of Terminal 2 (19 Nov 2026).
    source: { local: "design/airport-page-heroes/dub-owner.jpg" },
    focus: { phone: [0.62, 0.5], tablet: [0.55, 0.5] },
  },
  {
    output: "airport-page-ldy",
    source: { commons: "https://upload.wikimedia.org/wikipedia/commons/3/3f/CODA.jpg", cacheName: "airport-page-ldy" },
    focus: { phone: [0.62, 0.48, 1.2], tablet: [0.5, 0.5] },
  },
];

async function sourceBuffer(source) {
  if (source.local) return sharp(join(root, source.local)).rotate().toBuffer();
  mkdirSync(cacheDir, { recursive: true });
  const cached = join(cacheDir, `${source.cacheName}.jpg`);
  if (!existsSync(cached)) {
    const response = await fetch(source.commons, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) throw new Error(`${source.cacheName}: ${response.status} ${source.commons}`);
    writeFileSync(cached, Buffer.from(await response.arrayBuffer()));
  }
  return sharp(cached).rotate().toBuffer();
}

/** Largest crop of the target shape around the focus point (tighter with zoom), then resize. */
async function crop(buffer, variant, [fx, fy, zoom = 1]) {
  const { width, height } = await sharp(buffer).metadata();
  const ratio = variant.width / variant.height;
  const cropW = Math.round(Math.min(width, height * ratio) / zoom);
  const cropH = Math.round(cropW / ratio);
  const left = Math.min(width - cropW, Math.max(0, Math.round(fx * width - cropW / 2)));
  const top = Math.min(height - cropH, Math.max(0, Math.round(fy * height - cropH / 2)));
  return sharp(buffer)
    .extract({ left, top, width: cropW, height: cropH })
    .resize({ width: variant.width, height: variant.height, fit: "fill", withoutEnlargement: false });
}

mkdirSync(outDir, { recursive: true });

for (const photo of PHOTOS) {
  for (const variant of VARIANTS) {
    const source = variant.name === "phone" && photo.phoneSource ? photo.phoneSource : photo.source;
    const pipeline = await crop(await sourceBuffer(source), variant, photo.focus[variant.name]);
    const base = join(outDir, `${photo.output}-${variant.name}`);
    await pipeline.clone().avif({ quality: variant.avif, effort: 6 }).toFile(`${base}.avif`);
    await pipeline.clone().webp({ quality: variant.webp }).toFile(`${base}.webp`);
    await pipeline.clone().jpeg({ quality: variant.jpeg, mozjpeg: true }).toFile(`${base}.jpg`);
    console.log(`Wrote ${photo.output}-${variant.name}.{avif,webp,jpg}`);
  }
}
