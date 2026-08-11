"""Generate site favicons from the square Google Business logo."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SOURCE = PUBLIC / "google-business-logo-1024.png"
APP_ICON = ROOT / "src" / "app" / "icon.png"


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")

    favicon = source.resize((256, 256), Image.Resampling.LANCZOS)
    favicon_32 = source.resize((32, 32), Image.Resampling.LANCZOS)
    favicon_48 = source.resize((48, 48), Image.Resampling.LANCZOS)
    favicon_16 = source.resize((16, 16), Image.Resampling.LANCZOS)

    favicon.save(PUBLIC / "favicon.png", optimize=True)
    favicon_32.save(PUBLIC / "favicon-32.png", optimize=True)

    favicon_16.save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (256, 256)],
        append_images=[favicon_32, favicon_48, favicon],
    )

    # Next.js App Router auto-serves src/app/icon.png as /icon — remove so it
    # cannot compete with the public favicons.
    if APP_ICON.exists():
        APP_ICON.unlink()

    print("Created favicons from google-business-logo-1024.png:")
    print("  public/favicon.png (256x256)")
    print("  public/favicon-32.png")
    print("  public/favicon.ico")
    print("  removed src/app/icon.png (if present)")


if __name__ == "__main__":
    main()
