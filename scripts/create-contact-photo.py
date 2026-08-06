"""Build public/contact-photo.jpg for the phone contact card.

Full-bleed emerald square + navy disc + wordmark logo.

Why full-bleed green: iPhone Contacts shows a circular crop of the square.
When the square’s corners are emerald, the circular avatar always keeps a
green rim. Pair with X-ABCROP-RECTANGLE=full in the vCard so iOS does not
auto-zoom onto the car icon and cut off the wording.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

NAVY = (7, 28, 56)
EMERALD = (47, 191, 74)
SIZE = 720


def trim_transparent(img: Image.Image, padding: int = 2) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(img.width, right + padding)
    bottom = min(img.height, bottom + padding)
    return img.crop((left, top, right, bottom))


def main() -> None:
    logo = trim_transparent(Image.open(PUBLIC / "logo.png").convert("RGBA"))

    # Emerald fills the entire square → circular contact crop keeps a green band.
    canvas = Image.new("RGBA", (SIZE, SIZE), (*EMERALD, 255))
    draw = ImageDraw.Draw(canvas)

    cx = cy = SIZE // 2
    # Thick green band = area between square edge and navy disc (~8% of size).
    band = max(28, int(SIZE * 0.08))
    inner_r = SIZE // 2 - band

    draw.ellipse(
        (cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r),
        fill=(*NAVY, 255),
    )

    # Wordmark fills most of the navy disc (icons + MY AIRPORT TAXI NI).
    max_w = int(inner_r * 2 * 0.92)
    max_h = int(inner_r * 2 * 0.92)
    scale = min(max_w / logo.width, max_h / logo.height)
    new_w = max(1, int(logo.width * scale))
    new_h = max(1, int(logo.height * scale))
    resized = logo.resize((new_w, new_h), Image.Resampling.LANCZOS)
    offset = ((SIZE - new_w) // 2, (SIZE - new_h) // 2)
    canvas.paste(resized, offset, resized)

    out = PUBLIC / "contact-photo.jpg"
    canvas.convert("RGB").save(out, "JPEG", quality=94, optimize=True)
    print(f"Wrote {out} ({SIZE}x{SIZE}, green band={band}px)")


if __name__ == "__main__":
    main()
