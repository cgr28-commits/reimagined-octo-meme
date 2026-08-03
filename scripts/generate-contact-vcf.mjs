/**
 * Regenerate public/my-airport-taxi-ni.vcf with the brand logo as PHOTO.
 *
 * Usage: node scripts/generate-contact-vcf.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const photoPath = join(root, "public", "contact-photo.jpg");
const outPath = join(root, "public", "my-airport-taxi-ni.vcf");

const photo = readFileSync(photoPath);
const b64 = photo.toString("base64");

function foldLine(line) {
  const max = 75;
  if (Buffer.byteLength(line, "utf8") <= max) return [line];
  const out = [];
  let current = "";
  for (const ch of line) {
    const next = current + ch;
    if (Buffer.byteLength(next, "utf8") > max) {
      out.push(current);
      current = ` ${ch}`;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out;
}

const lines = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "FN:My Airport Taxi NI",
  "N:Taxi NI;My Airport;;;",
  "ORG:My Airport Taxi NI",
  "TITLE:Airport Transfers",
  "TEL;TYPE=VOICE,WORK:+442896022952",
  "TEL;TYPE=CELL,WHATSAPP:+447549815538",
  "EMAIL;TYPE=INTERNET,WORK:bookings@myairporttaxini.co.uk",
  "URL:https://www.myairporttaxini.co.uk",
  "X-SOCIALPROFILE;TYPE=whatsapp:https://wa.me/447549815538",
  "NOTE:WhatsApp @belfasttaxi · Premium airport transfers across Northern Ireland",
  `PHOTO;ENCODING=b;TYPE=JPEG:${b64}`,
  "END:VCARD",
];

const content = `${lines.flatMap(foldLine).join("\r\n")}\r\n`;
writeFileSync(outPath, content);
console.log(`Wrote ${outPath} (${content.length} bytes, photo ${photo.length} bytes)`);
