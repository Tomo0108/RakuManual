/**
 * API ベース URL
 * - ローカル / 同一オリジン: "/api"（Vite または Vercel rewrite 経由）
 * - 分離デプロイ: VITE_API_BASE_URL（例 https://api.example.com/api）
 */
export function getApiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  if (!raw) return "/api"
  return raw.replace(/\/+$/, "")
}

export function apiUrl(path: string): string {
  const base = getApiBase()
  const p = path.startsWith("/") ? path : `/${path}`
  return `${base}${p}`
}
