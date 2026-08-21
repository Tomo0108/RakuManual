import type { AuthUser } from "@/lib/api/auth"

/** 更新履歴・版履歴に載せる操作者名 */
export function actorName(user?: AuthUser | null): string {
  return user?.name?.trim() || "不明なユーザー"
}
