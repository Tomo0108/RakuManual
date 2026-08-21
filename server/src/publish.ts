import type { Project } from "./types.js"
import { findCaptionIssues } from "./caption-quality.js"

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
    blocks?: Array<{
      id: string
      needsConfirm?: boolean
      image?: { url?: string; caption?: string; name?: string }
    }>
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

  const captionIssues = findCaptionIssues(sections)
  if (captionIssues.length > 0) {
    const empty = captionIssues.filter((i) => i.kind === "empty").length
    const filename = captionIssues.filter((i) => i.kind === "filename_like").length
    const parts: string[] = []
    if (empty > 0) parts.push(`図の説明未入力 ${empty} 件`)
    if (filename > 0) parts.push(`ファイル名のまま ${filename} 件`)
    errors.push(`キャプション品質: ${parts.join("、")}（マニュアルタブで修正してください）`)
  }

  return { ok: errors.length === 0, errors }
}

export function applyPublish(project: Project, userName: string): Project {
  const now = new Date().toISOString().slice(0, 10)
  const publishedSections = structuredClone(project.sections)

  return {
    ...project,
    status: "published",
    // 明示指定が無い新規公開はメンバー＋オーナーのみに絞る
    visibility: project.visibility ?? "members",
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
