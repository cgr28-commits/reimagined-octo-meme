/** Design 3 Whiteabbey hero from supplied full-res PNG → 640/960/1280 AVIF/WebP/JPG */
import { mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const supplied =
  process.env.WHITEABBEY_SRC ||
  join(process.env.USERPROFILE || "", "Downloads", "Whiteabbey Sunset Over Belfast Lough.png");
const workingJpg = join(root, "public/images/hero/whiteabbey-hazelbank.jpg");
const concept = join(root, "public/images/hero/d3-concept-whiteabbey-hazelbank.jpg");
const outDir = join(root, "public/images/hero/optimized");
const base = "d3-concept-whiteabbey-hazelbank";
const widths = [640, 960, 1280];

mkdirSync(outDir, { recursive: true });

const srcMeta = await sharp(supplied).metadata();
console.log("source", `${srcMeta.width}x${srcMeta.height}`, srcMeta.format);

// Store a production JPG master (no upscale) for attributions / future use.
await sharp(supplied)
  .rotate()
  .jpeg({ quality: 90, mozjpeg: true })
  .toFile(workingJpg);

// Same working footprint as other Design 3 town concepts (1600×900).
await sharp(supplied)
  .rotate()
  .resize({ width: 1600, height: 900, fit: "cover", position: "centre" })
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(concept);

const conceptMeta = await sharp(concept).metadata();
console.log("concept", `${conceptMeta.width}x${conceptMeta.height}`);

for (const width of widths) {
  const height = Math.round((width * 9) / 16);
  const pipeline = sharp(concept)
    .rotate()
    .resize({ width, height, fit: "cover", position: "centre", withoutEnlargement: true });
  await pipeline.clone().avif({ quality: 55, effort: 4 }).toFile(join(outDir, `${base}-${width}.avif`));
  await pipeline.clone().webp({ quality: 72 }).toFile(join(outDir, `${base}-${width}.webp`));
  await pipeline.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(join(outDir, `${base}-${width}.jpg`));
  const meta = await sharp(join(outDir, `${base}-${width}.webp`)).metadata();
  console.log("wrote", base, width, `${meta.width}x${meta.height}`);
}
