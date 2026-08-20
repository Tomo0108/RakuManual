#!/usr/bin/env node
/**
 * バックアップからのリストア（API停止中に実行）
 * Usage: node scripts/restore.mjs <backupDir>
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const backupDir = process.argv[2]
if (!backupDir) {
  console.error("Usage: node scripts/restore.mjs <backupDir>")
  process.exit(1)
}
const src = path.resolve(backupDir)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, "..", "server", "data")

if (!fs.existsSync(path.join(src, "rakumanual.db"))) {
  console.error("rakumanual.db not found in backup")
  process.exit(1)
}

fs.mkdirSync(dataDir, { recursive: true })
fs.copyFileSync(path.join(src, "rakumanual.db"), path.join(dataDir, "rakumanual.db"))
for (const suffix of ["-wal", "-shm"]) {
  const p = path.join(src, `rakumanual.db${suffix}`)
  const d = path.join(dataDir, `rakumanual.db${suffix}`)
  if (fs.existsSync(p)) fs.copyFileSync(p, d)
  else if (fs.existsSync(d)) fs.unlinkSync(d)
}

const uploadsSrc = path.join(src, "uploads")
const uploadsDst = path.join(dataDir, "uploads")
if (fs.existsSync(uploadsSrc)) {
  fs.rmSync(uploadsDst, { recursive: true, force: true })
  copyDir(uploadsSrc, uploadsDst)
}

console.log(`Restored from ${src} -> ${dataDir}`)
console.log("Restart API server to apply.")

function copyDir(a, b) {
  fs.mkdirSync(b, { recursive: true })
  for (const entry of fs.readdirSync(a, { withFileTypes: true })) {
    const from = path.join(a, entry.name)
    const to = path.join(b, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}
