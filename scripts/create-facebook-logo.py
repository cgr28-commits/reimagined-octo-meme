"""Create Facebook Business Page profile + cover assets from brand logos.

Facebook profile pictures are shown in a circle. Use extra padding so the
logo stays inside the circular crop on desktop and mobile.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

NAVY = (7, 28, 56)
WHITE = (255, 255, 255)
EMERALD = (47, 191, 74)

# Extra padding vs Google Business (~12%) so circular crop does not clip tips.
PROFILE_PADDING_RATIO = 0.18
PROFILE_SIZES = (400, 1080)
COVER_SIZE = (1640, 624)  # 2x Facebook's 820x312 recommendation


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


def composite_profile(
    logo: Image.Image,
    *,
    canvas_size: int,
    background: tuple[int, int, int],
    padding_ratio: float = PROFILE_PADDING_RATIO,
) -> Image.Image:
    logo = trim_transparent(logo.convert("RGBA"))
    pad = int(canvas_size * padding_ratio)
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


def circular_preview(square: Image.Image) -> Image.Image:
    """Preview how the profile logo looks inside Facebook's circle crop."""
    size = square.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    rgba = square.convert("RGBA")
    rgba.putalpha(mask)
    # Checkerboard-free solid so preview is easy to inspect
    out = Image.new("RGBA", (size, size), (30, 30, 30, 255))
    out.paste(rgba, (0, 0), rgba)
    return out.convert("RGB")


def load_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def create_cover(logo: Image.Image) -> Image.Image:
    """Wide cover: logo + tagline centred in Facebook's mobile-safe zone."""
    width, height = COVER_SIZE
    canvas = Image.new("RGB", (width, height), NAVY)

    logo = trim_transparent(logo.convert("RGBA"))
    # Facebook crops left/right on mobile; keep content in the centre ~640/820 band.
    max_h = int(height * 0.70)
    max_w = int(width * 0.32)
    scale = min(max_w / logo.width, max_h / logo.height)
    new_w = max(1, int(logo.width * scale))
    new_h = max(1, int(logo.height * scale))
    resized = logo.resize((new_w, new_h), Image.Resampling.LANCZOS)

    draw = ImageDraw.Draw(canvas)
    title_font = load_font(52)
    subtitle_font = load_font(28)

    title = "Premium Airport Transfers"
    subtitle = "Across Northern Ireland · 24/7"
    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    subtitle_bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    title_w = title_bbox[2] - title_bbox[0]
    title_h = title_bbox[3] - title_bbox[1]
    subtitle_h = subtitle_bbox[3] - subtitle_bbox[1]
    gap = 14
    text_block_h = title_h + gap + subtitle_h
    text_block_w = max(title_w, subtitle_bbox[2] - subtitle_bbox[0])

    group_gap = int(width * 0.035)
    group_w = new_w + group_gap + text_block_w
    group_x = (width - group_w) // 2

    logo_x = group_x
    logo_y = (height - new_h) // 2
    canvas.paste(resized, (logo_x, logo_y), resized)

    text_x = logo_x + new_w + group_gap
    text_y = (height - text_block_h) // 2

    draw.text((text_x, text_y), title, fill=WHITE, font=title_font)
    draw.text(
        (text_x, text_y + title_h + gap),
        subtitle,
        fill=EMERALD,
        font=subtitle_font,
    )

    line_y = text_y + text_block_h + 24
    draw.rounded_rectangle(
        (text_x, line_y, text_x + 120, line_y + 4),
        radius=2,
        fill=EMERALD,
    )

    return canvas


def main() -> None:
    logo_light = Image.open(PUBLIC / "logo-light.png")
    logo_dark = Image.open(PUBLIC / "logo.png")

    # White profile (primary) — reads clearly in Facebook feeds
    primary = composite_profile(logo_light, canvas_size=1080, background=WHITE)
    out_primary = PUBLIC / "facebook-profile-logo.png"
    primary.save(out_primary, optimize=True)

    out_400 = PUBLIC / "facebook-profile-logo-400.png"
    composite_profile(logo_light, canvas_size=400, background=WHITE).save(
        out_400, optimize=True
    )

    # Navy alternate matching the website
    out_navy = PUBLIC / "facebook-profile-logo-navy.png"
    navy = composite_profile(logo_dark, canvas_size=1080, background=NAVY)
    navy.save(out_navy, optimize=True)

    cover = create_cover(logo_dark)
    out_cover = PUBLIC / "facebook-cover.png"
    cover.save(out_cover, optimize=True)

    # Optional circular crop preview for review (not uploaded to Facebook)
    artifacts = Path("/opt/cursor/artifacts")
    if artifacts.is_dir():
        preview_path = artifacts / "facebook-profile-circle-preview.png"
        circular_preview(primary).save(preview_path, optimize=True)
        print(f"Circle preview:        {preview_path}")

    print(f"Profile (upload this): {out_primary} ({primary.size[0]}x{primary.size[1]})")
    print(f"Profile 400px:         {out_400} (400x400)")
    print(f"Profile navy alt:      {out_navy} (1080x1080)")
    print(f"Cover (upload this):   {out_cover} ({cover.size[0]}x{cover.size[1]})")


if __name__ == "__main__":
    main()
