/**
 * フロー変更反映（マニュアル再生成）— サーバ側 LLM 連携
 */

import type { FlowState, StepKind } from "../flow-types.js"
import type { Project } from "../types.js"
import { regenerateSectionFromLlm, generateNewSectionFromLlm } from "./structured.js"
import { regenerateSectionMock } from "./manual.js"

export type ManualRegenChoice = "keep" | "regenerate" | "archive"

export interface RegenPlanItem {
  key: string
  kind: "section" | "unplaced" | "orphan"
  sectionId?: string
  stepId?: string
  title: string
  sectionNumber?: string
  defaultChoice: ManualRegenChoice
  candidate?: { stepId: string; label: string; sectionNumber?: string; kind: StepKind }
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function documentableNodes(flow: FlowState) {
  return flow.nodes.filter((n) => n.data.kind === "process" || n.data.kind === "decision")
}

function computeManualImpact(flow: FlowState, sections: Project["sections"]) {
  const nodes = documentableNodes(flow)
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const sectionsWithStep = sections.filter((s) => (s as { stepId?: string }).stepId)
  const sectionStepIds = new Set(sectionsWithStep.map((s) => (s as { stepId: string }).stepId))
  const addedStepIds = nodes.filter((n) => !sectionStepIds.has(n.id)).map((n) => n.id)
  const removedStepIds: string[] = []
  for (const section of sectionsWithStep) {
    const stepId = (section as { stepId: string }).stepId
    if (!nodeById.has(stepId)) removedStepIds.push(stepId)
  }
  return { addedStepIds, removedStepIds }
}

function buildUnplacedCandidates(flow: FlowState, sections: Project["sections"]) {
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
        kind: node.data.kind as StepKind,
      },
    ]
  })
}

function defaultRegenChoice(section: Project["sections"][number]): ManualRegenChoice {
  const sync = (section as { syncStatus?: string }).syncStatus ?? "ok"
  const status = (section as { status?: string }).status
  const version = Number((section as { version?: number }).version ?? 1)
  if (sync === "orphaned") return "archive"
  if (sync === "intentional_difference") return "keep"
  if (status === "approved") return "keep"
  if (version > 1 && sync !== "needs_review") return "keep"
  if (sync === "needs_review" || sync === "unplaced") return "regenerate"
  return "keep"
}

export function buildRegenPlan(project: Project): RegenPlanItem[] {
  const flow = project.flow as unknown as FlowState
  const impact = computeManualImpact(flow, project.sections)
  const removed = new Set(impact.removedStepIds)
  const items: RegenPlanItem[] = []

  for (const section of project.sections) {
    const stepId = (section as { stepId?: string }).stepId
    const syncStatus = (section as { syncStatus?: string }).syncStatus
    const isOrphan = syncStatus === "orphaned" || (!!stepId && removed.has(stepId))
    items.push({
      key: String((section as { id: string }).id),
      kind: isOrphan ? "orphan" : "section",
      sectionId: String((section as { id: string }).id),
      stepId,
      title: String((section as { title?: string }).title ?? ""),
      sectionNumber: (section as { sectionNumber?: string }).sectionNumber,
      defaultChoice: isOrphan ? "archive" : defaultRegenChoice(section),
    })
  }

  for (const candidate of buildUnplacedCandidates(flow, project.sections)) {
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

function mockNewSection(
  project: Project,
  candidate: { stepId: string; label: string; sectionNumber?: string },
  node?: ReturnType<typeof documentableNodes>[number],
): Project["sections"][number] {
  const tempId = uid("s-temp")
  const mock = regenerateSectionMock(
    {
      ...project,
      sections: [
        ...project.sections,
        {
          id: tempId,
          title: candidate.label,
          sectionNumber: candidate.sectionNumber,
          stepId: candidate.stepId,
          status: "draft",
          version: 1,
          blocks: [],
        },
      ],
    },
    tempId,
  )
  return {
    ...mock,
    id: uid("s"),
    stepId: candidate.stepId,
    sourceSnapshot: node
      ? { label: node.data.label, kind: node.data.kind, sectionNumber: node.data.sectionNumber }
      : { label: candidate.label, sectionNumber: candidate.sectionNumber },
  } as Project["sections"][number]
}

export async function applyManualRegenWithLlm(
  project: Project,
  choices: Record<string, ManualRegenChoice>,
  userId: string,
): Promise<{ sections: Project["sections"]; provider: string; tokens: number }> {
  const flow = project.flow as unknown as FlowState
  const plan = buildRegenPlan(project)
  const nodeById = new Map(documentableNodes(flow).map((n) => [n.id, n]))
  let sections = [...project.sections]
  let totalTokens = 0
  let provider = "mock"

  for (const item of plan) {
    const choice = choices[item.key] ?? item.defaultChoice

    if (item.kind === "unplaced") {
      if (choice !== "regenerate" || !item.candidate) continue
      const c = item.candidate
      const node = nodeById.get(c.stepId)
      try {
        const generated = await generateNewSectionFromLlm(project, c, userId)
        totalTokens += generated.tokens
        provider = generated.provider
        sections.push(generated.section as Project["sections"][number])
      } catch {
        sections.push(mockNewSection(project, c, node))
      }
      continue
    }

    if (!item.sectionId) continue
    const idx = sections.findIndex((s) => (s as { id: string }).id === item.sectionId)
    if (idx < 0) continue
    const section = sections[idx]!

    if (choice === "keep") {
      if (item.kind === "orphan") {
        sections[idx] = { ...section, syncStatus: "intentional_difference" } as typeof section
      }
      continue
    }

    if (choice === "archive") {
      sections = sections.filter((s) => (s as { id: string }).id !== item.sectionId)
      continue
    }

    try {
      const { section: regenerated, provider: p, tokens } = await regenerateSectionFromLlm(
        { ...project, sections },
        item.sectionId,
        userId,
      )
      totalTokens += tokens
      provider = p
      sections[idx] = regenerated as typeof section
    } catch {
      sections[idx] = regenerateSectionMock({ ...project, sections }, item.sectionId) as typeof section
    }
  }

  return { sections, provider, tokens: totalTokens }
}
