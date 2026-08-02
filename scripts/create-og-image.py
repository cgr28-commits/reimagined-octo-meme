"""Generate social share image (Open Graph) with readable branding on navy background."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

NAVY = (7, 28, 56)
GOLD = (201, 162, 39)
WHITE = (255, 255, 255)

OG_WIDTH = 1200
OG_HEIGHT = 630


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


def paste_centered(canvas: Image.Image, logo: Image.Image, y_offset: int = 0) -> None:
    x = (canvas.width - logo.width) // 2
    y = (canvas.height - logo.height) // 2 + y_offset
    canvas.paste(logo, (x, y), logo)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def main() -> None:
    logo = trim_transparent(Image.open(PUBLIC / "logo.png").convert("RGBA"))

    max_logo_w = int(OG_WIDTH * 0.62)
    max_logo_h = int(OG_HEIGHT * 0.52)
    scale = min(max_logo_w / logo.width, max_logo_h / logo.height)
    logo = logo.resize(
        (max(1, int(logo.width * scale)), max(1, int(logo.height * scale))),
        Image.Resampling.LANCZOS,
    )

    canvas = Image.new("RGB", (OG_WIDTH, OG_HEIGHT), NAVY)
    paste_centered(canvas, logo, y_offset=-28)

    draw = ImageDraw.Draw(canvas)
    tagline = "Premium Airport Transfers Across Northern Ireland"
    font = load_font(34)
    bbox = draw.textbbox((0, 0), tagline, font=font)
    text_w = bbox[2] - bbox[0]
    draw.text(
        ((OG_WIDTH - text_w) // 2, OG_HEIGHT - 88),
        tagline,
        fill=GOLD,
        font=font,
    )

    out = PUBLIC / "og-image.png"
    canvas.save(out, format="PNG", optimize=True)
    print(f"Created {out} ({OG_WIDTH}x{OG_HEIGHT})")

    # Square crop-friendly variant for apps that prefer 1:1 previews
    square_size = 1200
    square = Image.new("RGB", (square_size, square_size), NAVY)
    sq_logo = trim_transparent(Image.open(PUBLIC / "logo.png").convert("RGBA"))
    sq_scale = min(square_size * 0.72 / sq_logo.width, square_size * 0.55 / sq_logo.height)
    sq_logo = sq_logo.resize(
        (max(1, int(sq_logo.width * sq_scale)), max(1, int(sq_logo.height * sq_scale))),
        Image.Resampling.LANCZOS,
    )
    paste_centered(square, sq_logo, y_offset=40)
    sq_font = load_font(30)
    sq_tagline = "Premium Airport Transfers · Northern Ireland"
    sq_bbox = draw.textbbox((0, 0), sq_tagline, font=sq_font)
    sq_text_w = sq_bbox[2] - sq_bbox[0]
    sq_draw = ImageDraw.Draw(square)
    sq_draw.text(
        ((square_size - sq_text_w) // 2, square_size - 96),
        sq_tagline,
        fill=GOLD,
        font=sq_font,
    )
    square_out = PUBLIC / "og-image-square.png"
    square.save(square_out, format="PNG", optimize=True)
    print(f"Created {square_out} ({square_size}x{square_size})")


if __name__ == "__main__":
    main()
