"""Generate favicons from the navy brand logo (white car, green plane on blue)."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
APP_ICON = ROOT / "src" / "app" / "icon.png"

NAVY = (7, 28, 56)


def icon_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    """Crop to car/plane icon above the text gap."""
    w, h = img.size
    px = img.load()

    def row_density(y: int) -> int:
        return sum(1 for x in range(w) if px[x, y][3] > 20)

    densities = [row_density(y) for y in range(h)]
    active_rows = [i for i, d in enumerate(densities) if d > 40]
    top = active_rows[0]

    mid_start, mid_end = int(h * 0.35), int(h * 0.65)
    gap_row = mid_start + densities[mid_start:mid_end].index(
        min(densities[mid_start:mid_end])
    )
    bottom = gap_row - 6

    left, right = w, 0
    for y in range(top, bottom):
        for x in range(w):
            if px[x, y][3] > 20:
                left = min(left, x)
                right = max(right, x)

    pad = 10
    return (
        max(0, left - pad),
        max(0, top - pad),
        min(w, right + pad),
        min(h, bottom + pad),
    )


def make_favicon(icon: Image.Image, size: int = 256) -> Image.Image:
    """Navy circular favicon with centred car/plane mark."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    inset = max(2, size // 32)
    draw.ellipse((inset, inset, size - inset - 1, size - inset - 1), fill=(*NAVY, 255))

    icon_w, icon_h = icon.size
    inner = size - inset * 2
    scale = min((inner - inner // 6) / icon_w, (inner - inner // 6) / icon_h)
    new_w = max(1, int(icon_w * scale))
    new_h = max(1, int(icon_h * scale))
    resized = icon.resize((new_w, new_h), Image.Resampling.LANCZOS)
    offset = ((size - new_w) // 2, (size - new_h) // 2 - size // 32)
    canvas.paste(resized, offset, resized)
    return canvas


def main() -> None:
    logo = Image.open(PUBLIC / "logo.png").convert("RGBA")
    icon = logo.crop(icon_bbox(logo))

    favicon = make_favicon(icon, 256)
    favicon_32 = favicon.resize((32, 32), Image.Resampling.LANCZOS)
    favicon_512 = make_favicon(icon, 512)

    favicon.save(PUBLIC / "favicon.png", optimize=True)
    favicon_32.save(PUBLIC / "favicon-32.png", optimize=True)
    favicon_512.save(APP_ICON, optimize=True)

    ico_sizes = [
        favicon_32.resize((16, 16), Image.Resampling.LANCZOS),
        favicon_32,
        favicon.resize((48, 48), Image.Resampling.LANCZOS),
        favicon,
    ]
    ico_sizes[0].save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(img.width, img.height) for img in ico_sizes],
        append_images=ico_sizes[1:],
    )

    print("Created navy circle favicons:")
    print("  public/favicon.png (256x256)")
    print("  public/favicon-32.png")
    print("  public/favicon.ico")
    print("  src/app/icon.png (512x512)")


if __name__ == "__main__":
    main()
