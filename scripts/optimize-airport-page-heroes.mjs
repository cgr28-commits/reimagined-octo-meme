/**
 * Phone banner and tablet hero photographs for the four /airports/* guide pages
 * (Design 3, up to 1199px). Desktop keeps its existing images.
 * Run: node scripts/optimize-airport-page-heroes.mjs
 *
 * Third-party originals are fetched from Wikimedia Commons into a temp folder and are not
 * committed or published; only the cropped, resized outputs are. Credits live in
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

/** Phone banner (wide crop) and tablet hero (3:2). */
const VARIANTS = [
  { name: "phone", width: 800, height: 340, avif: 50, webp: 68, jpeg: 74 },
  { name: "tablet", width: 960, height: 640, avif: 40, webp: 58, jpeg: 68 },
];

/**
 * focusX / focusY: the part of the photo to keep when cropping (0 = left/top, 1 = right/bottom).
 * Commons URLs are pinned to the exact files whose licences were checked on 19 Nov 2026.
 */
const PHOTOS = [
  {
    output: "airport-page-bfs",
    commons: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0d/BFS_airport_terminal_%28Image_copyright_Andrew_McCarron%29.jpg/1920px-BFS_airport_terminal_%28Image_copyright_Andrew_McCarron%29.jpg",
    focus: { phone: [0.45, 0.5], tablet: [0.42, 0.5] },
  },
  {
    output: "airport-page-bhd",
    commons: "https://upload.wikimedia.org/wikipedia/commons/2/2e/Entrance_to_George_Best_Belfast_City_Airport_-_geograph.org.uk_-_3145806.jpg",
    focus: { phone: [0.62, 0.5], tablet: [0.62, 0.55] },
  },
  {
    output: "airport-page-dub",
    local: "public/images/hero/dublin.jpg",
    focus: { phone: [0.5, 0.45], tablet: [0.5, 0.5] },
  },
  {
    output: "airport-page-ldy",
    commons: "https://upload.wikimedia.org/wikipedia/commons/3/3f/CODA.jpg",
    focus: { phone: [0.5, 0.48], tablet: [0.5, 0.5] },
  },
];

async function sourceBuffer(photo) {
  if (photo.local) return sharp(join(root, photo.local)).rotate().toBuffer();
  mkdirSync(cacheDir, { recursive: true });
  const cached = join(cacheDir, `${photo.output}.jpg`);
  if (!existsSync(cached)) {
    const response = await fetch(photo.commons, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) throw new Error(`${photo.output}: ${response.status} ${photo.commons}`);
    writeFileSync(cached, Buffer.from(await response.arrayBuffer()));
  }
  return sharp(cached).rotate().toBuffer();
}

/** Largest crop of the target shape around the focus point, then resize. */
async function crop(buffer, variant, [fx, fy]) {
  const { width, height } = await sharp(buffer).metadata();
  const ratio = variant.width / variant.height;
  const cropW = Math.min(width, Math.round(height * ratio));
  const cropH = Math.min(height, Math.round(cropW / ratio));
  const left = Math.min(width - cropW, Math.max(0, Math.round(fx * width - cropW / 2)));
  const top = Math.min(height - cropH, Math.max(0, Math.round(fy * height - cropH / 2)));
  return sharp(buffer)
    .extract({ left, top, width: cropW, height: cropH })
    .resize({ width: variant.width, height: variant.height, fit: "fill", withoutEnlargement: false });
}

mkdirSync(outDir, { recursive: true });

for (const photo of PHOTOS) {
  const buffer = await sourceBuffer(photo);
  for (const variant of VARIANTS) {
    const pipeline = await crop(buffer, variant, photo.focus[variant.name]);
    const base = join(outDir, `${photo.output}-${variant.name}`);
    await pipeline.clone().avif({ quality: variant.avif, effort: 6 }).toFile(`${base}.avif`);
    await pipeline.clone().webp({ quality: variant.webp }).toFile(`${base}.webp`);
    await pipeline.clone().jpeg({ quality: variant.jpeg, mozjpeg: true }).toFile(`${base}.jpg`);
    console.log(`Wrote ${photo.output}-${variant.name}.{avif,webp,jpg}`);
  }
}
