import type {
  ManualBlock,
  ManualRevisionReason,
  ManualSection,
  ManualSectionRevision,
  ManualRestorePoint,
  Project,
} from "@/lib/types"
import { uid } from "@/lib/project-utils"

const DEFAULT_MAX_PER_SECTION = 20

function cloneBlocks(blocks: ManualBlock[]): ManualBlock[] {
  return blocks.map((b) => ({
    ...b,
    image: b.image ? { ...b.image } : undefined,
  }))
}

export function snapshotSection(
  section: ManualSection,
  meta: { reason: ManualRevisionReason; user: string; savedAt?: string },
): ManualSectionRevision {
  return {
    id: uid("rev"),
    sectionId: section.id,
    version: section.version,
    savedAt: meta.savedAt ?? new Date().toISOString().slice(0, 16).replace("T", " "),
    savedBy: meta.user,
    reason: meta.reason,
    title: section.title,
    sectionNumber: section.sectionNumber,
    majorTitle: section.majorTitle,
    mediumTitle: section.mediumTitle,
    stepId: section.stepId,
    status: section.status,
    syncStatus: section.syncStatus,
    blocks: cloneBlocks(section.blocks),
  }
}

function trimRevisions(
  revisions: ManualSectionRevision[],
  maxPerSection: number,
): ManualSectionRevision[] {
  const bySection = new Map<string, ManualSectionRevision[]>()
  for (const rev of revisions) {
    const list = bySection.get(rev.sectionId) ?? []
    list.push(rev)
    bySection.set(rev.sectionId, list)
  }
  const kept: ManualSectionRevision[] = []
  for (const list of bySection.values()) {
    const sorted = [...list].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    kept.push(...sorted.slice(0, maxPerSection))
  }
  return kept.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export function appendRevision(
  project: Project,
  revision: ManualSectionRevision,
  options?: { maxPerSection?: number },
): Project {
  const maxPerSection = options?.maxPerSection ?? DEFAULT_MAX_PER_SECTION
  const next = [revision, ...(project.sectionRevisions ?? [])]
  return {
    ...project,
    sectionRevisions: trimRevisions(next, maxPerSection),
  }
}

export function appendRevisions(
  project: Project,
  revisions: ManualSectionRevision[],
  options?: { maxPerSection?: number },
): Project {
  return revisions.reduce((p, rev) => appendRevision(p, rev, options), project)
}

export function createRestorePoint(
  project: Project,
  sectionIds: string[],
  label: string,
  user: string,
): Project {
  const revisions: ManualSectionRevision[] = []
  let next = project
  for (const sectionId of sectionIds) {
    const section = next.sections.find((s) => s.id === sectionId)
    if (!section) continue
    const rev = snapshotSection(section, { reason: "checkpoint", user })
    revisions.push(rev)
    next = appendRevision(next, rev)
  }
  if (revisions.length === 0) return project
  const point: ManualRestorePoint = {
    id: uid("rp"),
    createdAt: revisions[0]!.savedAt,
    createdBy: user,
    label,
    revisionIds: revisions.map((r) => r.id),
  }
  return {
    ...next,
    restorePoints: [point, ...(next.restorePoints ?? [])],
  }
}

function sectionFromRevision(revision: ManualSectionRevision, bumpVersion: number): ManualSection {
  return {
    id: revision.sectionId,
    title: revision.title,
    sectionNumber: revision.sectionNumber,
    majorTitle: revision.majorTitle,
    mediumTitle: revision.mediumTitle,
    stepId: revision.stepId,
    status: revision.status,
    version: bumpVersion,
    updatedAt: new Date().toISOString().slice(0, 10),
    blocks: cloneBlocks(revision.blocks),
    syncStatus: revision.syncStatus,
    sourceSnapshot: undefined,
  }
}

/** 復元前に現行を snapshot(reason: restore) してから差し替え */
export function restoreSection(
  project: Project,
  sectionId: string,
  revisionId: string,
  user: string,
): Project {
  const section = project.sections.find((s) => s.id === sectionId)
  const revision = (project.sectionRevisions ?? []).find((r) => r.id === revisionId)
  if (!section || !revision || revision.sectionId !== sectionId) return project

  const before = snapshotSection(section, { reason: "restore", user })
  let next = appendRevision(project, before)
  const restored = sectionFromRevision(revision, section.version + 1)
  next = {
    ...next,
    sections: next.sections.map((s) => (s.id === sectionId ? restored : s)),
  }
  return next
}

export function restorePoint(
  project: Project,
  restorePointId: string,
  user: string,
): Project {
  const point = (project.restorePoints ?? []).find((p) => p.id === restorePointId)
  if (!point) return project
  const revs = (project.sectionRevisions ?? []).filter((r) => point.revisionIds.includes(r.id))
  let next = project
  for (const rev of revs) {
    next = restoreSection(next, rev.sectionId, rev.id, user)
  }
  return next
}

export function revisionsForSection(
  project: Project,
  sectionId: string,
): ManualSectionRevision[] {
  return (project.sectionRevisions ?? [])
    .filter((r) => r.sectionId === sectionId)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export const REVISION_REASON_LABEL: Record<ManualRevisionReason, string> = {
  generate: "生成",
  edit: "編集",
  approve: "承認",
  regenerate: "再生成",
  restore: "復元前",
  flow_sync: "フロー反映",
  checkpoint: "チェックポイント",
}
