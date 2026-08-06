"""Build public/contact-photo.jpg for the phone contact card.

Matches the /contact/ page look: navy disc, emerald ring, full logo with
“MY AIRPORT TAXI NI” wording.

Sized for iOS/Android circular + subject crop: keep ring and wordmark inside
the centre ~70% so Contacts does not zoom onto the car icon alone.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

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

    cx = cy = SIZE // 2
    # Keep ring well inside the circular crop (iOS clips near the edge).
    outer_r = int(SIZE * 0.42)
    ring_width = max(18, int(SIZE * 0.045))

    # Soft emerald glow outside the ring
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    for i in range(1, 16):
        glow_draw.ellipse(
            (
                cx - outer_r - i,
                cy - outer_r - i,
                cx + outer_r + i,
                cy + outer_r + i,
            ),
            outline=(*EMERALD, max(8, 48 - i * 3)),
            width=2,
        )
    canvas = Image.alpha_composite(canvas, glow.filter(ImageFilter.GaussianBlur(2)))
    draw = ImageDraw.Draw(canvas)

    # Inner navy disc first
    inner_r = outer_r - ring_width - 2
    draw.ellipse(
        (cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r),
        fill=(*NAVY, 255),
    )

    # Compact wordmark — larger, centred — so circular/subject crop keeps text
    max_w = int(inner_r * 2 * 0.86)
    max_h = int(inner_r * 2 * 0.86)
    scale = min(max_w / logo.width, max_h / logo.height)
    new_w = max(1, int(logo.width * scale))
    new_h = max(1, int(logo.height * scale))
    resized = logo.resize((new_w, new_h), Image.Resampling.LANCZOS)
    offset = ((SIZE - new_w) // 2, (SIZE - new_h) // 2)
    canvas.paste(resized, offset, resized)

    # Thick emerald ring on top so logo never covers it
    draw = ImageDraw.Draw(canvas)
    draw.ellipse(
        (cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r),
        outline=(*EMERALD, 255),
        width=ring_width,
    )

    out = PUBLIC / "contact-photo.jpg"
    canvas.convert("RGB").save(out, "JPEG", quality=94, optimize=True)
    print(f"Wrote {out} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    main()
