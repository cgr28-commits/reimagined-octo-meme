"""Create square Google Business Profile logo from existing brand assets."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

# Brand navy from LogoMark.tsx / process-logo.py
NAVY = (7, 28, 56)
WHITE = (255, 255, 255)

# ~12% padding keeps the logo clear under GBP circular crop
PADDING_RATIO = 0.12
OUTPUT_SIZES = (720, 1024)


def trim_transparent(img: Image.Image, padding: int = 4) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(img.width, right + padding)
    bottom = min(img.height, bottom + padding)
    return img.crop((left, top, right, bottom))


def composite_logo(
    logo: Image.Image,
    *,
    canvas_size: int,
    background: tuple[int, int, int],
) -> Image.Image:
    logo = trim_transparent(logo.convert("RGBA"))
    pad = int(canvas_size * PADDING_RATIO)
    max_w = canvas_size - 2 * pad
    max_h = canvas_size - 2 * pad

    scale = min(max_w / logo.width, max_h / logo.height)
    new_w = max(1, int(logo.width * scale))
    new_h = max(1, int(logo.height * scale))
    resized = logo.resize((new_w, new_h), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (*background, 255))
    offset = ((canvas_size - new_w) // 2, (canvas_size - new_h) // 2)
    canvas.paste(resized, offset, resized)
    return canvas.convert("RGB")


def main() -> None:
    logo_light = Image.open(PUBLIC / "logo-light.png")
    logo_dark = Image.open(PUBLIC / "logo.png")

    # White background + navy logo reads best on Google Maps/listings.
    chosen = composite_logo(logo_light, canvas_size=720, background=WHITE)

    out_720 = PUBLIC / "google-business-logo.png"
    chosen.save(out_720, optimize=True)

    out_1024 = PUBLIC / "google-business-logo-1024.png"
    composite_logo(logo_light, canvas_size=1024, background=WHITE).save(
        out_1024, optimize=True
    )

    # Alternate: navy background + white logo (kept for reference)
    alt_720 = PUBLIC / "google-business-logo-navy.png"
    composite_logo(logo_dark, canvas_size=720, background=NAVY).save(
        alt_720, optimize=True
    )

    print(f"Primary: {out_720} ({chosen.size[0]}x{chosen.size[1]})")
    print(f"Hi-res:  {out_1024} (1024x1024)")
    print(f"Alt:     {alt_720} (720x720, navy background)")


if __name__ == "__main__":
    main()
