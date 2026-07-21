import type {
  FlowNode,
  FlowState,
  ManualSection,
  ManualSourceSnapshot,
  ManualSyncStatus,
} from "@/lib/types"

export interface ManualImpact {
  addedStepIds: string[]
  removedStepIds: string[]
  labelChanged: Array<{
    stepId: string
    sectionId: string
    from: string
    to: string
  }>
  numberChanged: Array<{
    stepId: string
    sectionId: string
    from?: string
    to?: string
  }>
  /** intentional を除く要対応件数 */
  reviewCount: number
}

export interface UnplacedCandidate {
  stepId: string
  label: string
  sectionNumber?: string
  kind: FlowNode["data"]["kind"]
}

/** マニュアル化対象ノード（process / decision） */
export function documentableNodes(flow: FlowState): FlowNode[] {
  return flow.nodes.filter((n) => n.data.kind === "process" || n.data.kind === "decision")
}

function snapshotFromNode(node: FlowNode): ManualSourceSnapshot {
  return {
    label: node.data.label,
    kind: node.data.kind,
    sectionNumber: node.data.sectionNumber,
  }
}

function baselineLabel(section: ManualSection): string {
  return section.sourceSnapshot?.label ?? section.title
}

function resolveSyncStatus(section: ManualSection): ManualSyncStatus {
  return section.syncStatus ?? "ok"
}

/** A1: 検知のみ。本文は変更しない */
export function computeManualImpact(
  flow: FlowState,
  sections: ManualSection[],
): ManualImpact {
  const nodes = documentableNodes(flow)
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const sectionsWithStep = sections.filter((s) => s.stepId)

  const sectionStepIds = new Set(sectionsWithStep.map((s) => s.stepId!))
  const addedStepIds = nodes.filter((n) => !sectionStepIds.has(n.id)).map((n) => n.id)

  const removedStepIds: string[] = []
  const labelChanged: ManualImpact["labelChanged"] = []
  const numberChanged: ManualImpact["numberChanged"] = []

  for (const section of sectionsWithStep) {
    const stepId = section.stepId!
    const node = nodeById.get(stepId)
    if (!node) {
      removedStepIds.push(stepId)
      continue
    }
    const fromLabel = baselineLabel(section)
    if (fromLabel !== node.data.label) {
      labelChanged.push({
        stepId,
        sectionId: section.id,
        from: fromLabel,
        to: node.data.label,
      })
    }
    const fromNum = section.sourceSnapshot?.sectionNumber ?? section.sectionNumber
    const toNum = node.data.sectionNumber
    if ((fromNum ?? "") !== (toNum ?? "")) {
      numberChanged.push({
        stepId,
        sectionId: section.id,
        from: fromNum,
        to: toNum,
      })
    }
  }

  const intentionalIds = new Set(
    sections
      .filter((s) => resolveSyncStatus(s) === "intentional_difference")
      .map((s) => s.id),
  )

  const reviewCount =
    addedStepIds.length +
    removedStepIds.length +
    labelChanged.filter((c) => !intentionalIds.has(c.sectionId)).length

  return {
    addedStepIds,
    removedStepIds,
    labelChanged,
    numberChanged,
    reviewCount,
  }
}

/**
 * confirmFlow 用: syncStatus / sourceSnapshot のみ更新。
 * blocks・title・sectionNumber は維持する。
 */
export function applyManualImpactStatuses(
  sections: ManualSection[],
  impact: ManualImpact,
  flow: FlowState,
  options?: { preserveIntentional?: boolean },
): ManualSection[] {
  const preserveIntentional = options?.preserveIntentional !== false
  const nodes = documentableNodes(flow)
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const removed = new Set(impact.removedStepIds)
  const labelChangedIds = new Set(impact.labelChanged.map((c) => c.sectionId))

  return sections.map((section) => {
    const current = resolveSyncStatus(section)
    if (preserveIntentional && current === "intentional_difference") {
      return section
    }

    if (!section.stepId) {
      return section
    }

    if (removed.has(section.stepId) || !nodeById.has(section.stepId)) {
      return { ...section, syncStatus: "orphaned" as const }
    }

    const node = nodeById.get(section.stepId)!
    if (labelChangedIds.has(section.id)) {
      return {
        ...section,
        syncStatus: "needs_review" as const,
        // 比較基準は旧ラベル側を残す（解除時に更新）
        sourceSnapshot: section.sourceSnapshot ?? {
          label: baselineLabel(section),
          kind: node.data.kind,
          sectionNumber: section.sectionNumber,
        },
      }
    }

    return {
      ...section,
      syncStatus: "ok" as const,
      sourceSnapshot: snapshotFromNode(node),
    }
  })
}

export function countManualReviewNeeded(sections: ManualSection[]): number {
  return sections.filter((s) => {
    const st = resolveSyncStatus(s)
    return st === "needs_review" || st === "orphaned" || st === "unplaced"
  }).length
}

export function buildUnplacedCandidates(
  flow: FlowState,
  sections: ManualSection[],
): UnplacedCandidate[] {
  const impact = computeManualImpact(flow, sections)
  const nodeById = new Map(documentableNodes(flow).map((n) => [n.id, n]))
  return impact.addedStepIds.flatMap((stepId) => {
    const node = nodeById.get(stepId)
    if (!node) return []
    return [
      {
        stepId,
        label: node.data.label,
        sectionNumber: node.data.sectionNumber,
        kind: node.data.kind,
      },
    ]
  })
}

export function partitionSectionsBySync(sections: ManualSection[]): {
  placed: ManualSection[]
  orphaned: ManualSection[]
  unplaced: ManualSection[]
} {
  const orphaned: ManualSection[] = []
  const unplaced: ManualSection[] = []
  const placed: ManualSection[] = []
  for (const s of sections) {
    const st = resolveSyncStatus(s)
    if (st === "orphaned") orphaned.push(s)
    else if (st === "unplaced") unplaced.push(s)
    else placed.push(s)
  }
  return { placed, orphaned, unplaced }
}

export function suggestedSectionNumber(
  flow: FlowState,
  stepId: string,
): string | undefined {
  return documentableNodes(flow).find((n) => n.id === stepId)?.data.sectionNumber
}

/** 意図的差分にする */
export function markIntentionalDifference(section: ManualSection): ManualSection {
  return { ...section, syncStatus: "intentional_difference" }
}

/** 要確認を解除し、現在のフローを基準に ok にする */
export function clearManualReview(
  section: ManualSection,
  flow: FlowState,
): ManualSection {
  if (!section.stepId) {
    return { ...section, syncStatus: "ok" }
  }
  const node = documentableNodes(flow).find((n) => n.id === section.stepId)
  return {
    ...section,
    syncStatus: "ok",
    sourceSnapshot: node ? snapshotFromNode(node) : section.sourceSnapshot,
  }
}
