import type { ManualImage } from "@/lib/types"
import { uid } from "@/lib/project-utils"

const MAX_BYTES = 4 * 1024 * 1024
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])

/** 画像ファイルのバリデーション。問題なければ null */
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_TYPES.has(file.type)) {
    return "JPEG / PNG / GIF / WebP 形式の画像を選んでください"
  }
  if (file.size > MAX_BYTES) {
    return "画像は 4MB 以下にしてください"
  }
  return null
}

/** 画像ファイルを ManualImage に変換(data URL) */
export function readImageFile(file: File): Promise<ManualImage> {
  const error = validateImageFile(file)
  if (error) return Promise.reject(new Error(error))

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result
      if (typeof url !== "string") {
        reject(new Error("画像の読み込みに失敗しました"))
        return
      }
      resolve({
        id: uid("img"),
        url,
        caption: file.name.replace(/\.[^.]+$/, ""),
        mimeType: file.type,
        name: file.name,
      })
    }
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"))
    reader.readAsDataURL(file)
  })
}
