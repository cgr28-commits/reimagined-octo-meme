/**
 * High-contrast QR assets for the permanent NFC/QR headrest URL.
 * Run: node scripts/generate-tap-qr.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "tap");
const url = "https://www.myairporttaxini.co.uk/tap";

mkdirSync(outDir, { recursive: true });

const svg = await QRCode.toString(url, {
  type: "svg",
  errorCorrectionLevel: "H",
  margin: 4,
  color: { dark: "#000000", light: "#FFFFFF" },
});
writeFileSync(join(outDir, "qr.svg"), svg, "utf8");

const png = await QRCode.toBuffer(url, {
  type: "png",
  errorCorrectionLevel: "H",
  margin: 4,
  width: 1200,
  color: { dark: "#000000", light: "#FFFFFF" },
});
writeFileSync(join(outDir, "qr.png"), png);

const pngDataUri = `data:image/png;base64,${png.toString("base64")}`;
let logoDataUri = "";
try {
  const logo = readFileSync(join(root, "public", "logo-wide.svg"), "utf8");
  logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logo).toString("base64")}`;
} catch {
  logoDataUri = "";
}

const plate = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="150mm" height="100mm" viewBox="0 0 1500 1000" role="img"
  aria-label="My Airport Taxi NI headrest Tap and Scan plate">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#071C38"/>
      <stop offset="100%" stop-color="#090B10"/>
    </linearGradient>
  </defs>
  <rect width="1500" height="1000" fill="url(#bg)"/>
  <rect x="24" y="24" width="1452" height="952" rx="28" fill="none" stroke="#2FBF4A" stroke-opacity="0.35" stroke-width="4"/>
  ${
    logoDataUri
      ? `<image href="${logoDataUri}" x="80" y="70" width="720" height="126" preserveAspectRatio="xMinYMid meet"/>`
      : `<text x="80" y="140" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="700">My Airport Taxi NI</text>`
  }
  <text x="750" y="260" text-anchor="middle" fill="#2FBF4A" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="6">THANK YOU FOR TRAVELLING WITH US</text>
  <text x="750" y="310" text-anchor="middle" fill="#FFFFFF" fill-opacity="0.75" font-family="Arial, Helvetica, sans-serif" font-size="26">Tap the NFC badge or scan the QR code</text>
  <g transform="translate(280,620)">
    <circle r="170" fill="#FFFFFF" fill-opacity="0.06" stroke="#2FBF4A" stroke-width="6"/>
    <circle r="132" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="3"/>
    <circle r="78" fill="#2FBF4A"/>
    <path d="M-28 -8c18-18 46-18 64 0" fill="none" stroke="#071C38" stroke-width="10" stroke-linecap="round"/>
    <path d="M-42 -22c28-28 70-28 98 0" fill="none" stroke="#071C38" stroke-width="8" stroke-linecap="round"/>
    <path d="M-14 6c10-10 26-10 36 0" fill="none" stroke="#071C38" stroke-width="10" stroke-linecap="round"/>
    <text y="230" text-anchor="middle" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" letter-spacing="3">TAP HERE</text>
    <text y="272" text-anchor="middle" fill="#FFFFFF" fill-opacity="0.55" font-family="Arial, Helvetica, sans-serif" font-size="22">NFC · phone near badge</text>
  </g>
  <g transform="translate(1040,620)">
    <rect x="-210" y="-210" width="420" height="420" rx="24" fill="#FFFFFF"/>
    <image href="${pngDataUri}" x="-175" y="-175" width="350" height="350" preserveAspectRatio="xMidYMid meet"/>
    <text y="250" text-anchor="middle" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" letter-spacing="3">SCAN QR</text>
    <text y="292" text-anchor="middle" fill="#FFFFFF" fill-opacity="0.55" font-family="Arial, Helvetica, sans-serif" font-size="22">Camera · high contrast</text>
  </g>
  <text x="750" y="930" text-anchor="middle" fill="#FFFFFF" fill-opacity="0.55" font-family="Arial, Helvetica, sans-serif" font-size="24">www.myairporttaxini.co.uk/tap</text>
</svg>
`;
writeFileSync(join(outDir, "headrest-plate-150x100-print.svg"), plate, "utf8");

console.log(`Wrote ${join(outDir, "qr.svg")}`);
console.log(`Wrote ${join(outDir, "qr.png")} (1200px, ECC H, quiet zone 4)`);
console.log(`Wrote ${join(outDir, "headrest-plate-150x100-print.svg")}`);
console.log(`URL: ${url}`);
