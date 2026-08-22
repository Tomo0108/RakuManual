import type { Project } from "../../types.js"
import type { FlowState } from "../../flow-types.js"
import { hearingQuestionText } from "../hearing.js"

export type HearingContextItem = {
  id: string
  question: string
  value: string
  status: string
}

export type DeepdiveContextItem = {
  stepId: string
  stepLabel: string
  sectionNumber?: string
  majorTitle?: string
  mediumTitle?: string
  importance: string
  status: string
  answers: { question: string; answer: string }[]
}

export function buildHearingContext(project: Project): HearingContextItem[] {
  return (project.hearingAnswers ?? []).map((a) => ({
    id: a.questionId,
    question: a.questionText ?? hearingQuestionText(a.questionId) ?? a.questionId,
    value: String(a.value ?? ""),
    status: a.status,
  }))
}

export function buildDeepdiveContext(project: Project): DeepdiveContextItem[] {
  return (project.deepdive ?? []).map((d) => {
    const item = d as {
      stepId?: string
      stepLabel?: string
      sectionNumber?: string
      majorTitle?: string
      mediumTitle?: string
      importance?: string
      status?: string
      answers?: Array<{ question?: string; answer?: string; value?: string }>
    }
    return {
      stepId: String(item.stepId ?? ""),
      stepLabel: String(item.stepLabel ?? ""),
      sectionNumber: item.sectionNumber,
      majorTitle: item.majorTitle,
      mediumTitle: item.mediumTitle,
      importance: String(item.importance ?? "normal"),
      status: String(item.status ?? "not-started"),
      answers: (item.answers ?? []).map((a) => ({
        question: String(a.question ?? ""),
        answer: String(a.answer ?? a.value ?? ""),
      })),
    }
  })
}

export function buildFlowSummary(project: Project): {
  lanes: string[]
  nodeCount: number
  processSteps: Array<{ id: string; label: string; sectionNumber?: string; lane: string }>
} | null {
  const flow = project.flow as unknown as FlowState | undefined
  if (!flow?.nodes?.length) return null
  return {
    lanes: flow.lanes ?? [],
    nodeCount: flow.nodes.length,
    processSteps: flow.nodes
      .filter((n) => n.data.kind === "process" || n.data.kind === "decision")
      .map((n) => ({
        id: n.id,
        label: n.data.label,
        sectionNumber: n.data.sectionNumber,
        lane: n.data.lane,
      })),
  }
}

export function truncateJson(obj: unknown, maxChars: number): string {
  const raw = JSON.stringify(obj)
  if (raw.length <= maxChars) return raw
  return `${raw.slice(0, maxChars - 20)}…"(truncated)"`
}
