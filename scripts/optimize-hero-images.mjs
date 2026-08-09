/**
 * Generate responsive AVIF/WebP/JPEG variants for hero photographs.
 * Run: node scripts/optimize-hero-images.mjs
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public/images/hero/optimized");
const widths = [960, 1920];

/** Source JPG basename (no extension) → output basename */
const sources = [
  "antrim-coast",
  "titanic-belfast",
  "dublin-beckett-bridge",
  "derry-guildhall",
];

mkdirSync(outDir, { recursive: true });

for (const name of sources) {
  const source = join(root, "public/images/hero", `${name}.jpg`);
  for (const width of widths) {
    const pipeline = sharp(source).rotate().resize({
      width,
      withoutEnlargement: true,
      fit: "inside",
    });

    await pipeline
      .clone()
      .avif({ quality: 55, effort: 4 })
      .toFile(join(outDir, `${name}-${width}.avif`));

    await pipeline
      .clone()
      .webp({ quality: 72 })
      .toFile(join(outDir, `${name}-${width}.webp`));

    await pipeline
      .clone()
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(join(outDir, `${name}-${width}.jpg`));

    console.log(`Wrote ${name}-${width}.{avif,webp,jpg}`);
  }
}

console.log("Hero image optimization complete.");
