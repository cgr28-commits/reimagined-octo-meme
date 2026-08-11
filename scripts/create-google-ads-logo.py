"""Create a Google Ads square business logo (1200x1200) from the navy brand mark."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SOURCE = PUBLIC / "facebook-profile-logo-navy.png"
OUTPUT = PUBLIC / "google-ads-logo-1200.png"

# Brand navy — solid fill so Ads never substitutes a white background.
NAVY = (7, 28, 56, 255)
SIZE = 1200


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    resized = source.resize((SIZE, SIZE), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (SIZE, SIZE), NAVY)
    canvas.alpha_composite(resized)

    rgb = canvas.convert("RGB")
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=2))
    rgb.save(OUTPUT, format="PNG", optimize=True)

    print(f"Created {OUTPUT.relative_to(ROOT)} ({SIZE}x{SIZE} RGB)")
    print("Upload this file in Google Ads → Assets → Business logo (1:1 square).")


if __name__ == "__main__":
    main()
