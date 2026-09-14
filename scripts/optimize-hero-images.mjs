/**
 * Generate responsive AVIF/WebP/JPEG variants for hero photographs.
 * Run: node scripts/optimize-hero-images.mjs
 *
 * Airport pages read optimized/{heroBase}-{width}.* from AIRPORT_HERO in
 * src/lib/airport-hero.ts. Keep this source→output list in sync with that file.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public/images/hero/optimized");
const widths = [960, 1920];

/** Source JPG basename (under public/images/hero/) → optimized output basename */
const sources = [
  { source: "antrim-coast", output: "antrim-coast" },
  { source: "titanic-belfast", output: "titanic-belfast" },
  { source: "dublin-beckett-bridge", output: "dublin-beckett-bridge" },
  { source: "derry-guildhall", output: "derry-guildhall" },
  { source: "belfast-international-arrivals-2025", output: "belfast-international" },
  { source: "belfast-city", output: "belfast-city" },
  { source: "dublin", output: "dublin-airport" },
  { source: "derry-airport", output: "derry-airport" },
];

mkdirSync(outDir, { recursive: true });

for (const { source, output } of sources) {
  const sourceFile = join(root, "public/images/hero", `${source}.jpg`);
  for (const width of widths) {
    const pipeline = sharp(sourceFile).rotate().resize({
      width,
      withoutEnlargement: true,
      fit: "inside",
    });

    await pipeline
      .clone()
      .avif({ quality: 55, effort: 4 })
      .toFile(join(outDir, `${output}-${width}.avif`));

    await pipeline
      .clone()
      .webp({ quality: 72 })
      .toFile(join(outDir, `${output}-${width}.webp`));

    await pipeline
      .clone()
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(join(outDir, `${output}-${width}.jpg`));

    console.log(`Wrote ${output}-${width}.{avif,webp,jpg}`);
  }
}

console.log("Hero image optimization complete.");
