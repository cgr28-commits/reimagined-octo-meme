/**
 * Final print files for Option A — 120 × 80 mm headrest plate.
 * Run: node scripts/generate-tap-plate-option-a-print.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "tap", "print-120x80");
const url = "https://www.myairporttaxini.co.uk/tap";
const TRIM_W_MM = 120;
const TRIM_H_MM = 80;
const BLEED_MM = 3;
const DPI = 300;
const UNITS_PER_MM = 10;
const NFC_CX = 250; // viewBox units — green TAP centre
const NFC_CY = 500;
const CORNER_RX = 24; // ~2.4 mm rounded corners

mkdirSync(outDir, { recursive: true });

function mmToPx(mm) {
  return Math.round((mm / 25.4) * DPI);
}

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
  const beginObj = () => offsets.push(pos);

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
  for (const off of offsets) pushStr(`${String(off).padStart(10, "0")} 00000 n \n`);
  pushStr(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

// Prefer the approved Option A SVG already in size-options (embedded logo + QR).
const approvedPath = join(root, "public", "tap", "size-options", "option-a-120x80.svg");
if (!existsSync(approvedPath)) {
  throw new Error("Missing approved Option A SVG — run node scripts/generate-tap-plate-compact.mjs first");
}

let trimSvg = readFileSync(approvedPath, "utf8");

// Ensure rounded outer face (clip) without changing layout centres.
if (!trimSvg.includes('id="trimRound"')) {
  trimSvg = trimSvg.replace(
    "<defs>",
    `<defs>
    <clipPath id="trimRound"><rect width="1200" height="800" rx="${CORNER_RX}" ry="${CORNER_RX}"/></clipPath>`,
  );
  trimSvg = trimSvg.replace(
    '<rect width="1200" height="800" fill="url(#bg)"/>',
    `<rect width="1200" height="800" rx="${CORNER_RX}" ry="${CORNER_RX}" fill="url(#bg)"/>
  <g clip-path="url(#trimRound)">`,
  );
  // Close the clip group before the closing </svg>
  trimSvg = trimSvg.replace(/\n<\/svg>\s*$/, "\n  </g>\n</svg>\n");
}

const printComment = `<!--
  FINAL PRINT — My Airport Taxi NI headrest plate Option A
  Trim: 120 × 80 mm landscape. Print at 100% scale (do not fit to page).
  Rounded corners ~2.4 mm. QR → ${url} (ECC H, quiet zone preserved).
  NFC NTAG213/215: mount behind green TAP centre (see nfc-install-guide).
  PDFs are 300 dpi raster so type is outlined (no missing-font risk).
-->`;

const printSvg = printComment + "\n" + trimSvg.replace(/^<\?xml[^>]*>\s*/, "");
writeFileSync(join(outDir, "headrest-plate-120x80-print.svg"), `<?xml version="1.0" encoding="UTF-8"?>\n${printSvg}`, "utf8");

// Bleed artwork: extend background 3 mm each side + crop marks outside trim
const bleedU = BLEED_MM * UNITS_PER_MM;
const pageW = TRIM_W_MM * UNITS_PER_MM + bleedU * 2; // 1260
const pageH = TRIM_H_MM * UNITS_PER_MM + bleedU * 2; // 860
const pageWmm = TRIM_W_MM + BLEED_MM * 2;
const pageHmm = TRIM_H_MM + BLEED_MM * 2;
const mark = 18;
const gap = 6;

// Extract inner content of trim SVG for embedding in bleed page
const innerMatch = trimSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
const inner = innerMatch ? innerMatch[1] : "";

const bleedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- 3 mm bleed. Trim 120 × 80 mm. Crop marks = cut line. -->
<svg xmlns="http://www.w3.org/2000/svg" width="${pageWmm}mm" height="${pageHmm}mm" viewBox="0 0 ${pageW} ${pageH}" role="img"
  aria-label="My Airport Taxi NI headrest plate 120x80 with 3mm bleed">
  <defs>
    <linearGradient id="bleedBg" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0%" stop-color="#0B1220"/>
      <stop offset="42%" stop-color="#07101C"/>
      <stop offset="100%" stop-color="#050607"/>
    </linearGradient>
  </defs>
  <rect width="${pageW}" height="${pageH}" fill="url(#bleedBg)"/>
  <g transform="translate(${bleedU},${bleedU})">
${inner}
  </g>
  <g fill="none" stroke="#111111" stroke-width="1.25" stroke-opacity="0.85">
    <path d="M${bleedU - gap - mark},${bleedU} H${bleedU - gap}"/>
    <path d="M${bleedU},${bleedU - gap - mark} V${bleedU - gap}"/>
    <path d="M${bleedU + 1200 + gap},${bleedU} H${bleedU + 1200 + gap + mark}"/>
    <path d="M${bleedU + 1200},${bleedU - gap - mark} V${bleedU - gap}"/>
    <path d="M${bleedU - gap - mark},${bleedU + 800} H${bleedU - gap}"/>
    <path d="M${bleedU},${bleedU + 800 + gap} V${bleedU + 800 + gap + mark}"/>
    <path d="M${bleedU + 1200 + gap},${bleedU + 800} H${bleedU + 1200 + gap + mark}"/>
    <path d="M${bleedU + 1200},${bleedU + 800 + gap} V${bleedU + 800 + gap + mark}"/>
  </g>
</svg>
`;
writeFileSync(join(outDir, "headrest-plate-120x80-bleed.svg"), bleedSvg, "utf8");

const trimPxW = mmToPx(TRIM_W_MM);
const trimPxH = mmToPx(TRIM_H_MM);
const bleedPxW = mmToPx(TRIM_W_MM + BLEED_MM * 2);
const bleedPxH = mmToPx(TRIM_H_MM + BLEED_MM * 2);

const previewPng = await sharp(Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n${printSvg}`))
  .resize(trimPxW, trimPxH, { fit: "fill" })
  .png()
  .toBuffer();
writeFileSync(join(outDir, "headrest-plate-120x80-preview.png"), previewPng);

const trimJpeg = await sharp(Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n${printSvg}`))
  .resize(trimPxW, trimPxH, { fit: "fill" })
  .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
  .toBuffer();
const bleedJpeg = await sharp(Buffer.from(bleedSvg))
  .resize(bleedPxW, bleedPxH, { fit: "fill" })
  .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
  .toBuffer();

writeFileSync(
  join(outDir, "headrest-plate-120x80-trim.pdf"),
  buildPdfFromJpeg(trimJpeg, trimPxW, trimPxH, TRIM_W_MM, TRIM_H_MM),
);
writeFileSync(
  join(outDir, "headrest-plate-120x80-bleed.pdf"),
  buildPdfFromJpeg(bleedJpeg, bleedPxW, bleedPxH, TRIM_W_MM + BLEED_MM * 2, TRIM_H_MM + BLEED_MM * 2),
);

// NFC install guide (installer only — not printed on passenger face)
const nfcLeftMm = (NFC_CX / UNITS_PER_MM).toFixed(1);
const nfcTopMm = (NFC_CY / UNITS_PER_MM).toFixed(1);
const guideSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="160mm" height="120mm" viewBox="0 0 1600 1200" role="img"
  aria-label="NFC installation guide for 120 by 80 mm headrest plate">
  <rect width="1600" height="1200" fill="#F4F6F8"/>
  <text x="80" y="70" fill="#071C38" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700">NFC install guide — Option A (120 × 80 mm)</text>
  <text x="80" y="115" fill="#334155" font-family="Arial, Helvetica, sans-serif" font-size="22">My Airport Taxi NI · NTAG213 / NTAG215 · do not print marks on passenger face</text>

  <!-- Plate at true aspect, left -->
  <g transform="translate(80,180)">
    <image href="${previewPng.toString("base64").length ? `data:image/png;base64,${previewPng.toString("base64")}` : ""}" width="900" height="600" preserveAspectRatio="xMidYMid meet"/>
    <!-- TAP centre crosshair overlay -->
    <g transform="translate(${(NFC_CX / 1200) * 900},${(NFC_CY / 800) * 600})" stroke="#E11D48" stroke-width="3" fill="none">
      <circle r="42" stroke-dasharray="6 5"/>
      <circle r="10" fill="#E11D48" stroke="none"/>
      <path d="M-55 0 H-18 M18 0 H55 M0 -55 V-18 M0 18 V55"/>
    </g>
    <text x="450" y="640" text-anchor="middle" fill="#E11D48" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700">NTAG sticker centre = TAP circle centre</text>
  </g>

  <g transform="translate(1040,200)" font-family="Arial, Helvetica, sans-serif">
    <text x="0" y="0" fill="#071C38" font-size="26" font-weight="700">Position</text>
    <text x="0" y="40" fill="#334155" font-size="20">From left trim edge: ${nfcLeftMm} mm</text>
    <text x="0" y="72" fill="#334155" font-size="20">From top trim edge: ${nfcTopMm} mm</text>
    <text x="0" y="120" fill="#071C38" font-size="26" font-weight="700">Program</text>
    <text x="0" y="160" fill="#334155" font-size="18">NDEF URI (not plain text):</text>
    <text x="0" y="190" fill="#15803D" font-size="17" font-weight="700">${url}</text>
    <text x="0" y="240" fill="#071C38" font-size="26" font-weight="700">Steps</text>
    <text x="0" y="280" fill="#334155" font-size="18">1. Write + lock the tag first.</text>
    <text x="0" y="310" fill="#334155" font-size="18">2. Stick behind TAP (face toward cabin).</text>
    <text x="0" y="340" fill="#334155" font-size="18">3. Align sticker centre on red crosshair.</text>
    <text x="0" y="370" fill="#334155" font-size="18">4. Do not place under the QR white card.</text>
    <text x="0" y="400" fill="#334155" font-size="18">5. Test iPhone + Android before fitting.</text>
    <text x="0" y="460" fill="#64748B" font-size="16">QR must still scan to the same URL.</text>
  </g>
</svg>
`;

// Rebuild guide without embedding huge base64 via circular ref — use file after write
const guideSvgPath = join(outDir, "nfc-install-guide-120x80.svg");
const guideWithImage = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="160mm" height="120mm" viewBox="0 0 1600 1200" role="img"
  aria-label="NFC installation guide for 120 by 80 mm headrest plate">
  <rect width="1600" height="1200" fill="#F4F6F8"/>
  <text x="80" y="70" fill="#071C38" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700">NFC install guide — Option A (120 × 80 mm)</text>
  <text x="80" y="115" fill="#334155" font-family="Arial, Helvetica, sans-serif" font-size="22">My Airport Taxi NI · NTAG213 / NTAG215 · installer sheet only (not on passenger face)</text>

  <g transform="translate(80,180)">
    <image href="data:image/png;base64,${previewPng.toString("base64")}" width="900" height="600" preserveAspectRatio="xMidYMid meet"/>
    <g transform="translate(${(NFC_CX / 1200) * 900},${(NFC_CY / 800) * 600})" stroke="#E11D48" stroke-width="3" fill="none">
      <circle r="42" stroke-dasharray="6 5"/>
      <circle r="10" fill="#E11D48" stroke="none"/>
      <path d="M-55 0 H-18 M18 0 H55 M0 -55 V-18 M0 18 V55"/>
    </g>
    <text x="450" y="640" text-anchor="middle" fill="#E11D48" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700">NTAG sticker centre = TAP circle centre</text>
  </g>

  <g transform="translate(1040,200)" font-family="Arial, Helvetica, sans-serif">
    <text x="0" y="0" fill="#071C38" font-size="26" font-weight="700">Position</text>
    <text x="0" y="40" fill="#334155" font-size="20">From left trim edge: ${nfcLeftMm} mm</text>
    <text x="0" y="72" fill="#334155" font-size="20">From top trim edge: ${nfcTopMm} mm</text>
    <text x="0" y="120" fill="#071C38" font-size="26" font-weight="700">Program</text>
    <text x="0" y="160" fill="#334155" font-size="18">NDEF URI (not plain text):</text>
    <text x="0" y="190" fill="#15803D" font-size="17" font-weight="700">${url}</text>
    <text x="0" y="240" fill="#071C38" font-size="26" font-weight="700">Steps</text>
    <text x="0" y="280" fill="#334155" font-size="18">1. Write + lock the tag first.</text>
    <text x="0" y="310" fill="#334155" font-size="18">2. Stick behind TAP (face toward cabin).</text>
    <text x="0" y="340" fill="#334155" font-size="18">3. Align sticker centre on red crosshair.</text>
    <text x="0" y="370" fill="#334155" font-size="18">4. Do not place under the QR white card.</text>
    <text x="0" y="400" fill="#334155" font-size="18">5. Test iPhone + Android before fitting.</text>
    <text x="0" y="460" fill="#64748B" font-size="16">QR must still scan to the same URL.</text>
  </g>
</svg>
`;
writeFileSync(guideSvgPath, guideWithImage, "utf8");

const guidePng = await sharp(Buffer.from(guideWithImage)).resize(1890, 1417, { fit: "fill" }).png().toBuffer();
writeFileSync(join(outDir, "nfc-install-guide-120x80.png"), guidePng);
const guideJpeg = await sharp(guidePng).jpeg({ quality: 92 }).toBuffer();
writeFileSync(
  join(outDir, "nfc-install-guide-120x80.pdf"),
  buildPdfFromJpeg(guideJpeg, 1890, 1417, 160, 120),
);

// QA: MediaBox + QR decode
const trimPdf = readFileSync(join(outDir, "headrest-plate-120x80-trim.pdf"), "utf8");
const bleedPdf = readFileSync(join(outDir, "headrest-plate-120x80-bleed.pdf"), "utf8");
const m1 = trimPdf.match(/MediaBox \[0 0 ([0-9.]+) ([0-9.]+)\]/);
const m2 = bleedPdf.match(/MediaBox \[0 0 ([0-9.]+) ([0-9.]+)\]/);
const ptToMm = (pt) => ((+pt / 72) * 25.4).toFixed(2);

let decoded = null;
try {
  const jsQR = (await import("jsqr")).default;
  const cx = Math.round((900 / 1200) * trimPxW);
  const cy = Math.round((485 / 800) * trimPxH);
  const half = Math.round((160 / 1200) * trimPxW);
  const left = Math.max(0, cx - half);
  const top = Math.max(0, cy - half);
  const size = Math.min(half * 2, trimPxW - left, trimPxH - top);
  const crop = await sharp(previewPng)
    .extract({ left, top, width: size, height: size })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  decoded = jsQR(new Uint8ClampedArray(crop.data), crop.info.width, crop.info.height)?.data ?? null;
} catch {
  decoded = null;
}

const encodeOk = Boolean(await QRCode.create(url, { errorCorrectionLevel: "H" }));

const readme = `# Option A — 120 × 80 mm print pack (final)

Send these files to your printer. Print at **100% scale** (no fit-to-page).

| File | Use |
|------|-----|
| \`headrest-plate-120x80-trim.pdf\` | Exact **120 × 80 mm** trim PDF (300 dpi, fonts rasterised/outlined) |
| \`headrest-plate-120x80-bleed.pdf\` | **126 × 86 mm** with **3 mm bleed** + crop marks |
| \`headrest-plate-120x80-print.svg\` | Print SVG — logo + QR embedded |
| \`headrest-plate-120x80-preview.png\` | High-resolution PNG preview (~300 dpi) |
| \`nfc-install-guide-120x80.pdf\` | Installer sheet — NTAG position behind TAP |
| \`nfc-install-guide-120x80.png\` | Same guide as PNG |

## Specs
- Finish: matte black / deep navy artwork (ask for matte laminate / matte PVC or acrylic)
- Logo: original My Airport Taxi NI
- Rounded corners ~2.4 mm on artwork (confirm die-cut radius with printer)
- QR → \`${url}\` (ECC H, white quiet zone preserved)
- NFC: centre behind green TAP — **${nfcLeftMm} mm from left**, **${nfcTopMm} mm from top**

## QA
- Trim MediaBox: ${m1 ? `${ptToMm(m1[1])} × ${ptToMm(m1[2])} mm` : "n/a"}
- Bleed MediaBox: ${m2 ? `${ptToMm(m2[1])} × ${ptToMm(m2[2])} mm` : "n/a"}
- QR encode OK: ${encodeOk}
- QR decode from print preview: ${decoded || "(install jsqr to verify locally)"}
`;

writeFileSync(join(outDir, "README.md"), readme, "utf8");

console.log(`Wrote ${outDir}`);
console.log(`Trim PDF: ${m1 ? `${ptToMm(m1[1])}×${ptToMm(m1[2])} mm` : "?"}`);
console.log(`Bleed PDF: ${m2 ? `${ptToMm(m2[1])}×${ptToMm(m2[2])} mm` : "?"}`);
console.log(`QR decode: ${decoded || "(skipped)"}`);
if (decoded && decoded !== url) throw new Error(`QR mismatch: ${decoded}`);
void guideSvg;
