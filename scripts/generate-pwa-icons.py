#!/usr/bin/env python3
"""icon_rakumanual.png から PWA・favicon・アプリ内ロゴを生成する"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "app" / "public" / "icon_rakumanual.png"
OUT_PUBLIC = ROOT / "app" / "public"
OUT_LOGO = ROOT / "app" / "src" / "assets" / "logo.png"
BG = (255, 255, 255)


def load_logo() -> Image.Image:
    if not SRC.exists():
        raise FileNotFoundError(f"Source icon not found: {SRC}")
    return Image.open(SRC).convert("RGBA")


def composite_icon(logo: Image.Image, size: int, logo_ratio: float, filename: Path) -> None:
    canvas = Image.new("RGB", (size, size), BG)
    logo_size = int(size * logo_ratio)
    scaled = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    offset = ((size - logo_size) // 2, (size - logo_size) // 2)
    canvas.paste(scaled, offset, scaled)
    canvas.save(filename, "PNG", optimize=True)


def save_logo(logo: Image.Image, size: int, filename: Path) -> None:
    filename.parent.mkdir(parents=True, exist_ok=True)
    resized = logo.resize((size, size), Image.Resampling.LANCZOS)
    # UI ロゴは透過を保持（角丸アイコンをそのまま表示）
    resized.save(filename, "PNG", optimize=True)


def main() -> None:
    logo = load_logo()

    composite_icon(logo, 32, 0.82, OUT_PUBLIC / "favicon.png")
    composite_icon(logo, 48, 0.82, OUT_PUBLIC / "favicon-48.png")
    composite_icon(logo, 180, 0.78, OUT_PUBLIC / "apple-touch-icon.png")
    composite_icon(logo, 192, 0.72, OUT_PUBLIC / "pwa-192.png")
    composite_icon(logo, 512, 0.72, OUT_PUBLIC / "pwa-512.png")
    # maskable: セーフゾーン内に収める（中央80%）
    composite_icon(logo, 192, 0.58, OUT_PUBLIC / "pwa-192-maskable.png")
    composite_icon(logo, 512, 0.58, OUT_PUBLIC / "pwa-512-maskable.png")
    composite_icon(logo, 512, 0.72, OUT_PUBLIC / "icon.png")

    save_logo(logo, 256, OUT_LOGO)

    print("Generated icons:")
    for path in sorted(OUT_PUBLIC.glob("*.png")):
        if path.name != "icon_rakumanual.png":
            print(f"  {path.relative_to(ROOT)}")
    print(f"  {OUT_LOGO.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
