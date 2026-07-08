import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import pngToIco from "png-to-ico"
import sharp from "sharp"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const publicDir = resolve(root, "public")
const source = resolve(publicDir, "icon_rakumanual.png")

/** 角丸タイル付きのブランドアイコンを各サイズへ（透過を維持） */
async function writeRoundedIcon(size, filename) {
  const out = resolve(publicDir, filename)
  await sharp(source)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out)
  console.log(`Generated ${filename} (${size}x${size})`)
}

async function main() {
  await writeRoundedIcon(32, "favicon.png")
  await writeRoundedIcon(48, "favicon-48.png")
  await writeRoundedIcon(180, "apple-touch-icon.png")
  await writeRoundedIcon(192, "pwa-192.png")
  await writeRoundedIcon(512, "pwa-512.png")
  await writeRoundedIcon(512, "icon.png")

  const ico = await pngToIco([
    resolve(publicDir, "favicon-48.png"),
    resolve(publicDir, "pwa-192.png"),
  ])
  writeFileSync(resolve(publicDir, "favicon.ico"), ico)
  console.log("Generated favicon.ico")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
