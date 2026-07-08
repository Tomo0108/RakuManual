import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import pngToIco from "png-to-ico"
import sharp from "sharp"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const publicDir = resolve(root, "public")
const source = resolve(publicDir, "icon_rakumanual.png")

/** タイルの下地色（ソースの白タイルと揃える） */
const TILE_BG = { r: 253, g: 253, b: 253, alpha: 1 }
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

/**
 * アイコンを生成する。
 * - ratio: キャンバスに対するロゴの占有率（余白調整）
 * - bg: 背景色（null で透過）
 */
async function makeIcon(size, filename, { ratio = 1, bg = null } = {}) {
  const inner = Math.round(size * ratio)
  const logo = await sharp(source)
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer()

  await sharp({
    create: { width: size, height: size, channels: 4, background: bg ?? TRANSPARENT },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(resolve(publicDir, filename))

  console.log(`Generated ${filename} (${size}x${size}${bg ? " opaque" : " transparent"})`)
}

/** favicon.ico 用の不透過バッファ */
async function opaqueBuffer(size, ratio) {
  const inner = Math.round(size * ratio)
  const logo = await sharp(source)
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer()
  return sharp({
    create: { width: size, height: size, channels: 4, background: TILE_BG },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer()
}

async function main() {
  // ブラウザタブ（透過角丸そのまま）
  await makeIcon(32, "favicon.png", { ratio: 1 })
  await makeIcon(48, "favicon-48.png", { ratio: 1 })

  // 一般 PWA アイコン（"any"）: 少し余白を持たせて通常サイズ感に
  await makeIcon(192, "pwa-192.png", { ratio: 0.92 })
  await makeIcon(512, "pwa-512.png", { ratio: 0.92 })
  await makeIcon(512, "icon.png", { ratio: 0.92 })

  // iOS ホーム画面（不透過・iOS 側で角丸マスク）
  await makeIcon(180, "apple-touch-icon.png", { ratio: 0.86, bg: TILE_BG })

  // maskable（Windows/Android が OS 側で角丸マスクを適用）
  // セーフゾーン内（中央80%）にロゴを収め、四角タイル化を防ぐ
  await makeIcon(192, "pwa-192-maskable.png", { ratio: 0.8, bg: TILE_BG })
  await makeIcon(512, "pwa-512-maskable.png", { ratio: 0.8, bg: TILE_BG })

  // Windows タスクバー等向け favicon.ico（不透過）
  const ico = await pngToIco([
    await opaqueBuffer(48, 0.86),
    await opaqueBuffer(256, 0.86),
  ])
  writeFileSync(resolve(publicDir, "favicon.ico"), ico)
  console.log("Generated favicon.ico")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
