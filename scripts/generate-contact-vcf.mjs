/**
 * Regenerate public/my-airport-taxi-ni.vcf with an iOS-compatible logo PHOTO.
 *
 * Apple Contacts expects:
 * - vCard 3.0
 * - PHOTO;TYPE=JPEG;ENCODING=b: on its own line
 * - Base64 only on folded continuation lines (leading space, ≤75 octets)
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
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= max) return [line];

  const out = [];
  let start = 0;
  let first = true;
  while (start < bytes.length) {
    const budget = first ? max : max - 1;
    let end = Math.min(start + budget, bytes.length);
    while (end > start && (bytes[end] & 0xc0) === 0x80) end -= 1;
    if (end === start) end = Math.min(start + budget, bytes.length);
    const chunk = bytes.subarray(start, end).toString("utf8");
    out.push(first ? chunk : ` ${chunk}`);
    first = false;
    start = end;
  }
  return out;
}

function photoLines(base64) {
  const lines = ["PHOTO;TYPE=JPEG;ENCODING=b:"];
  const maxContent = 74;
  for (let i = 0; i < base64.length; i += maxContent) {
    lines.push(` ${base64.slice(i, i + maxContent)}`);
  }
  return lines;
}

const lines = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "PRODID:-//My Airport Taxi NI//Contact Card//EN",
  "FN:My Airport Taxi NI",
  "N:;My Airport Taxi NI;;;",
  "ORG:My Airport Taxi NI",
  "TITLE:Airport Transfers",
  ...photoLines(b64),
  "TEL;TYPE=WORK,VOICE:+442896022952",
  "TEL;TYPE=CELL,VOICE:+447549815538",
  "EMAIL;TYPE=INTERNET,WORK:bookings@myairporttaxini.co.uk",
  "URL:https://www.myairporttaxini.co.uk",
  "NOTE:WhatsApp @belfasttaxi. Premium airport transfers across Northern Ireland",
  "END:VCARD",
];

const assembled = [];
for (const line of lines) {
  if (line.startsWith("PHOTO") || line.startsWith(" ")) {
    assembled.push(line);
  } else {
    assembled.push(...foldLine(line));
  }
}

const content = `${assembled.join("\r\n")}\r\n`;
writeFileSync(outPath, content);
console.log(`Wrote ${outPath} (${content.length} bytes, photo ${photo.length} bytes)`);
