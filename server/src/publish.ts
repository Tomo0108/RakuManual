import type { Project } from "./types.js"

export interface PublishValidation {
  ok: boolean
  errors: string[]
}

export function validatePublish(project: Project): PublishValidation {
  const errors: string[] = []
  const sections = project.sections as Array<{
    id: string
    status?: string
    title?: string
    blocks?: Array<{ needsConfirm?: boolean }>
  }>

  if (sections.length === 0) {
    errors.push("マニュアルセクションが未生成です")
  }

  const unapproved = sections.filter((s) => s.status !== "approved")
  if (unapproved.length > 0) {
    errors.push(`未承認セクションが ${unapproved.length} 件あります`)
  }

  const needsConfirm = sections.reduce(
    (acc, s) => acc + (s.blocks?.filter((b) => b.needsConfirm).length ?? 0),
    0,
  )
  if (needsConfirm > 0) {
    errors.push(`「要確認」ブロックが ${needsConfirm} 件残っています`)
  }

  return { ok: errors.length === 0, errors }
}

export function applyPublish(project: Project, userName: string): Project {
  const now = new Date().toISOString().slice(0, 10)
  const publishedSections = structuredClone(project.sections)

  return {
    ...project,
    status: "published",
    updatedAt: now,
    publishedAt: new Date().toISOString(),
    publishedSections,
    history: [
      {
        id: `h-${Date.now()}`,
        date: `${now} ${new Date().toTimeString().slice(0, 5)}`,
        user: userName,
        action: "マニュアルを公開",
      },
      ...(project.history ?? []),
    ].slice(0, 200),
  }
}
