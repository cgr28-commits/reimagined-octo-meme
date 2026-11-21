/**
 * Design 3 heroes for Lisburn, Ballyclare, Antrim from full-res sources.
 * Newtownards / Dundonald / Comber stay blocked (248×139 preview crops only).
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public/images/hero/optimized");
const widths = [640, 960, 1280];

mkdirSync(outDir, { recursive: true });

/** @type {{ slug: string; base: string; source: string; position: string }[]} */
const towns = [
  {
    slug: "lisburn",
    base: "d3-concept-lisburn-linen-centre",
    // 1600×900 individual Design 3 concept (Market Square / Assembly Rooms)
    source: join(root, "public/preview-town-images/lisburn-linen-centre.jpg"),
    position: "right",
  },
  {
    slug: "ballyclare",
    base: "d3-concept-ballyclare-town-hall",
    // Real Wikimedia Town Hall (preview concept shows a different / incorrect building)
    source: join(root, "public/images/hero/ballyclare-town-hall.jpg"),
    position: "centre",
  },
  {
    slug: "antrim",
    base: "d3-concept-antrim-castle-gardens",
    // Full-res Deerpark Bridge (preview pack is 248×139 placeholder only)
    source: join(root, "public/images/hero/antrim-castle-gardens.jpg"),
    position: "centre",
  },
];

for (const town of towns) {
  const concept = join(root, "public/images/hero", `${town.base}.jpg`);
  const srcMeta = await sharp(town.source).metadata();
  console.log(town.slug, "source", `${srcMeta.width}x${srcMeta.height}`);

  if ((srcMeta.width || 0) < 960 || (srcMeta.height || 0) < 540) {
    throw new Error(`${town.slug}: source too small for production Design 3`);
  }

  await sharp(town.source)
    .rotate()
    .resize({ width: 1600, height: 900, fit: "cover", position: town.position })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(concept);

  const conceptMeta = await sharp(concept).metadata();
  console.log(town.slug, "concept", `${conceptMeta.width}x${conceptMeta.height}`);

  for (const width of widths) {
    const height = Math.round((width * 9) / 16);
    const pipeline = sharp(concept)
      .rotate()
      .resize({ width, height, fit: "cover", position: town.position, withoutEnlargement: true });
    await pipeline.clone().avif({ quality: 55, effort: 4 }).toFile(join(outDir, `${town.base}-${width}.avif`));
    await pipeline.clone().webp({ quality: 72 }).toFile(join(outDir, `${town.base}-${width}.webp`));
    await pipeline.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(join(outDir, `${town.base}-${width}.jpg`));
    const meta = await sharp(join(outDir, `${town.base}-${width}.webp`)).metadata();
    console.log("wrote", town.base, width, `${meta.width}x${meta.height}`);
  }
}

console.log("done — blocked: newtownards, dundonald, comber (248×139 only)");
