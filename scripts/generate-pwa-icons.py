#!/usr/bin/env python3
"""icon_rakumanual.png（透過・角丸）から PWA・favicon・アプリ内ロゴを生成する"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "app" / "public" / "icon_rakumanual.png"
OUT_PUBLIC = ROOT / "app" / "public"
OUT_LOGO = ROOT / "app" / "src" / "assets" / "logo.png"


def load_logo() -> Image.Image:
    if not SRC.exists():
        raise FileNotFoundError(f"Source icon not found: {SRC}")
    return Image.open(SRC).convert("RGBA")


def resize_icon(logo: Image.Image, size: int, filename: Path, scale: float = 1.0) -> None:
    """透過背景を保持したままリサイズ（白背景は合成しない）"""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    logo_size = max(1, int(size * scale))
    scaled = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    offset = ((size - logo_size) // 2, (size - logo_size) // 2)
    canvas.paste(scaled, offset, scaled)
    canvas.save(filename, "PNG", optimize=True)


def main() -> None:
    logo = load_logo()

    # 角丸アイコンをそのまま各サイズに縮小
    resize_icon(logo, 32, OUT_PUBLIC / "favicon.png")
    resize_icon(logo, 48, OUT_PUBLIC / "favicon-48.png")
    resize_icon(logo, 180, OUT_PUBLIC / "apple-touch-icon.png")
    resize_icon(logo, 192, OUT_PUBLIC / "pwa-192.png")
    resize_icon(logo, 512, OUT_PUBLIC / "pwa-512.png")
    resize_icon(logo, 512, OUT_PUBLIC / "icon.png")
    # maskable: 円形マスク対策でわずかに縮小（透過は維持）
    resize_icon(logo, 192, OUT_PUBLIC / "pwa-192-maskable.png", scale=0.88)
    resize_icon(logo, 512, OUT_PUBLIC / "pwa-512-maskable.png", scale=0.88)

    OUT_LOGO.parent.mkdir(parents=True, exist_ok=True)
    resize_icon(logo, 256, OUT_LOGO)

    print("Generated transparent icons:")
    for path in sorted(OUT_PUBLIC.glob("*.png")):
        if path.name != "icon_rakumanual.png":
            print(f"  {path.relative_to(ROOT)}")
    print(f"  {OUT_LOGO.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
