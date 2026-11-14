#!/usr/bin/env node
/**
 * Generates the static assets for the digital business card at /card:
 *   public/my-airport-taxi-ni-card.vcf  – Save to Contacts (business name, landline, website, card URL, logo)
 *   public/card-qr.png                  – 1024px QR for phones, NFC card artwork and stickers
 *   public/card-qr.svg                  – vector QR for print (scales to any size)
 *
 * Run: node scripts/generate-digital-card-assets.mjs
 * The logo PHOTO is copied from the existing contact vCard so both cards show the same branded image.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = (name) => join(root, "public", name);

export const CARD_URL = "https://www.myairporttaxini.co.uk/card";
const WEBSITE = "https://www.myairporttaxini.co.uk";
const NAME = "My Airport Taxi NI";
const LANDLINE_E164 = "+442896022952";
const EMAIL = "bookings@myairporttaxini.co.uk";

/** Fold a vCard content line at 75 octets (RFC 6350 §3.2 / RFC 2426). */
function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  let first = true;
  while (start < bytes.length) {
    const max = first ? 75 : 74;
    let end = Math.min(start + max, bytes.length);
    // never split a multi-byte UTF-8 character
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    out.push((first ? "" : " ") + bytes.subarray(start, end).toString("utf8"));
    start = end;
    first = false;
  }
  return out.join("\r\n");
}

function escapeText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Pull the folded PHOTO property (logo) out of the existing contact vCard. */
function existingPhotoBlock() {
  const source = readFileSync(pub("My-Airport-Taxi-NI.vcf"), "utf8").replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.startsWith("PHOTO"));
  if (start < 0) throw new Error("Existing vCard has no PHOTO");
  const block = [lines[start]];
  for (let i = start + 1; i < lines.length && lines[i].startsWith(" "); i += 1) block.push(lines[i]);
  return block.join("\r\n");
}

function buildVCard() {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "PRODID:-//My Airport Taxi NI//Digital Business Card//EN",
    `FN:${escapeText(NAME)}`,
    `N:;${escapeText(NAME)};;;`,
    `ORG:${escapeText(NAME)}`,
    "X-ABShowAs:COMPANY",
    `TITLE:${escapeText("Belfast & Dublin Airport Transfers")}`,
    `TEL;TYPE=WORK,VOICE:${LANDLINE_E164}`,
    `EMAIL;TYPE=INTERNET,WORK:${EMAIL}`,
    // Digital card first so it is the primary link on both iPhone and Android.
    `item1.URL;TYPE=WORK:${CARD_URL}`,
    "item1.X-ABLabel:Digital card",
    `item2.URL;TYPE=WORK:${WEBSITE}`,
    "item2.X-ABLabel:Website",
    `NOTE:${escapeText(
      `Belfast International, Belfast City & Dublin Airport transfers.\nInstant quotes & secure booking: ${CARD_URL}\nWhatsApp: @belfasttaxi`,
    )}`,
  ].map(fold);
  lines.push(existingPhotoBlock());
  lines.push("END:VCARD");
  return `${lines.join("\r\n")}\r\n`;
}

const QR_OPTIONS = {
  errorCorrectionLevel: "Q", // survives scuffs on stickers and printed cards
  margin: 4, // quiet zone required by the QR spec
  color: { dark: "#071c38", light: "#ffffff" }, // site navy on white — high contrast
};

async function main() {
  writeFileSync(pub("my-airport-taxi-ni-card.vcf"), buildVCard());
  await QRCode.toFile(pub("card-qr.png"), CARD_URL, { ...QR_OPTIONS, width: 1024, type: "png" });
  writeFileSync(pub("card-qr.svg"), await QRCode.toString(CARD_URL, { ...QR_OPTIONS, type: "svg" }));
  console.log("Digital card assets written: my-airport-taxi-ni-card.vcf, card-qr.png, card-qr.svg");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
