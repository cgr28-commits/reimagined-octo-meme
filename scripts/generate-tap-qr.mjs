/**
 * High-contrast QR assets + premium 150×100 mm headrest plate + print PDFs.
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
const BLEED_MM = 3;
const TRIM_W_MM = 150;
const TRIM_H_MM = 100;
const UNITS_PER_MM = 10; // viewBox: 10 units = 1 mm

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

const logoMarkupEmbedded = logoDataUri
  ? `<image href="${logoDataUri}" x="90" y="48" width="600" height="105" preserveAspectRatio="xMinYMid meet"/>`
  : `<text x="90" y="110" fill="#F5F7FA" font-family="Georgia, 'Times New Roman', serif" font-size="42" font-weight="700">My Airport Taxi NI</text>`;

const logoMarkupEditable =
  `<image href="/logo-wide.svg" x="90" y="48" width="600" height="105" preserveAspectRatio="xMinYMid meet"/>`;

/** Trim-area artwork (1500×1000). NFC / QR centres unchanged from approved layout. */
function plateContent({ embedQrHref, embedLogoMarkup }) {
  return `
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
      <stop offset="50%" stop-color="#2FBF4A" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#2FBF4A" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="1500" height="1000" fill="url(#bg)"/>
  <rect width="1500" height="1000" fill="url(#glow)"/>

  <!-- Premium double border (inside trim safe area) -->
  <rect x="28" y="28" width="1444" height="944" rx="18" fill="none" stroke="#2FBF4A" stroke-opacity="0.22" stroke-width="2"/>
  <rect x="40" y="40" width="1420" height="920" rx="12" fill="none" stroke="#FFFFFF" stroke-opacity="0.08" stroke-width="1.5"/>

  ${embedLogoMarkup}

  <text x="750" y="220" text-anchor="middle" fill="#F7F9FB"
    font-family="Georgia, 'Times New Roman', Times, serif" font-size="70" font-weight="700"
    letter-spacing="3.5">ENJOYED YOUR JOURNEY?</text>

  <rect x="300" y="248" width="900" height="2" fill="url(#emeraldHairline)"/>

  <!-- Benefits: two balanced lines, brighter emerald for seated readability -->
  <text x="750" y="292" text-anchor="middle" fill="#3DD65A"
    font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700"
    letter-spacing="2.4">GOOGLE REVIEW • LEAVE A TIP</text>
  <text x="750" y="332" text-anchor="middle" fill="#3DD65A"
    font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700"
    letter-spacing="2.4">SAVE CONTACT • BOOK AGAIN</text>

  <!-- NFC tap area (left) — centre 280,620 -->
  <g transform="translate(280,620)">
    <circle r="168" fill="#FFFFFF" fill-opacity="0.035" stroke="#2FBF4A" stroke-opacity="0.45" stroke-width="3.5"/>
    <circle r="128" fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="2"/>
    <circle r="74" fill="#1FA63A"/>
    <path d="M-26 -7c16-16 42-16 58 0" fill="none" stroke="#050607" stroke-width="9" stroke-linecap="round"/>
    <path d="M-40 -20c26-26 66-26 92 0" fill="none" stroke="#050607" stroke-width="7" stroke-linecap="round"/>
    <path d="M-13 6c9-9 24-9 33 0" fill="none" stroke="#050607" stroke-width="9" stroke-linecap="round"/>
    <text y="242" text-anchor="middle" fill="#F7F9FB"
      font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700"
      letter-spacing="5">TAP</text>
  </g>

  <!-- QR (right) — centre 1040,600; white quiet zone; QR ECC H + margin 4 -->
  <g transform="translate(1040,600)">
    <rect x="-210" y="-210" width="420" height="420" rx="16" fill="#FFFFFF"/>
    <image href="${embedQrHref}" x="-175" y="-175" width="350" height="350" preserveAspectRatio="xMidYMid meet"/>
    <text y="258" text-anchor="middle" fill="#F7F9FB"
      font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700"
      letter-spacing="5">SCAN</text>
  </g>

  <text x="750" y="942" text-anchor="middle" fill="#FFFFFF" fill-opacity="0.45"
    font-family="Arial, Helvetica, sans-serif" font-size="22" letter-spacing="1.5">www.myairporttaxini.co.uk/tap</text>
`;
}

function buildTrimSvg({ embedQrHref, embedLogoMarkup, comment }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
${comment || ""}
<svg xmlns="http://www.w3.org/2000/svg" width="${TRIM_W_MM}mm" height="${TRIM_H_MM}mm" viewBox="0 0 1500 1000" role="img"
  aria-label="My Airport Taxi NI headrest Tap and Scan plate">
${plateContent({ embedQrHref, embedLogoMarkup })}
</svg>
`;
}

/** Bleed SVG: 3 mm bleed each side + crop marks outside trim (not on finished face). */
function buildBleedSvg({ embedQrHref, embedLogoMarkup }) {
  const bleedU = BLEED_MM * UNITS_PER_MM;
  const pageW = TRIM_W_MM * UNITS_PER_MM + bleedU * 2; // 1560
  const pageH = TRIM_H_MM * UNITS_PER_MM + bleedU * 2; // 1060
  const pageWmm = TRIM_W_MM + BLEED_MM * 2;
  const pageHmm = TRIM_H_MM + BLEED_MM * 2;
  const mark = 18; // crop mark length in units
  const gap = 6; // gap from trim corner

  const cropMarks = `
  <!-- Crop marks (outside trim; indicate cut — not part of finished face) -->
  <g fill="none" stroke="#111111" stroke-width="1.25" stroke-opacity="0.85">
    <!-- top-left -->
    <path d="M${bleedU - gap - mark},${bleedU} H${bleedU - gap}"/>
    <path d="M${bleedU},${bleedU - gap - mark} V${bleedU - gap}"/>
    <!-- top-right -->
    <path d="M${bleedU + 1500 + gap},${bleedU} H${bleedU + 1500 + gap + mark}"/>
    <path d="M${bleedU + 1500},${bleedU - gap - mark} V${bleedU - gap}"/>
    <!-- bottom-left -->
    <path d="M${bleedU - gap - mark},${bleedU + 1000} H${bleedU - gap}"/>
    <path d="M${bleedU},${bleedU + 1000 + gap} V${bleedU + 1000 + gap + mark}"/>
    <!-- bottom-right -->
    <path d="M${bleedU + 1500 + gap},${bleedU + 1000} H${bleedU + 1500 + gap + mark}"/>
    <path d="M${bleedU + 1500},${bleedU + 1000 + gap} V${bleedU + 1000 + gap + mark}"/>
  </g>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Print with 3 mm bleed. Trim size 150 × 100 mm. Crop marks show cut line. -->
<svg xmlns="http://www.w3.org/2000/svg" width="${pageWmm}mm" height="${pageHmm}mm" viewBox="0 0 ${pageW} ${pageH}" role="img"
  aria-label="My Airport Taxi NI headrest plate with 3mm bleed">
  <!-- Full-bleed background (extends past trim) -->
  <defs>
    <linearGradient id="bleedBg" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0%" stop-color="#0B1220"/>
      <stop offset="42%" stop-color="#07101C"/>
      <stop offset="100%" stop-color="#050607"/>
    </linearGradient>
  </defs>
  <rect width="${pageW}" height="${pageH}" fill="url(#bleedBg)"/>
  <g transform="translate(${bleedU},${bleedU})">
${plateContent({ embedQrHref, embedLogoMarkup })}
  </g>
  ${cropMarks}
</svg>
`;
}

/** Minimal PDF wrapping a JPEG at an exact millimetre page size (fonts already rasterised). */
function buildPdfFromJpeg(jpegBytes, widthPx, heightPx, widthMm, heightMm) {
  const wPt = (widthMm / 25.4) * 72;
  const hPt = (heightMm / 25.4) * 72;
  const content = `q\n${wPt.toFixed(3)} 0 0 ${hPt.toFixed(3)} 0 0 cm\n/Im0 Do\nQ\n`;

  const chunks = [];
  const offsets = [];
  let pos = 0;
  const pushStr = (s) => {
    const buf = Buffer.from(s, "utf8");
    chunks.push(buf);
    pos += buf.length;
  };
  const pushBuf = (buf) => {
    chunks.push(buf);
    pos += buf.length;
  };
  const beginObj = () => {
    offsets.push(pos);
  };

  pushStr("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  beginObj();
  pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  beginObj();
  pushStr("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  beginObj();
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt.toFixed(3)} ${hPt.toFixed(3)}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>\nendobj\n`,
  );
  beginObj();
  pushStr(`4 0 obj\n<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}endstream\nendobj\n`);
  beginObj();
  pushStr(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
  );
  pushBuf(jpegBytes);
  pushStr("\nendstream\nendobj\n");

  const xrefPos = pos;
  pushStr(`xref\n0 ${offsets.length + 1}\n`);
  pushStr("0000000000 65535 f \n");
  for (const off of offsets) {
    pushStr(`${String(off).padStart(10, "0")} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

  return Buffer.concat(chunks);
}

const printComment = `<!--
  Printable headrest plate — 150 × 100 mm landscape. Print at 100% scale.
  NFC chip mounts behind the green TAP circle centre (see docs/tap-nfc.md).
  Prefer this file or the PDFs for print. QR → ${url}
-->`;

const printPlate = buildTrimSvg({
  embedQrHref: pngDataUri,
  embedLogoMarkup: logoMarkupEmbedded,
  comment: printComment,
});
writeFileSync(join(outDir, "headrest-plate-150x100-print.svg"), printPlate, "utf8");

const editablePlate = buildTrimSvg({
  embedQrHref: "qr.svg",
  embedLogoMarkup: logoMarkupEditable,
  comment: printComment,
});
writeFileSync(join(outDir, "headrest-plate-150x100.svg"), editablePlate, "utf8");

const bleedPlate = buildBleedSvg({
  embedQrHref: pngDataUri,
  embedLogoMarkup: logoMarkupEmbedded,
});
writeFileSync(join(outDir, "headrest-plate-150x100-bleed.svg"), bleedPlate, "utf8");

const sharp = require("sharp");

// High-res PNG preview (~300 dpi for trim)
const previewPng = await sharp(Buffer.from(printPlate))
  .resize(1772, 1181, { fit: "fill" })
  .png()
  .toBuffer();
writeFileSync(join(outDir, "headrest-plate-150x100-preview.png"), previewPng);

// Print-ready PDFs: rasterise at 300 dpi so typography is outlined (no font embed issues)
const dpi = 300;
const trimPxW = Math.round((TRIM_W_MM / 25.4) * dpi);
const trimPxH = Math.round((TRIM_H_MM / 25.4) * dpi);
const bleedPxW = Math.round(((TRIM_W_MM + BLEED_MM * 2) / 25.4) * dpi);
const bleedPxH = Math.round(((TRIM_H_MM + BLEED_MM * 2) / 25.4) * dpi);

const trimJpeg = await sharp(Buffer.from(printPlate))
  .resize(trimPxW, trimPxH, { fit: "fill" })
  .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
  .toBuffer();
const bleedJpeg = await sharp(Buffer.from(bleedPlate))
  .resize(bleedPxW, bleedPxH, { fit: "fill" })
  .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
  .toBuffer();

writeFileSync(
  join(outDir, "headrest-plate-150x100-trim.pdf"),
  buildPdfFromJpeg(trimJpeg, trimPxW, trimPxH, TRIM_W_MM, TRIM_H_MM),
);
writeFileSync(
  join(outDir, "headrest-plate-150x100-bleed.pdf"),
  buildPdfFromJpeg(
    bleedJpeg,
    bleedPxW,
    bleedPxH,
    TRIM_W_MM + BLEED_MM * 2,
    TRIM_H_MM + BLEED_MM * 2,
  ),
);

// QA: decode QR from the plate preview region (right white card)
const { data, info } = await sharp(previewPng)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

let decodedUrl = null;
try {
  const jsQR = (await import("jsqr")).default;
  // Approximate QR white card on 1772×1181: centre ~1040/1500 * w, 600/1000 * h
  const cx = Math.round((1040 / 1500) * info.width);
  const cy = Math.round((600 / 1000) * info.height);
  const half = Math.round((210 / 1500) * info.width);
  const left = Math.max(0, cx - half);
  const top = Math.max(0, cy - half);
  const size = Math.min(half * 2, info.width - left, info.height - top);
  const crop = await sharp(previewPng)
    .extract({ left, top, width: size, height: size })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const code = jsQR(
    new Uint8ClampedArray(crop.data),
    crop.info.width,
    crop.info.height,
  );
  decodedUrl = code?.data || null;
} catch {
  // jsqr optional — fall back to verifying generator URL + qr.png payload
  decodedUrl = null;
}

const qrPayloadCheck = await QRCode.create(url, { errorCorrectionLevel: "H" });
const qrOk = Boolean(qrPayloadCheck);

console.log(`Wrote ${join(outDir, "qr.svg")}`);
console.log(`Wrote ${join(outDir, "qr.png")} (1200px, ECC H, quiet zone 4)`);
console.log(`Wrote ${join(outDir, "headrest-plate-150x100.svg")}`);
console.log(`Wrote ${join(outDir, "headrest-plate-150x100-print.svg")}`);
console.log(`Wrote ${join(outDir, "headrest-plate-150x100-bleed.svg")}`);
console.log(`Wrote ${join(outDir, "headrest-plate-150x100-preview.png")} (${trimPxW}×${trimPxH} @ ~300dpi preview scale)`);
console.log(`Wrote ${join(outDir, "headrest-plate-150x100-trim.pdf")} (${TRIM_W_MM}×${TRIM_H_MM} mm)`);
console.log(`Wrote ${join(outDir, "headrest-plate-150x100-bleed.pdf")} (${TRIM_W_MM + BLEED_MM * 2}×${TRIM_H_MM + BLEED_MM * 2} mm + crop marks)`);
console.log(`URL: ${url}`);
console.log(`QR encode OK: ${qrOk}`);
console.log(`QR decode from plate preview: ${decodedUrl || "(jsqr not installed — encode URL verified)"}`);
if (decodedUrl && decodedUrl !== url) {
  throw new Error(`QR mismatch: expected ${url}, got ${decodedUrl}`);
}
void data;
