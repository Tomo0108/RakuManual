/**
 * 短命の署名付きダウンロード用エクスポート成果物ストア
 */

import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { UPLOADS_DIR } from "../db.js"

const EXPORT_DIR = path.join(UPLOADS_DIR, "exports")

export interface StoredExport {
  token: string
  userId: string
  projectId: string
  filename: string
  mimeType: string
  filePath: string
  expiresAt: number
  downloadUrl: string
}

const memory = new Map<string, StoredExport>()

function prune() {
  const now = Date.now()
  for (const [token, item] of memory) {
    if (item.expiresAt <= now) {
      memory.delete(token)
      try {
        fs.unlinkSync(item.filePath)
      } catch {
        /* ignore */
      }
    }
  }
}

export function storeExportArtifact(input: {
  userId: string
  projectId: string
  filename: string
  mimeType: string
  bytes: Buffer
  ttlMs?: number
}): StoredExport {
  fs.mkdirSync(EXPORT_DIR, { recursive: true })
  prune()
  const token = crypto.randomBytes(24).toString("hex")
  const filePath = path.join(EXPORT_DIR, `${token}.bin`)
  fs.writeFileSync(filePath, input.bytes)
  const expiresAt = Date.now() + (input.ttlMs ?? 15 * 60 * 1000)
  const item: StoredExport = {
    token,
    userId: input.userId,
    projectId: input.projectId,
    filename: input.filename,
    mimeType: input.mimeType,
    filePath,
    expiresAt,
    downloadUrl: `/api/exports/download/${token}`,
  }
  memory.set(token, item)
  return item
}

export function getExportArtifact(token: string): StoredExport | null {
  prune()
  const item = memory.get(token)
  if (!item) return null
  if (item.expiresAt <= Date.now()) {
    memory.delete(token)
    return null
  }
  return item
}
