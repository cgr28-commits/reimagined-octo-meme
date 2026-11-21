/**
 * Design 3 compact town heroes from the approved AI town images.
 * Sources: public/images/hero/ai-town/*-ai-1600.jpg (1600x900, 16:9).
 * Output: AVIF/WebP/JPG at 640/960/1280 under public/images/hero/optimized/.
 * Downscale only: sources are never enlarged.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "public/images/hero/ai-town");
const outDir = join(root, "public/images/hero/optimized");
const widths = [640, 960, 1280];

const TOWNS = [
  { base: "d3-town-ai-lisburn-linen-centre", src: "lisburn-linen-centre-ai-1600.jpg" },
  { base: "d3-town-ai-ballyclare-town-hall", src: "ballyclare-town-hall-ai-1600.jpg" },
];

mkdirSync(outDir, { recursive: true });

for (const town of TOWNS) {
  const source = sharp(join(srcDir, town.src)).rotate();
  const meta = await source.metadata();
  if (meta.width < 1280) throw new Error(`${town.src} is narrower than 1280px; refusing to upscale`);
  for (const width of widths) {
    const height = Math.round((width * 9) / 16);
    const pipeline = sharp(join(srcDir, town.src))
      .rotate()
      .resize({ width, height, fit: "cover", position: "centre", withoutEnlargement: true });
    await pipeline.clone().avif({ quality: 55, effort: 4 }).toFile(join(outDir, `${town.base}-${width}.avif`));
    await pipeline.clone().webp({ quality: 72 }).toFile(join(outDir, `${town.base}-${width}.webp`));
    await pipeline.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(join(outDir, `${town.base}-${width}.jpg`));
    const out = await sharp(join(outDir, `${town.base}-${width}.webp`)).metadata();
    console.log("wrote", town.base, width, `${out.width}x${out.height}`);
  }
}
