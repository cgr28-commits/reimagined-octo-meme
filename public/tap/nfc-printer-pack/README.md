# My Airport Taxi NI — NFC Printer Pack (final)

## Contents (also in My-Airport-Taxi-NI-NFC-Printer-Pack.zip)
- `My-Airport-Taxi-NI-NFC-Plate-120x80-PRINT.pdf`
- `My-Airport-Taxi-NI-NFC-Plate-120x80-BLEED.pdf`
- `My-Airport-Taxi-NI-NFC-Plate-120x80.svg`
- `My-Airport-Taxi-NI-NFC-Plate-PREVIEW.png`
- `My-Airport-Taxi-NI-NFC-Installation.pdf`
- `My-Airport-Taxi-NI-Printer-Specifications.pdf`

## Specs
- Finished trim: **120 × 80 mm** landscape
- Bleed: **3 mm** all sides (126 × 86 mm) + crop marks
- Corners: ≈ **5.0 mm** radius (confirm die-cut)
- Material: ~1 mm non-metallic rigid PVC, matte/satin
- QR + NFC URL: `https://www.myairporttaxini.co.uk/tap`
- NFC centre: **25.0 mm** from left, **50.0 mm** from top (behind TAP)

## QA results
- Trim PDF MediaBox: 120.00 × 80.00 mm
- Bleed PDF MediaBox: 126.00 × 86.00 mm
- SVG declared size: 120mm × 80mm
- QR encode (ECC H): true
- QR decode from 100% print-scale preview: https://www.myairporttaxini.co.uk/tap
- Fonts: rasterised into PDF at 300 dpi (outlined / no embed risk)

## NFC notes for printer / installer
- Non-metallic PVC ≈ 1 mm is suitable for NTAG213 through the plate.
- Do **not** use metallic foil, metallic laminate or metal-backed stock.
- Program sticker as NDEF URI to the same URL as the QR, then lock.
- Test NFC through finished material and against the actual headrest before permanent fit.
