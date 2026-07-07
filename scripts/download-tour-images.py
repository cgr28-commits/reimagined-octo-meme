"""Download and optimize tour landmark images from Unsplash."""

from __future__ import annotations

import io
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "images" / "tours"
MAX_WIDTH = 1400
JPEG_QUALITY = 82

# Unsplash photos — free to use under Unsplash License
TOUR_IMAGES: dict[str, tuple[str, str]] = {
    "giants-causeway.jpg": (
        "https://images.unsplash.com/photo-1632228871733-c7c723dc1478?auto=format&fit=crop&w=1600&q=80",
        "Hexagonal basalt columns at Giant's Causeway on the Causeway Coast",
    ),
    "belfast-city.jpg": (
        "https://images.unsplash.com/photo-1670684641789-dc26bf8b9313?auto=format&fit=crop&w=1600&q=80",
        "Belfast City Hall and city centre skyline",
    ),
    "game-of-thrones.jpg": (
        "https://images.unsplash.com/photo-1703237321942-c664c0cd1ae5?auto=format&fit=crop&w=1600&q=80",
        "Dark Hedges tree-lined avenue in County Antrim",
    ),
    "antrim-coast.jpg": (
        "https://images.unsplash.com/flagged/photo-1553080949-348c6b5a0541?auto=format&fit=crop&w=1600&q=80",
        "Dramatic Antrim Coast cliffs beside Dunluce Castle",
    ),
    "mourne-mountains.jpg": (
        "https://images.unsplash.com/photo-1630408925062-410088f5ac83?auto=format&fit=crop&w=1600&q=80",
        "Mourne Mountains rising above Newcastle on the County Down coast",
    ),
    "derry-londonderry.jpg": (
        "https://images.unsplash.com/photo-1718645738144-52b4b537a142?auto=format&fit=crop&w=1600&q=80",
        "View through Derry city walls overlooking the Walled City",
    ),
}


def optimize_image(data: bytes) -> bytes:
    img = Image.open(io.BytesIO(data))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    if img.width > MAX_WIDTH:
        ratio = MAX_WIDTH / img.width
        new_size = (MAX_WIDTH, int(img.height * ratio))
        img = img.resize(new_size, Image.Resampling.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return buf.getvalue()


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for filename, (url, _alt) in TOUR_IMAGES.items():
        out_path = OUT_DIR / filename
        print(f"Downloading {filename}...")
        req = urllib.request.Request(url, headers={"User-Agent": "my-airport-taxi-ni/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()

        optimized = optimize_image(raw)
        out_path.write_bytes(optimized)
        size_kb = len(optimized) / 1024
        print(f"  Saved {out_path.relative_to(ROOT)} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
