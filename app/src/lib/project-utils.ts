import type { Project, ProjectStatus, ProjectTab } from "./types"

export const STATUS_BADGE: Record<ProjectStatus, string> = {
  hearing: "bg-amber-50 text-amber-700 border-amber-200",
  flow: "bg-sky-50 text-sky-700 border-sky-200",
  deepdive: "bg-violet-50 text-violet-700 border-violet-200",
  manual: "bg-orange-50 text-orange-700 border-orange-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
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

export function now(): string {
  const d = new Date()
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`
}
