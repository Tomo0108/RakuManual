import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import pngToIco from "png-to-ico"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const buf = await pngToIco([
  resolve(root, "public/favicon-48.png"),
  resolve(root, "public/pwa-192.png"),
])
writeFileSync(resolve(root, "public/favicon.ico"), buf)
console.log("Generated public/favicon.ico")
