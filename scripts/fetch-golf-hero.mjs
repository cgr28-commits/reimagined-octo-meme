/**
 * Fetch the Royal Portrush hero photo from Wikimedia Commons and build the
 * responsive variants used by the golf transfers page.
 *
 * Photo: "Royal Portrush Golf Club 5th hole" by The Average Golfer, CC BY 3.0
 * https://commons.wikimedia.org/wiki/File:Royal_Portrush_Golf_Club_5th_hole.png
 * The page credits the author and licence under the hero.
 *
 * Run (CI): node scripts/fetch-golf-hero.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_URL =
  "https://upload.wikimedia.org/wikipedia/commons/9/9a/Royal_Portrush_Golf_Club_5th_hole.png";
const output = "royal-portrush";
const heroDir = join(root, "public/images/hero");
const outDir = join(heroDir, "optimized");
mkdirSync(outDir, { recursive: true });

const res = await fetch(SOURCE_URL, { headers: { "User-Agent": "myairporttaxini.co.uk image build (bookings@myairporttaxini.co.uk)" } });
if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
const input = Buffer.from(await res.arrayBuffer());

const sourceJpg = join(heroDir, `${output}.jpg`);
writeFileSync(sourceJpg, await sharp(input).jpeg({ quality: 88 }).toBuffer());

for (const width of [960, 1920]) {
  const pipeline = sharp(sourceJpg).resize({ width, withoutEnlargement: true, fit: "inside" });
  await pipeline.clone().avif({ quality: 55, effort: 4 }).toFile(join(outDir, `${output}-${width}.avif`));
  await pipeline.clone().webp({ quality: 72 }).toFile(join(outDir, `${output}-${width}.webp`));
  await pipeline.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(join(outDir, `${output}-${width}.jpg`));
}
console.log("Royal Portrush hero images written");
