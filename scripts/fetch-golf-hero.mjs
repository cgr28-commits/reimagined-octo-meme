/**
 * Fetch the Royal Portrush hero photo (Unsplash) and build the
 * responsive variants used by the golf transfers page.
 *
 * Photo: Adam Montgomery on Unsplash (https://unsplash.com/photos/VkUgPt4AVWs),
 * Unsplash licence — free for commercial use.
 *
 * Run with sharp installed: node scripts/fetch-golf-hero.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Unsplash licence: free for commercial use, no permission needed (credit given anyway).
// Whiterocks beach and the Royal Portrush links — photo by Adam Montgomery on Unsplash.
const SOURCE_URL =
  "https://images.unsplash.com/photo-1642517482110-555ba0f10e0a?w=3997&q=90&fm=jpg";
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
