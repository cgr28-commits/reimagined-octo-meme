// Local asset preparation only. No network requests or deployments.
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { statSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../public/images/dublin-premium");
for (const [asset, source, ratio] of [
  ["hero", "t2-exterior.jpg", 3],
  ["pickup", "t1-entrance.jpg", 1.5],
  ["interior", "interior.png", 1.5],
]) {
  for (const width of [640, 960, 1600]) {
    const input = sharp(join(root, "sources", source)).rotate().resize(width, Math.round(width / ratio), { fit: "cover" });
    for (const [ext, options] of [["jpg", { quality: 80, mozjpeg: true }], ["webp", { quality: 78 }], ["avif", { quality: 48, effort: 4 }]]) {
      const dest = join(root, `${asset}-${width}.${ext}`);
      await input.clone().toFormat(ext === "jpg" ? "jpeg" : ext, options).toFile(dest);
      console.log(`${asset}-${width}.${ext}: ${Math.round(statSync(dest).size / 1024)} KiB`);
    }
  }
}
for (const asset of ["car", "assistance"]) {
  const input = sharp(join(root, "sources", `${asset}.png`));
  const metadata = await input.metadata();
  if (!metadata.hasAlpha) throw new Error(`${asset} must have a genuine transparent alpha channel`);
  for (const width of [480, 960]) {
    await input.clone().resize({ width }).webp({ quality: 82, alphaQuality: 100 }).toFile(join(root, `${asset}-${width}.webp`));
  }
}
