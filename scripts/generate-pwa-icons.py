#!/usr/bin/env python3
"""PWA用アイコンを白背景（不透過）で生成する"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "RakuManual_icon.png"
OUT = ROOT / "app" / "public"
BG = (255, 255, 255)


def composite_icon(size: int, logo_ratio: float, filename: str) -> None:
    logo = Image.open(SRC).convert("RGBA")
    canvas = Image.new("RGB", (size, size), BG)
    logo_size = int(size * logo_ratio)
    logo = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    offset = ((size - logo_size) // 2, (size - logo_size) // 2)
    canvas.paste(logo, offset, logo)
    canvas.save(OUT / filename, "PNG", optimize=True)


def main() -> None:
    composite_icon(32, 0.82, "favicon.png")
    composite_icon(48, 0.82, "favicon-48.png")
    composite_icon(180, 0.78, "apple-touch-icon.png")
    composite_icon(192, 0.72, "pwa-192.png")
    composite_icon(512, 0.72, "pwa-512.png")
    # maskable: セーフゾーン内に収める（中央80%）
    composite_icon(192, 0.58, "pwa-192-maskable.png")
    composite_icon(512, 0.58, "pwa-512-maskable.png")
    composite_icon(512, 0.72, "icon.png")
    print("Generated opaque PWA icons in", OUT)


if __name__ == "__main__":
    main()
