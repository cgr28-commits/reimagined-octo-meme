/**
 * High-contrast QR assets + premium 150×100 mm headrest plate.
 * Run: node scripts/generate-tap-qr.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const require = createRequire(import.meta.url);
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

const logoMarkup = logoDataUri
  ? `<image href="${logoDataUri}" x="90" y="58" width="620" height="108" preserveAspectRatio="xMinYMid meet"/>`
  : `<text x="90" y="120" fill="#F5F7FA" font-family="Georgia, 'Times New Roman', serif" font-size="42" font-weight="700">My Airport Taxi NI</text>`;

/** Shared premium plate artwork (embedded assets for offline print). */
function buildPlate({ embedQrHref, embedLogoMarkup }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="150mm" height="100mm" viewBox="0 0 1500 1000" role="img"
  aria-label="My Airport Taxi NI headrest Tap and Scan plate">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0%" stop-color="#0B1220"/>
      <stop offset="42%" stop-color="#07101C"/>
      <stop offset="100%" stop-color="#050607"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="28%" r="62%">
      <stop offset="0%" stop-color="#0E2744" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="#07101C" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#050607" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="emeraldHairline" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2FBF4A" stop-opacity="0"/>
      <stop offset="50%" stop-color="#2FBF4A" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#2FBF4A" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="1500" height="1000" fill="url(#bg)"/>
  <rect width="1500" height="1000" fill="url(#glow)"/>

  <!-- Subtle premium double border -->
  <rect x="28" y="28" width="1444" height="944" rx="18" fill="none" stroke="#2FBF4A" stroke-opacity="0.22" stroke-width="2"/>
  <rect x="40" y="40" width="1420" height="920" rx="12" fill="none" stroke="#FFFFFF" stroke-opacity="0.08" stroke-width="1.5"/>

  ${embedLogoMarkup}

  <text x="750" y="232" text-anchor="middle" fill="#F4F6F8"
    font-family="Georgia, 'Times New Roman', Times, serif" font-size="58" font-weight="700"
    letter-spacing="4">ENJOYED YOUR JOURNEY?</text>

  <rect x="280" y="262" width="940" height="2" fill="url(#emeraldHairline)"/>

  <text x="750" y="312" text-anchor="middle" fill="#2FBF4A" fill-opacity="0.92"
    font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="600"
    letter-spacing="2.8">GOOGLE REVIEW • LEAVE A TIP • SAVE CONTACT • BOOK AGAIN</text>

  <!-- NFC tap area (left) — same centre as previous plate; chip mounts behind -->
  <g transform="translate(280,620)">
    <circle r="168" fill="#FFFFFF" fill-opacity="0.035" stroke="#2FBF4A" stroke-opacity="0.45" stroke-width="3.5"/>
    <circle r="128" fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="2"/>
    <circle r="74" fill="#1FA63A"/>
    <path d="M-26 -7c16-16 42-16 58 0" fill="none" stroke="#050607" stroke-width="9" stroke-linecap="round"/>
    <path d="M-40 -20c26-26 66-26 92 0" fill="none" stroke="#050607" stroke-width="7" stroke-linecap="round"/>
    <path d="M-13 6c9-9 24-9 33 0" fill="none" stroke="#050607" stroke-width="9" stroke-linecap="round"/>
    <text y="228" text-anchor="middle" fill="#F4F6F8"
      font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700"
      letter-spacing="4">TAP</text>
  </g>

  <!-- QR (right) — same centre; white quiet zone; QR ECC H + margin 4 -->
  <g transform="translate(1040,600)">
    <rect x="-210" y="-210" width="420" height="420" rx="16" fill="#FFFFFF"/>
    <image href="${embedQrHref}" x="-175" y="-175" width="350" height="350" preserveAspectRatio="xMidYMid meet"/>
    <text y="248" text-anchor="middle" fill="#F4F6F8"
      font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700"
      letter-spacing="4">SCAN</text>
  </g>

  <text x="750" y="938" text-anchor="middle" fill="#FFFFFF" fill-opacity="0.42"
    font-family="Arial, Helvetica, sans-serif" font-size="22" letter-spacing="1.5">www.myairporttaxini.co.uk/tap</text>
</svg>
`;
}

const printPlate = buildPlate({
  embedQrHref: pngDataUri,
  embedLogoMarkup: logoMarkup,
});
writeFileSync(join(outDir, "headrest-plate-150x100-print.svg"), printPlate, "utf8");

const editablePlate = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Printable headrest plate — 150 × 100 mm landscape.
  Print at 100% scale (no “fit to page”). Keep the quiet zone around the QR.
  Program the NFC chip with the same HTTPS URL as the QR: https://www.myairporttaxini.co.uk/tap
  Prefer headrest-plate-150x100-print.svg (embedded logo + QR) for offline print.
-->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="150mm" height="100mm" viewBox="0 0 1500 1000" role="img"
  aria-label="My Airport Taxi NI headrest Tap and Scan plate">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0%" stop-color="#0B1220"/>
      <stop offset="42%" stop-color="#07101C"/>
      <stop offset="100%" stop-color="#050607"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="28%" r="62%">
      <stop offset="0%" stop-color="#0E2744" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="#07101C" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#050607" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="emeraldHairline" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2FBF4A" stop-opacity="0"/>
      <stop offset="50%" stop-color="#2FBF4A" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#2FBF4A" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="1500" height="1000" fill="url(#bg)"/>
  <rect width="1500" height="1000" fill="url(#glow)"/>
  <rect x="28" y="28" width="1444" height="944" rx="18" fill="none" stroke="#2FBF4A" stroke-opacity="0.22" stroke-width="2"/>
  <rect x="40" y="40" width="1420" height="920" rx="12" fill="none" stroke="#FFFFFF" stroke-opacity="0.08" stroke-width="1.5"/>

  <image href="/logo-wide.svg" x="90" y="58" width="620" height="108" preserveAspectRatio="xMinYMid meet"/>

  <text x="750" y="232" text-anchor="middle" fill="#F4F6F8"
    font-family="Georgia, 'Times New Roman', Times, serif" font-size="58" font-weight="700"
    letter-spacing="4">ENJOYED YOUR JOURNEY?</text>
  <rect x="280" y="262" width="940" height="2" fill="url(#emeraldHairline)"/>
  <text x="750" y="312" text-anchor="middle" fill="#2FBF4A" fill-opacity="0.92"
    font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="600"
    letter-spacing="2.8">GOOGLE REVIEW • LEAVE A TIP • SAVE CONTACT • BOOK AGAIN</text>

  <g transform="translate(280,620)">
    <circle r="168" fill="#FFFFFF" fill-opacity="0.035" stroke="#2FBF4A" stroke-opacity="0.45" stroke-width="3.5"/>
    <circle r="128" fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="2"/>
    <circle r="74" fill="#1FA63A"/>
    <path d="M-26 -7c16-16 42-16 58 0" fill="none" stroke="#050607" stroke-width="9" stroke-linecap="round"/>
    <path d="M-40 -20c26-26 66-26 92 0" fill="none" stroke="#050607" stroke-width="7" stroke-linecap="round"/>
    <path d="M-13 6c9-9 24-9 33 0" fill="none" stroke="#050607" stroke-width="9" stroke-linecap="round"/>
    <text y="228" text-anchor="middle" fill="#F4F6F8"
      font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700"
      letter-spacing="4">TAP</text>
  </g>

  <g transform="translate(1040,600)">
    <rect x="-210" y="-210" width="420" height="420" rx="16" fill="#FFFFFF"/>
    <image href="qr.svg" x="-175" y="-175" width="350" height="350" preserveAspectRatio="xMidYMid meet"/>
    <text y="248" text-anchor="middle" fill="#F4F6F8"
      font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700"
      letter-spacing="4">SCAN</text>
  </g>

  <text x="750" y="938" text-anchor="middle" fill="#FFFFFF" fill-opacity="0.42"
    font-family="Arial, Helvetica, sans-serif" font-size="22" letter-spacing="1.5">www.myairporttaxini.co.uk/tap</text>
</svg>
`;
writeFileSync(join(outDir, "headrest-plate-150x100.svg"), editablePlate, "utf8");

// PNG preview at print aspect (1500×1000 ≈ 300 dpi for 150×100 mm)
try {
  const sharp = require("sharp");
  await sharp(Buffer.from(printPlate))
    .resize(1500, 1000, { fit: "fill" })
    .png()
    .toFile(join(outDir, "headrest-plate-150x100-preview.png"));
  console.log(`Wrote ${join(outDir, "headrest-plate-150x100-preview.png")}`);
} catch (err) {
  console.warn("PNG preview skipped:", err?.message || err);
}

console.log(`Wrote ${join(outDir, "qr.svg")}`);
console.log(`Wrote ${join(outDir, "qr.png")} (1200px, ECC H, quiet zone 4)`);
console.log(`Wrote ${join(outDir, "headrest-plate-150x100-print.svg")}`);
console.log(`Wrote ${join(outDir, "headrest-plate-150x100.svg")}`);
console.log(`URL: ${url}`);
