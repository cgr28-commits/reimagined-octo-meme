/** Design 3 Holywood hero: 640/960/1280 AVIF/WebP/JPG from production holywood-old-pier.jpg */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "public/images/hero/holywood-old-pier.jpg");
const concept = join(root, "public/images/hero/d3-concept-holywood-old-pier.jpg");
const outDir = join(root, "public/images/hero/optimized");
const base = "d3-concept-holywood-old-pier";
const widths = [640, 960, 1280];

mkdirSync(outDir, { recursive: true });

// Same working footprint as bangor/carrick d3-concept sources (1600×900).
await sharp(src)
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
