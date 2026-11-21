/**
 * Design 3 compact town heroes: Lisburn, Ballyclare, Antrim.
 *
 * Source: full-resolution originals already tracked in public/images/hero/.
 * Each is cropped to 16:9 (the Design 3 hero uses background-size 100% 100%,
 * so a 4:3 file would be stretched) and only ever DOWNSCALED to 1280/960/640.
 * Output: AVIF/WebP/JPG under public/images/hero/optimized/.
 *
 * Newtownards, Dundonald and Comber have no genuine local photograph in the
 * repo and are intentionally not generated here (see MISSING_DESTINATION_HEROES).
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const heroDir = join(root, "public/images/hero");
const outDir = join(heroDir, "optimized");
const widths = [640, 960, 1280];

/**
 * focus: "centre" or a fraction 0..1 of the vertical slack to keep from the top
 * (0 = keep the top of the frame, 1 = keep the bottom).
 */
const TOWNS = [
  { base: "d3-town-lisburn-linen-centre", src: "lisburn-linen-centre.jpg", focus: 0.22 },
  { base: "d3-town-ballyclare-town-hall", src: "ballyclare-town-hall.jpg", focus: "centre" },
  { base: "d3-town-antrim-castle-gardens", src: "antrim-castle-gardens.jpg", focus: "centre" },
];

mkdirSync(outDir, { recursive: true });

for (const town of TOWNS) {
  const source = sharp(join(heroDir, town.src)).rotate();
  const meta = await source.metadata();
  const cropWidth = meta.width;
  const cropHeight = Math.round((cropWidth * 9) / 16);
  const slack = meta.height - cropHeight;
  const top =
    town.focus === "centre" ? Math.floor(slack / 2) : Math.round(slack * town.focus);

  const cropped = sharp(join(heroDir, town.src))
    .rotate()
    .extract({ left: 0, top, width: cropWidth, height: cropHeight });

  for (const width of widths) {
    const height = Math.round((width * 9) / 16);
    const pipeline = cropped
      .clone()
      .resize({ width, height, fit: "fill", withoutEnlargement: true });
    await pipeline.clone().avif({ quality: 55, effort: 4 }).toFile(join(outDir, `${town.base}-${width}.avif`));
    await pipeline.clone().webp({ quality: 72 }).toFile(join(outDir, `${town.base}-${width}.webp`));
    await pipeline.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(join(outDir, `${town.base}-${width}.jpg`));
    const out = await sharp(join(outDir, `${town.base}-${width}.webp`)).metadata();
    console.log("wrote", town.base, width, `${out.width}x${out.height}`, `top=${top}/${slack}`);
  }
}
