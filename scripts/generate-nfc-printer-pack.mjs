/**
 * Final printer delivery package — Option A 120 × 80 mm NFC headrest plate.
 * Run: node scripts/generate-nfc-printer-pack.mjs
 *
 * Uses approved artwork from public/tap/size-options/option-a-120x80.svg
 * (does not redesign). Outputs named files under public/tap/nfc-printer-pack/.
 */
import { createRequire } from "node:module";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  createWriteStream,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { spawnSync } from "node:child_process";
import QRCode from "qrcode";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "tap", "nfc-printer-pack");
const url = "https://www.myairporttaxini.co.uk/tap";
const TRIM_W_MM = 120;
const TRIM_H_MM = 80;
const BLEED_MM = 3;
const DPI = 300;
const UNITS_PER_MM = 10;
const NFC_CX = 250; // viewBox — green TAP centre
const NFC_CY = 500;
const CORNER_RX = 50; // ~5 mm (user / printer package spec)

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

const approvedPath = join(root, "public", "tap", "size-options", "option-a-120x80.svg");
if (!existsSync(approvedPath)) {
  throw new Error("Missing approved Option A SVG at public/tap/size-options/option-a-120x80.svg");
}

let trimSvg = readFileSync(approvedPath, "utf8");

// Apply ~5 mm rounded outer face for die-cut guidance (layout centres unchanged).
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
  trimSvg = trimSvg.replace(/\n<\/svg>\s*$/, "\n  </g>\n</svg>\n");
} else {
  trimSvg = trimSvg.replace(
    /rx="24" ry="24"/g,
    `rx="${CORNER_RX}" ry="${CORNER_RX}"`,
  );
}

const printComment = `<!--
  FINAL PRINT — My Airport Taxi NI NFC headrest plate (Option A)
  Trim: 120 × 80 mm landscape. Print at 100% scale (do not fit to page).
  Material: ~1 mm non-metallic rigid PVC, matte/satin. No metal foil/laminate.
  Corners: ~5 mm radius (confirm die-cut with printer).
  QR → ${url} (ECC H, quiet zone preserved). Same URL for NTAG213 behind TAP.
  PDFs are 300 dpi raster so type is outlined (no missing-font risk).
-->`;

const printSvgBody = printComment + "\n" + trimSvg.replace(/^<\?xml[^>]*>\s*/, "");
const printSvgXml = `<?xml version="1.0" encoding="UTF-8"?>\n${printSvgBody}`;
writeFileSync(join(outDir, "My-Airport-Taxi-NI-NFC-Plate-120x80.svg"), printSvgXml, "utf8");

const bleedU = BLEED_MM * UNITS_PER_MM;
const pageW = TRIM_W_MM * UNITS_PER_MM + bleedU * 2;
const pageH = TRIM_H_MM * UNITS_PER_MM + bleedU * 2;
const pageWmm = TRIM_W_MM + BLEED_MM * 2;
const pageHmm = TRIM_H_MM + BLEED_MM * 2;
const mark = 18;
const gap = 6;

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

const trimPxW = mmToPx(TRIM_W_MM);
const trimPxH = mmToPx(TRIM_H_MM);
const bleedPxW = mmToPx(TRIM_W_MM + BLEED_MM * 2);
const bleedPxH = mmToPx(TRIM_H_MM + BLEED_MM * 2);

const previewPng = await sharp(Buffer.from(printSvgXml))
  .resize(trimPxW, trimPxH, { fit: "fill" })
  .png()
  .toBuffer();
writeFileSync(join(outDir, "My-Airport-Taxi-NI-NFC-Plate-PREVIEW.png"), previewPng);

const trimJpeg = await sharp(Buffer.from(printSvgXml))
  .resize(trimPxW, trimPxH, { fit: "fill" })
  .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
  .toBuffer();
const bleedJpeg = await sharp(Buffer.from(bleedSvg))
  .resize(bleedPxW, bleedPxH, { fit: "fill" })
  .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
  .toBuffer();

writeFileSync(
  join(outDir, "My-Airport-Taxi-NI-NFC-Plate-120x80-PRINT.pdf"),
  buildPdfFromJpeg(trimJpeg, trimPxW, trimPxH, TRIM_W_MM, TRIM_H_MM),
);
writeFileSync(
  join(outDir, "My-Airport-Taxi-NI-NFC-Plate-120x80-BLEED.pdf"),
  buildPdfFromJpeg(bleedJpeg, bleedPxW, bleedPxH, TRIM_W_MM + BLEED_MM * 2, TRIM_H_MM + BLEED_MM * 2),
);

const nfcLeftMm = (NFC_CX / UNITS_PER_MM).toFixed(1);
const nfcTopMm = (NFC_CY / UNITS_PER_MM).toFixed(1);
const cornerMm = (CORNER_RX / UNITS_PER_MM).toFixed(1);

// Installation diagram — rear view + face callouts
const installSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="148mm" viewBox="0 0 2100 1480" role="img"
  aria-label="NFC installation diagram for My Airport Taxi NI 120 by 80 mm plate">
  <rect width="2100" height="1480" fill="#F7F8FA"/>
  <text x="80" y="64" fill="#071C38" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700">Installation diagram — My Airport Taxi NI NFC plate</text>
  <text x="80" y="104" fill="#475569" font-family="Arial, Helvetica, sans-serif" font-size="20">Finished size 120 × 80 mm landscape · ~5 mm rounded corners · NTAG213 25 mm sticker · installer sheet only</text>

  <!-- Face preview -->
  <g transform="translate(80,160)">
    <text x="0" y="0" fill="#071C38" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700">Passenger face (print side)</text>
    <image href="data:image/png;base64,${previewPng.toString("base64")}" x="0" y="20" width="900" height="600" preserveAspectRatio="xMidYMid meet"/>
    <g transform="translate(${(NFC_CX / 1200) * 900},${20 + (NFC_CY / 800) * 600})" stroke="#E11D48" stroke-width="3" fill="none">
      <circle r="48" stroke-dasharray="7 5"/>
      <circle r="10" fill="#E11D48" stroke="none"/>
      <path d="M-60 0 H-20 M20 0 H60 M0 -60 V-20 M0 20 V60"/>
    </g>
    <text x="450" y="660" text-anchor="middle" fill="#E11D48" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700">NFC centre behind TAP · QR printed on right</text>
  </g>

  <!-- Rear schematic -->
  <g transform="translate(1080,180)" font-family="Arial, Helvetica, sans-serif">
    <text x="0" y="0" fill="#071C38" font-size="22" font-weight="700">Rear (headrest side)</text>
    <rect x="40" y="40" width="720" height="480" rx="30" ry="30" fill="#E8EEF5" stroke="#071C38" stroke-width="3"/>
    <!-- Dimension callouts -->
    <text x="400" y="30" text-anchor="middle" fill="#64748B" font-size="16">120 mm</text>
    <text x="20" y="280" text-anchor="middle" fill="#64748B" font-size="16" transform="rotate(-90 20 280)">80 mm</text>
    <!-- Corner radius note -->
    <path d="M40 70 A30 30 0 0 1 70 40" fill="none" stroke="#0EA5E9" stroke-width="3"/>
    <text x="90" y="55" fill="#0EA5E9" font-size="16" font-weight="700">R ≈ ${cornerMm} mm</text>
    <!-- NFC sticker -->
    <circle cx="${40 + (NFC_CX / 1200) * 720}" cy="${40 + (NFC_CY / 800) * 480}" r="75" fill="#FEF3C7" stroke="#D97706" stroke-width="3" stroke-dasharray="6 4"/>
    <text x="${40 + (NFC_CX / 1200) * 720}" y="${40 + (NFC_CY / 800) * 480 - 8}" text-anchor="middle" fill="#92400E" font-size="15" font-weight="700">NTAG213</text>
    <text x="${40 + (NFC_CX / 1200) * 720}" y="${40 + (NFC_CY / 800) * 480 + 14}" text-anchor="middle" fill="#92400E" font-size="14">Ø 25 mm</text>
    <!-- QR zone (no NFC under QR) -->
    <rect x="${40 + (740 / 1200) * 720}" y="${40 + (325 / 800) * 480}" width="${(320 / 1200) * 720}" height="${(320 / 800) * 480}" rx="8" fill="none" stroke="#64748B" stroke-width="2" stroke-dasharray="5 4"/>
    <text x="${40 + (900 / 1200) * 720}" y="${40 + (300 / 800) * 480}" text-anchor="middle" fill="#64748B" font-size="14">QR area — keep clear</text>
    <!-- Adhesive strips -->
    <rect x="70" y="70" width="40" height="420" rx="6" fill="#86EFAC" fill-opacity="0.55" stroke="#15803D" stroke-width="2"/>
    <rect x="690" y="70" width="40" height="420" rx="6" fill="#86EFAC" fill-opacity="0.55" stroke="#15803D" stroke-width="2"/>
    <text x="400" y="560" text-anchor="middle" fill="#15803D" font-size="16" font-weight="700">Green = automotive double-sided tape strips</text>
  </g>

  <!-- Specs column -->
  <g transform="translate(80,900)" font-family="Arial, Helvetica, sans-serif">
    <text x="0" y="0" fill="#071C38" font-size="22" font-weight="700">Exact positions (from trim edges)</text>
    <text x="0" y="36" fill="#334155" font-size="18">NFC sticker centre: ${nfcLeftMm} mm from left · ${nfcTopMm} mm from top</text>
    <text x="0" y="66" fill="#334155" font-size="18">Orientation: landscape — logo top-left, TAP left, SCAN/QR right</text>
    <text x="0" y="96" fill="#334155" font-size="18">Rounded corners: ≈ ${cornerMm} mm radius (confirm die-cut with printer)</text>
    <text x="0" y="126" fill="#334155" font-size="18">Adhesive: thin automotive tape on left + right rear margins (avoid covering NFC)</text>
    <text x="0" y="170" fill="#071C38" font-size="22" font-weight="700">Program NTAG213</text>
    <text x="0" y="206" fill="#334155" font-size="18">Write NDEF URI record (not plain text): ${url}</text>
    <text x="0" y="236" fill="#334155" font-size="18">Apps: NFC Tools / TagWriter · write once · lock after verify · test through finished PVC + on headrest</text>
    <text x="0" y="280" fill="#64748B" font-size="16">No metallic backing, foil or metallic laminate — NFC must pass through non-metallic PVC.</text>
  </g>
</svg>
`;

writeFileSync(join(outDir, "My-Airport-Taxi-NI-NFC-Installation.svg"), installSvg, "utf8");
const installPng = await sharp(Buffer.from(installSvg)).resize(2480, 1750, { fit: "fill" }).png().toBuffer();
const installJpeg = await sharp(installPng).jpeg({ quality: 92 }).toBuffer();
writeFileSync(
  join(outDir, "My-Airport-Taxi-NI-NFC-Installation.pdf"),
  buildPdfFromJpeg(installJpeg, 2480, 1750, 210, 148),
);

// Printer specification sheet (A4)
const specSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 2100 2970" role="img"
  aria-label="Printer specification sheet My Airport Taxi NI NFC plate">
  <rect width="2100" height="2970" fill="#FFFFFF"/>
  <rect width="2100" height="140" fill="#071C38"/>
  <text x="100" y="88" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700">Printer specification sheet</text>
  <text x="100" y="200" fill="#071C38" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700">My Airport Taxi NI — NFC Tap &amp; Scan headrest plate</text>
  <text x="100" y="250" fill="#64748B" font-family="Arial, Helvetica, sans-serif" font-size="22">Commercial print enquiry · Option A artwork · sample first</text>

  <g font-family="Arial, Helvetica, sans-serif">
    <rect x="100" y="300" width="1900" height="2" fill="#E2E8F0"/>
    ${[
      ["Business name", "My Airport Taxi NI"],
      ["Product", "NFC Tap & Scan headrest plate (passenger-facing)"],
      ["Finished dimensions", "120 × 80 mm landscape (exact trim)"],
      ["Bleed file", "3 mm bleed all sides → 126 × 86 mm with crop marks"],
      ["Material", "Non-metallic rigid PVC (approx. 1 mm thick)"],
      ["Thickness", "≈ 1 mm — thin, lightweight, discreet"],
      ["Finish", "Premium matte or satin (no gloss glare preferred)"],
      ["Printing", "Full colour, high resolution digital print"],
      ["Corners", `Rounded, approximately ${cornerMm} mm radius (confirm die-cut)`],
      ["Mounting", "Suitable for smooth plastic car headrest"],
      ["Adhesive", "Thin automotive-grade double-sided tape (supply separately if needed)"],
      ["NFC", "25 mm NTAG213 adhesive sticker fitted behind TAP symbol (rear)"],
      ["NFC compatibility", "Non-metallic PVC only — no metal foil, metallic laminate or metallic backing"],
      ["QR code", `Printed on plate → ${url} (ECC H, quiet zone, not distorted)`],
      ["Artwork files", "PRINT.pdf (trim) + BLEED.pdf + SVG + PREVIEW.png enclosed"],
      ["Quantity", "One sample initially"],
      ["Optional quote", "Please also quote for 5 units and 10 units"],
    ]
      .map(
        ([k, v], i) => {
          const y = 360 + i * 72;
          return `<text x="100" y="${y}" fill="#071C38" font-size="20" font-weight="700">${k}</text>
    <text x="620" y="${y}" fill="#334155" font-size="20">${v.replace(/&/g, "&amp;")}</text>`;
        },
      )
      .join("\n    ")}
  </g>

  <rect x="100" y="1680" width="1900" height="280" rx="12" fill="#F1F5F9"/>
  <text x="140" y="1740" fill="#071C38" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700">Print instructions</text>
  <text x="140" y="1790" fill="#334155" font-family="Arial, Helvetica, sans-serif" font-size="20">• Print at 100% scale — do not fit to page or stretch.</text>
  <text x="140" y="1835" fill="#334155" font-family="Arial, Helvetica, sans-serif" font-size="20">• Prefer BLEED.pdf for production; PRINT.pdf shows exact finished face.</text>
  <text x="140" y="1880" fill="#334155" font-family="Arial, Helvetica, sans-serif" font-size="20">• Keep critical artwork inside trim; background extends through bleed.</text>
  <text x="140" y="1925" fill="#334155" font-family="Arial, Helvetica, sans-serif" font-size="20">• Customer applies NFC sticker + adhesive after manufacture.</text>

  <image href="data:image/png;base64,${previewPng.toString("base64")}" x="100" y="2040" width="720" height="480" preserveAspectRatio="xMidYMid meet"/>
  <text x="100" y="2560" fill="#64748B" font-family="Arial, Helvetica, sans-serif" font-size="18">Preview at correct aspect (not to scale on this A4 sheet)</text>

  <text x="100" y="2750" fill="#071C38" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700">Contact / website</text>
  <text x="100" y="2790" fill="#334155" font-family="Arial, Helvetica, sans-serif" font-size="20">www.myairporttaxini.co.uk · /tap destination for QR and NFC</text>
  <text x="100" y="2880" fill="#94A3B8" font-family="Arial, Helvetica, sans-serif" font-size="16">Do not order manufacture from this sheet alone without confirming material NFC compatibility.</text>
</svg>
`;

const specPng = await sharp(Buffer.from(specSvg)).resize(2480, 3508, { fit: "fill" }).png().toBuffer();
const specJpeg = await sharp(specPng).jpeg({ quality: 92 }).toBuffer();
writeFileSync(
  join(outDir, "My-Airport-Taxi-NI-Printer-Specifications.pdf"),
  buildPdfFromJpeg(specJpeg, 2480, 3508, 210, 297),
);

// QA
const trimPdfText = readFileSync(join(outDir, "My-Airport-Taxi-NI-NFC-Plate-120x80-PRINT.pdf"), "utf8");
const bleedPdfText = readFileSync(join(outDir, "My-Airport-Taxi-NI-NFC-Plate-120x80-BLEED.pdf"), "utf8");
const m1 = trimPdfText.match(/MediaBox \[0 0 ([0-9.]+) ([0-9.]+)\]/);
const m2 = bleedPdfText.match(/MediaBox \[0 0 ([0-9.]+) ([0-9.]+)\]/);
const ptToMm = (pt) => ((+pt / 72) * 25.4).toFixed(2);

const svgDim = printSvgXml.match(/width="([^"]+)" height="([^"]+)"/);
const encodeOk = Boolean(await QRCode.create(url, { errorCorrectionLevel: "H" }));

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
} catch (err) {
  console.warn("jsQR decode skipped:", err?.message || err);
  decoded = null;
}

if (decoded && decoded !== url) {
  throw new Error(`QR mismatch from preview: ${decoded}`);
}

const files = [
  "My-Airport-Taxi-NI-NFC-Plate-120x80-PRINT.pdf",
  "My-Airport-Taxi-NI-NFC-Plate-120x80-BLEED.pdf",
  "My-Airport-Taxi-NI-NFC-Plate-120x80.svg",
  "My-Airport-Taxi-NI-NFC-Plate-PREVIEW.png",
  "My-Airport-Taxi-NI-NFC-Installation.pdf",
  "My-Airport-Taxi-NI-Printer-Specifications.pdf",
];

const zipName = "My-Airport-Taxi-NI-NFC-Printer-Pack.zip";
const zipPath = join(outDir, zipName);

// Prefer system tar/Compress-Archive via PowerShell on Windows
const ps = spawnSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path ${files.map((f) => `'${join(outDir, f)}'`).join(",")} -DestinationPath '${zipPath}' -Force`,
  ],
  { encoding: "utf8" },
);
if (ps.status !== 0) {
  console.error(ps.stderr || ps.stdout);
  throw new Error("ZIP creation failed");
}

const qa = `# My Airport Taxi NI — NFC Printer Pack (final)

## Contents (also in ${zipName})
${files.map((f) => `- \`${f}\``).join("\n")}

## Specs
- Finished trim: **120 × 80 mm** landscape
- Bleed: **3 mm** all sides (126 × 86 mm) + crop marks
- Corners: ≈ **${cornerMm} mm** radius (confirm die-cut)
- Material: ~1 mm non-metallic rigid PVC, matte/satin
- QR + NFC URL: \`${url}\`
- NFC centre: **${nfcLeftMm} mm** from left, **${nfcTopMm} mm** from top (behind TAP)

## QA results
- Trim PDF MediaBox: ${m1 ? `${ptToMm(m1[1])} × ${ptToMm(m1[2])} mm` : "n/a"}
- Bleed PDF MediaBox: ${m2 ? `${ptToMm(m2[1])} × ${ptToMm(m2[2])} mm` : "n/a"}
- SVG declared size: ${svgDim ? `${svgDim[1]} × ${svgDim[2]}` : "n/a"}
- QR encode (ECC H): ${encodeOk}
- QR decode from 100% print-scale preview: ${decoded || "FAILED"}
- Fonts: rasterised into PDF at 300 dpi (outlined / no embed risk)

## NFC notes for printer / installer
- Non-metallic PVC ≈ 1 mm is suitable for NTAG213 through the plate.
- Do **not** use metallic foil, metallic laminate or metal-backed stock.
- Program sticker as NDEF URI to the same URL as the QR, then lock.
- Test NFC through finished material and against the actual headrest before permanent fit.
`;

writeFileSync(join(outDir, "README.md"), qa, "utf8");

console.log(`Wrote ${outDir}`);
console.log(`Trim: ${m1 ? `${ptToMm(m1[1])}×${ptToMm(m1[2])} mm` : "?"}`);
console.log(`Bleed: ${m2 ? `${ptToMm(m2[1])}×${ptToMm(m2[2])} mm` : "?"}`);
console.log(`QR decode: ${decoded}`);
console.log(`ZIP: ${zipPath}`);

if (!decoded) throw new Error("QR decode failed — aborting package");
void createGzip;
void pipeline;
void copyFileSync;
