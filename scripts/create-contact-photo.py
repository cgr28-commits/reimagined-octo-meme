"""Build public/contact-photo.jpg for the phone contact card.

Matches the /contact/ page look: navy disc, emerald ring, full logo with
“MY AIRPORT TAXI NI” wording. Sized so iOS/Android circular crop keeps
the ring and text.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

NAVY = (7, 28, 56)
EMERALD = (47, 191, 74)
SIZE = 720


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


def main() -> None:
    logo = trim_transparent(Image.open(PUBLIC / "logo.png").convert("RGBA"))

    canvas = Image.new("RGBA", (SIZE, SIZE), (*NAVY, 255))
    draw = ImageDraw.Draw(canvas)

    # Outer emerald ring + soft outer glow, matching the site contact card.
    cx = cy = SIZE // 2
    outer_r = int(SIZE * 0.48)
    ring_width = max(10, int(SIZE * 0.028))
    glow_width = max(6, int(SIZE * 0.018))

    # Soft glow
    for i in range(glow_width, 0, -1):
        alpha = int(40 * (i / glow_width))
        draw.ellipse(
            (
                cx - outer_r - i,
                cy - outer_r - i,
                cx + outer_r + i,
                cy + outer_r + i,
            ),
            outline=(*EMERALD, alpha),
            width=2,
        )

    # Solid emerald ring
    draw.ellipse(
        (cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r),
        outline=(*EMERALD, 255),
        width=ring_width,
    )

    # Inner navy disc so the logo sits on brand colour
    inner_r = outer_r - ring_width - 4
    draw.ellipse(
        (cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r),
        fill=(*NAVY, 255),
    )

    # Fit full wordmark logo inside the ring with breathing room
    max_w = int(inner_r * 2 * 0.78)
    max_h = int(inner_r * 2 * 0.78)
    scale = min(max_w / logo.width, max_h / logo.height)
    new_w = max(1, int(logo.width * scale))
    new_h = max(1, int(logo.height * scale))
    resized = logo.resize((new_w, new_h), Image.Resampling.LANCZOS)
    offset = ((SIZE - new_w) // 2, (SIZE - new_h) // 2)
    canvas.paste(resized, offset, resized)

    out = PUBLIC / "contact-photo.jpg"
    canvas.convert("RGB").save(out, "JPEG", quality=92, optimize=True)
    print(f"Wrote {out} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    main()
