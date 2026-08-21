import type { ManualImage } from "@/lib/types"
import { uid } from "@/lib/project-utils"
import { apiUpload } from "@/lib/api/client"

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

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result
      if (typeof url !== "string") {
        reject(new Error("画像の読み込みに失敗しました"))
        return
      }
      resolve(url)
    }
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"))
    reader.readAsDataURL(file)
  })
}

/** 画像ファイルを ManualImage に変換。projectId があれば API へアップロード */
export async function readImageFile(file: File, projectId?: string): Promise<ManualImage> {
  const error = validateImageFile(file)
  if (error) throw new Error(error)

  // キャプションはファイル名を流用しない（公開・PDF にファイル名が載るのを防ぐ）
  const caption = ""
  if (projectId) {
    try {
      const uploaded = await apiUpload(`/projects/${projectId}/images`, file)
      return {
        id: uid("img"),
        url: uploaded.url,
        storageKey: uploaded.storageKey,
        caption,
        mimeType: uploaded.mimeType,
        name: uploaded.name,
      }
    } catch {
      /* API 未起動時は data URL にフォールバック */
    }
  }

  const url = await readAsDataUrl(file)
  return {
    id: uid("img"),
    url,
    caption,
    mimeType: file.type,
    name: file.name,
  }
}
