import type {
  ManualRegenChoice,
  ManualSection,
  ManualSyncStatus,
  Project,
  FlowState,
  ManualBlock,
} from "@/lib/types"
import {
  buildUnplacedCandidates,
  computeManualImpact,
  documentableNodes,
  type UnplacedCandidate,
} from "@/lib/manual-impact"
import { appendRevisions, createRestorePoint, snapshotSection } from "@/lib/manual-version"
import { today, uid } from "@/lib/project-utils"

export interface RegenPlanItem {
  key: string
  kind: "section" | "unplaced" | "orphan"
  sectionId?: string
  stepId?: string
  title: string
  sectionNumber?: string
  syncStatus?: ManualSyncStatus
  status?: ManualSection["status"]
  defaultChoice: ManualRegenChoice
  /** unplaced 用 */
  candidate?: UnplacedCandidate
}

export function defaultRegenChoice(section: ManualSection): ManualRegenChoice {
  const sync = section.syncStatus ?? "ok"
  if (sync === "orphaned") return "archive"
  if (sync === "intentional_difference") return "keep"
  if (section.status === "approved") return "keep"
  if (section.version > 1 && sync !== "needs_review") return "keep"
  if (sync === "needs_review" || sync === "unplaced") return "regenerate"
  return "keep"
}

export function buildRegenPlan(project: Project): RegenPlanItem[] {
  const impact = computeManualImpact(project.flow, project.sections)
  const removed = new Set(impact.removedStepIds)
  const items: RegenPlanItem[] = []

  for (const section of project.sections) {
    const isOrphan =
      (section.syncStatus ?? "ok") === "orphaned" ||
      (!!section.stepId && removed.has(section.stepId))
    items.push({
      key: section.id,
      kind: isOrphan ? "orphan" : "section",
      sectionId: section.id,
      stepId: section.stepId,
      title: section.title,
      sectionNumber: section.sectionNumber,
      syncStatus: section.syncStatus,
      status: section.status,
      defaultChoice: isOrphan ? "archive" : defaultRegenChoice(section),
    })
  }

  for (const candidate of buildUnplacedCandidates(project.flow, project.sections)) {
    items.push({
      key: `unplaced-${candidate.stepId}`,
      kind: "unplaced",
      stepId: candidate.stepId,
      title: candidate.label,
      sectionNumber: candidate.sectionNumber,
      defaultChoice: "regenerate",
      candidate,
    })
  }

  return items
}

function mockBlocksForStep(label: string, sectionNumber?: string): ManualBlock[] {
  return [
    {
      id: uid("b"),
      type: "paragraph",
      text: `「${label}」の手順を説明します。（フロー変更に合わせて再生成）`,
    },
    {
      id: uid("b"),
      type: "step",
      text: `${sectionNumber ? `項番 ${sectionNumber}: ` : ""}${label}を実施します。`,
      needsConfirm: true,
    },
  ]
}

export interface ApplyRegenInput {
  project: Project
  choices: Record<string, ManualRegenChoice>
  user?: string
}

/**
 * 保持選択に従ってマニュアルを更新する。
 * keep の本文は不変。regenerate / 新規追加の前に復元ポイントを作成する。
 */
export function applyRegenChoices({
  project,
  choices,
  user = "山田 太郎",
}: ApplyRegenInput): Project {
  const plan = buildRegenPlan(project)
  const nodeById = new Map(documentableNodes(project.flow).map((n) => [n.id, n]))

  const changingSectionIds = plan
    .filter((item) => {
      const choice = choices[item.key] ?? item.defaultChoice
      if (item.kind === "unplaced") return choice === "regenerate"
      if (item.kind === "orphan") return choice === "archive" || choice === "regenerate"
      return choice === "regenerate"
    })
    .map((item) => item.sectionId)
    .filter((id): id is string => !!id)

  let next = changingSectionIds.length
    ? createRestorePoint(
        project,
        changingSectionIds,
        `フロー反映前 ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
        user,
      )
    : project

  const preSnapshots = changingSectionIds
    .map((id) => next.sections.find((s) => s.id === id))
    .filter((s): s is ManualSection => !!s)
    .map((s) => snapshotSection(s, { reason: "flow_sync", user }))

  if (preSnapshots.length) {
    next = appendRevisions(next, preSnapshots)
  }

  let sections = [...next.sections]

  for (const item of plan) {
    const choice = choices[item.key] ?? item.defaultChoice

    if (item.kind === "unplaced") {
      if (choice !== "regenerate" || !item.candidate) continue
      const c = item.candidate
      const node = nodeById.get(c.stepId)
      sections.push({
        id: uid("s"),
        title: c.label,
        sectionNumber: c.sectionNumber,
        stepId: c.stepId,
        status: "draft",
        version: 1,
        updatedAt: today(),
        blocks: mockBlocksForStep(c.label, c.sectionNumber),
        syncStatus: "ok",
        sourceSnapshot: node
          ? {
              label: node.data.label,
              kind: node.data.kind,
              sectionNumber: node.data.sectionNumber,
            }
          : { label: c.label, sectionNumber: c.sectionNumber },
      })
      continue
    }

    if (!item.sectionId) continue
    const idx = sections.findIndex((s) => s.id === item.sectionId)
    if (idx < 0) continue
    const section = sections[idx]!

    if (choice === "keep") {
      // 本文不変。orphan を意図的に残す場合は intentional
      if (item.kind === "orphan") {
        sections[idx] = { ...section, syncStatus: "intentional_difference" }
      }
      continue
    }

    if (choice === "archive") {
      sections = sections.filter((s) => s.id !== section.id)
      continue
    }

    // regenerate
    const node = section.stepId ? nodeById.get(section.stepId) : undefined
    const label = node?.data.label ?? section.title
    sections[idx] = {
      ...section,
      title: label,
      sectionNumber: node?.data.sectionNumber ?? section.sectionNumber,
      status: "draft",
      version: section.version + 1,
      updatedAt: today(),
      blocks: mockBlocksForStep(label, node?.data.sectionNumber ?? section.sectionNumber),
      syncStatus: "ok",
      sourceSnapshot: node
        ? {
            label: node.data.label,
            kind: node.data.kind,
            sectionNumber: node.data.sectionNumber,
          }
        : section.sourceSnapshot,
    }
  }

  return {
    ...next,
    sections,
    updatedAt: today(),
  }
}

export function placeUnplacedSection(
  sections: ManualSection[],
  candidate: UnplacedCandidate,
  flow: FlowState,
  insertAfterSectionId: string | null,
): ManualSection[] {
  const node = documentableNodes(flow).find((n) => n.id === candidate.stepId)
  const created: ManualSection = {
    id: uid("s"),
    title: candidate.label,
    sectionNumber: candidate.sectionNumber,
    stepId: candidate.stepId,
    status: "draft",
    version: 1,
    updatedAt: today(),
    blocks: [
      {
        id: uid("b"),
        type: "paragraph",
        text: `項番 ${candidate.sectionNumber ?? "—"} のセクションです。内容は未生成です。`,
      },
    ],
    syncStatus: "ok",
    sourceSnapshot: node
      ? {
          label: node.data.label,
          kind: node.data.kind,
          sectionNumber: node.data.sectionNumber,
        }
      : { label: candidate.label, sectionNumber: candidate.sectionNumber },
  }

  if (!insertAfterSectionId) return [...sections, created]
  const idx = sections.findIndex((s) => s.id === insertAfterSectionId)
  if (idx < 0) return [...sections, created]
  const next = [...sections]
  next.splice(idx + 1, 0, created)
  return next
}

export function rebindOrphanSection(
  sections: ManualSection[],
  sectionId: string,
  newStepId: string,
  flow: FlowState,
): ManualSection[] {
  const node = documentableNodes(flow).find((n) => n.id === newStepId)
  if (!node) return sections
  return sections.map((s) =>
    s.id === sectionId
      ? {
          ...s,
          stepId: newStepId,
          syncStatus: "needs_review" as const,
          sourceSnapshot: {
            label: node.data.label,
            kind: node.data.kind,
            sectionNumber: node.data.sectionNumber,
          },
        }
      : s,
  )
}
