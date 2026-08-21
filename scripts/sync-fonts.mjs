#!/usr/bin/env node
/**
 * assets/fonts → app/public/fonts へ同期（PDF 埋め込み用）。
 * Meiryo 等を assets に置いた場合にビルド・ローカル双方で使えるようにする。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const srcDir = path.join(root, "assets", "fonts")
const destDir = path.join(root, "app", "public", "fonts")

if (!fs.existsSync(srcDir)) {
  process.exit(0)
}

fs.mkdirSync(destDir, { recursive: true })
for (const name of fs.readdirSync(srcDir)) {
  if (!/\.ttf$/i.test(name)) continue
  const from = path.join(srcDir, name)
  const to = path.join(destDir, name)
  fs.copyFileSync(from, to)
  console.log(`fonts: synced ${name}`)
}
