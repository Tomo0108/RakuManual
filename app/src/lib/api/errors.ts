import { ApiError } from "./client"

/** AI 生成系エラーをユーザー向け日本語メッセージに変換する */
export function describeAiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return `AI生成の予算上限を超えました。管理者に上限の見直しを依頼してください（${err.message}）`
    }
    if (err.status === 401) return "セッションが切れました。再度ログインしてください。"
    if (err.status === 504) return "AI生成がタイムアウトしました。時間をおいて再試行してください。"
    return err.message || fallback
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}
