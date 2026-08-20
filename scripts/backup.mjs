#!/usr/bin/env node
/**
 * DB/アップロードのバックアップ
 * Usage: node scripts/backup.mjs [outDir]
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, "..", "server", "data")
const outRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "..", "backups")
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const dest = path.join(outRoot, `rakumanual-${stamp}`)

fs.mkdirSync(dest, { recursive: true })
fs.mkdirSync(path.join(dest, "uploads"), { recursive: true })

const dbSrc = path.join(dataDir, "rakumanual.db")
if (fs.existsSync(dbSrc)) {
  fs.copyFileSync(dbSrc, path.join(dest, "rakumanual.db"))
  for (const suffix of ["-wal", "-shm"]) {
    const p = dbSrc + suffix
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dest, `rakumanual.db${suffix}`))
  }
}

const uploads = path.join(dataDir, "uploads")
if (fs.existsSync(uploads)) {
  copyDir(uploads, path.join(dest, "uploads"))
}

fs.writeFileSync(
  path.join(dest, "manifest.json"),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      source: dataDir,
      rpoNote: "パイロット目標 RPO 24h",
      rtoNote: "パイロット目標 RTO 1h",
    },
    null,
    2,
  ),
)

console.log(`Backup created: ${dest}`)

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dst, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}
