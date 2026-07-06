"""Process user-provided logo into transparent PNG variants for the site."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(
    r"C:\Users\colin\.cursor\projects\c-Users-colin-Projects-my-airport-taxi-ni\assets"
    r"\c__Users_colin_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images"
    r"_image-4199dcc0-fe0d-48bb-a363-61a8e9dc4c39.png"
)
PUBLIC = ROOT / "public"

# Brand colours sampled from source artwork
NAVY = (7, 28, 56)
GREEN = (72, 152, 40)
TEAL = (0, 136, 160)


def color_distance(c1: tuple[int, int, int], c2: tuple[int, int, int]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(c1, c2)))


def classify_pixel(r: int, g: int, b: int) -> str:
    rgb = (r, g, b)
    if r > 235 and g > 235 and b > 235:
        return "white"
    if color_distance(rgb, GREEN) < 55 or (g > 110 and r < 120 and b < 90):
        return "green"
    if color_distance(rgb, TEAL) < 70 or (b > 120 and g > 90 and r < 40):
        return "teal"
    if color_distance(rgb, NAVY) < 70 or (b > 40 and r < 60 and g < 80):
        return "navy"
    return "other"


def process_pixel(
    r: int, g: int, b: int, a: int, *, dark_variant: bool
) -> tuple[int, int, int, int]:
    kind = classify_pixel(r, g, b)

    if kind == "white":
        return (0, 0, 0, 0)

    if kind == "navy" and dark_variant:
        return (255, 255, 255, a if a > 0 else 255)

    if kind == "other":
        # Light anti-alias fringe from white background removal.
        if r > 200 and g > 200 and b > 200:
            alpha = int((255 - min(r, g, b)) * 2.5)
            if alpha < 12:
                return (0, 0, 0, 0)
            if dark_variant:
                return (255, 255, 255, min(alpha, a or 255))
            return (r, g, b, min(alpha, a or 255))

    return (r, g, b, a if a > 0 else 255)


def process_image(src: Image.Image, *, dark_variant: bool) -> Image.Image:
    rgba = src.convert("RGBA")
    out = Image.new("RGBA", rgba.size)
    src_px = rgba.load()
    out_px = out.load()
    w, h = rgba.size

    for y in range(h):
        for x in range(w):
            out_px[x, y] = process_pixel(*src_px[x, y], dark_variant=dark_variant)

    return out


def trim_transparent(img: Image.Image, padding: int = 8) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(img.width, right + padding)
    bottom = min(img.height, bottom + padding)
    return img.crop((left, top, right, bottom))


def icon_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    """Crop to car/plane icon above the text gap."""
    w, h = img.size
    px = img.load()

    def row_density(y: int) -> int:
        count = 0
        for x in range(w):
            if px[x, y][3] > 20:
                count += 1
        return count

    densities = [row_density(y) for y in range(h)]
    active_rows = [i for i, d in enumerate(densities) if d > 40]
    top = active_rows[0]

    mid_start, mid_end = int(h * 0.35), int(h * 0.65)
    gap_row = mid_start + densities[mid_start:mid_end].index(
        min(densities[mid_start:mid_end])
    )
    bottom = gap_row - 6

    # Horizontal bounds from icon rows only
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
    square = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    icon_w, icon_h = icon.size
    scale = min((size - 24) / icon_w, (size - 24) / icon_h)
    new_w = max(1, int(icon_w * scale))
    new_h = max(1, int(icon_h * scale))
    resized = icon.resize((new_w, new_h), Image.Resampling.LANCZOS)
    offset = ((size - new_w) // 2, (size - new_h) // 2)
    square.paste(resized, offset, resized)
    return square


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC)

    logo_light = trim_transparent(process_image(src, dark_variant=False))
    logo_dark = trim_transparent(process_image(src, dark_variant=True))

    logo_light.save(PUBLIC / "logo-light.png", optimize=True)
    logo_dark.save(PUBLIC / "logo.png", optimize=True)

    icon_crop = logo_dark.crop(icon_bbox(logo_dark))
    favicon = make_favicon(icon_crop, 256)
    favicon.save(PUBLIC / "favicon.png", optimize=True)

    # Small favicon for browsers that request 32px
    favicon.resize((32, 32), Image.Resampling.LANCZOS).save(
        PUBLIC / "favicon-32.png", optimize=True
    )

    print("logo.png:", logo_dark.size)
    print("logo-light.png:", logo_light.size)
    print("favicon.png:", favicon.size)


if __name__ == "__main__":
    main()
