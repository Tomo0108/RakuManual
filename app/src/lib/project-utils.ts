import type { Project, ProjectStatus, ProjectTab } from "./types"

export const STATUS_BADGE: Record<ProjectStatus, string> = {
  hearing: "status-hearing",
  flow: "status-flow",
  deepdive: "status-deepdive",
  manual: "status-manual",
  published: "status-published",
}

/** ステータスに応じた「続きから」タブ */
export const STATUS_TAB: Record<ProjectStatus, ProjectTab> = {
  hearing: "hearing",
  flow: "flow",
  deepdive: "deepdive",
  manual: "manual",
  published: "manual",
}

export function projectProgress(p: Project): number {
  const order: ProjectStatus[] = ["hearing", "flow", "deepdive", "manual", "published"]
  const idx = order.indexOf(p.status)
  return Math.round(((idx + (p.status === "published" ? 1 : 0.5)) / order.length) * 100)
}

export function uid(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 楽観ロック用の更新時刻（ISO）。日付粒度だと同日内の衝突を検出できない */
export function stamp(): string {
  return new Date().toISOString()
}

/** 一覧・バッジ向けに更新日時を短く表示 */
export function formatUpdatedAt(value: string): string {
  if (!value) return ""
  if (value.length >= 16 && value.includes("T")) {
    return `${value.slice(0, 10)} ${value.slice(11, 16)}`
  }
  return value.slice(0, 16)
}

export function now(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
