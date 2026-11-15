/**
 * Business Class page photography: art-directed crops with one shared colour grade
 * (cool, deep-navy shadows, lowered saturation) so every photograph on /business-class/
 * reads as one set. Writes AVIF / WebP / JPEG at several widths.
 *
 * Run: node scripts/optimize-business-class-images.mjs
 *
 * Sources: owner-supplied photographs (design/business-class/originals/) and licensed
 * photographs already in public/images/hero/ (see
 * public/images/business-class/IMAGE-LICENSE.md and /photo-credits/). Adding a new
 * photograph: put the original in public/images/business-class/originals/, add it below,
 * record its licence in IMAGE-LICENSE.md and src/lib/business-class-page-content.ts.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public/images/business-class");

/** Deep navy used for the shadow tint (#040D1B). */
const NAVY = { r: 4, g: 13, b: 27 };

/**
 * output: file basename · source: path under public/ · crop: fractions of the source
 * (left, top, width, height) · widths: responsive sizes to write.
 */
const jobs = [
  // Owner-supplied photographs (15 Nov 2026), originals in design/business-class/originals/.
  // Already warm/navy toned, so they get the light grade only.
  {
    output: "business-class-airport-arrival-twilight",
    source: "../design/business-class/originals/business-class-airport-arrival-twilight.png",
    crop: { left: 0, top: 0, width: 1, height: 1 },
    widths: [960, 1280, 1672],
    grade: "light",
  },
  {
    output: "business-class-airport-arrival-twilight-portrait",
    source: "../design/business-class/originals/business-class-airport-arrival-twilight.png",
    crop: { left: 0.105, top: 0, width: 0.45, height: 1 },
    widths: [640, 752],
    grade: "light",
  },
  {
    output: "business-class-executive-interior",
    source: "../design/business-class/originals/business-class-executive-interior.png",
    crop: { left: 0, top: 0, width: 1, height: 1 },
    widths: [800, 1122],
    grade: "light",
  },
  {
    output: "business-class-hotel-arrival-evening",
    source: "../design/business-class/originals/business-class-hotel-arrival-evening.png",
    crop: { left: 0.5, top: 0, width: 0.45, height: 1 },
    widths: [640, 752],
    grade: "light",
  },
  {
    output: "business-class-belfast-titanic-quarter-hero",
    source: "images/hero/titanic-belfast.jpg",
    crop: { left: 0, top: 0.2, width: 1, height: 0.5625 * (3648 / 2736) },
    widths: [1280, 1920, 2560],
  },
];

mkdirSync(outDir, { recursive: true });

async function gradeLight(input) {
  return sharp(input).modulate({ saturation: 0.94 }).toBuffer();
}

async function grade(input) {
  // Lower brightness/saturation slightly, cool the white balance, then lay a
  // navy multiply over the image so shadows sit in the brand colour.
  const base = sharp(input).modulate({ brightness: 0.86, saturation: 0.72 }).linear([0.96, 0.99, 1.04], [0, 0, 4]);
  const { width, height } = await sharp(await base.clone().toBuffer()).metadata();
  const overlay = await sharp({
    create: { width, height, channels: 4, background: { ...NAVY, alpha: 0.28 } },
  })
    .png()
    .toBuffer();
  return base.composite([{ input: overlay, blend: "multiply" }]).toBuffer();
}

for (const job of jobs) {
  const src = join(root, "public", job.source);
  const meta = await sharp(src).rotate().metadata();
  const W = meta.width;
  const H = meta.height;
  const left = Math.round(job.crop.left * W);
  const top = Math.round(job.crop.top * H);
  const width = Math.min(W - left, Math.round(job.crop.width * W));
  const height = Math.min(H - top, Math.round(job.crop.height * H));
  const cropped = await sharp(src).rotate().extract({ left, top, width, height }).toBuffer();
  const graded = job.grade === "light" ? await gradeLight(cropped) : await grade(cropped);
  for (const w of job.widths) {
    const p = sharp(graded).resize({ width: w, withoutEnlargement: true });
    await p.clone().avif({ quality: 52, effort: 5 }).toFile(join(outDir, `${job.output}-${w}.avif`));
    await p.clone().webp({ quality: 74 }).toFile(join(outDir, `${job.output}-${w}.webp`));
    await p.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(join(outDir, `${job.output}-${w}.jpg`));
  }
  console.log(`Wrote ${job.output} (${width}×${height} crop) at ${job.widths.join(", ")}px`);
}
