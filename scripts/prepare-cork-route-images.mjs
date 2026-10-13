import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
const sources = [
  { name: "belfast-big-fish", url: "https://upload.wikimedia.org/wikipedia/commons/8/8e/The_Big_Fish_-_Belfast_%2849528473747%29.jpg" },
  { name: "cork-cathedral-river", url: "https://upload.wikimedia.org/wikipedia/commons/5/5f/Cork_River_Lee_1.jpg" },
];
await mkdir("test-results/cork-landmarks/optimized", { recursive: true });
for (const source of sources) {
  const response = await fetch(source.url, { headers: { "User-Agent": "MyAirportTaxiNI-image-preparation/1.0 (https://www.myairporttaxini.co.uk/)" } });
  if (!response.ok) throw new Error(`${source.name}: source returned ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || metadata.width < 3000) throw new Error("Expected high-resolution original");
  await writeFile(`test-results/cork-landmarks/${source.name}-original.jpg`, buffer);
  for (const width of [960, 1920]) {
    const photo = sharp(buffer).rotate().resize({ width, withoutEnlargement: true });
    await photo.clone().avif({ quality: 65, effort: 4 }).toFile(`test-results/cork-landmarks/optimized/${source.name}-${width}.avif`);
    await photo.clone().webp({ quality: 85 }).toFile(`test-results/cork-landmarks/optimized/${source.name}-${width}.webp`);
    await photo.clone().jpeg({ quality: 90, mozjpeg: true }).toFile(`test-results/cork-landmarks/optimized/${source.name}-${width}.jpg`);
  }
  console.log(`${source.name}: ${metadata.width}×${metadata.height}, responsive AVIF/WebP/JPEG generated`);
}
