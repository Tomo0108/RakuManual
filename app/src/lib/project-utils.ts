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

export function now(): string {
  const d = new Date()
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`
}
