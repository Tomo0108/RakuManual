import { apiUrl, getApiBase } from "@/lib/api/base"

/** 相対 /api/uploads を fetch 可能な URL に正規化 */
export function resolveMediaFetchUrl(url: string): string {
  if (!url) return url
  if (url.startsWith("data:") || url.startsWith("blob:") || /^https?:\/\//i.test(url)) {
    return url
  }
  if (url.startsWith("/api/")) {
    const rest = url.slice("/api".length) // e.g. /uploads/...
    return apiUrl(rest)
  }
  if (url.startsWith("/") && getApiBase().startsWith("http")) {
    try {
      const origin = new URL(getApiBase()).origin
      return `${origin}${url}`
    } catch {
      return url
    }
  }
  return url
}

/** PPTX/PDF 埋め込み用に data URL へ解決。失敗時 null */
export async function resolveImageDataUrl(url: string): Promise<string | null> {
  if (!url) return null
  if (url.startsWith("data:")) return url
  try {
    const fetchUrl = resolveMediaFetchUrl(url)
    const res = await fetch(fetchUrl, { credentials: "include" })
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.type.startsWith("image/") && blob.size === 0) return null
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
