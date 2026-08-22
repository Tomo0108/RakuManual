import type { FlowState, HearingAnswer, ManualSection, Project } from "@/lib/types"

/** 骨組み回答の内容指紋（フロー・マニュアル生成時点との比較用） */
export function hearingAnswersKey(answers: HearingAnswer[]): string {
  return JSON.stringify(
    answers
      .slice()
      .sort((a, b) => a.questionId.localeCompare(b.questionId))
      .map((a) => ({
        q: a.questionId,
        v: a.value,
        s: a.status,
        t: a.questionText ?? "",
      })),
  )
}

export function stampFlowHearing(flow: FlowState, answers: HearingAnswer[]): FlowState {
  return { ...flow, hearingAnswersKey: hearingAnswersKey(answers) }
}

export function isFlowHearingStale(project: Project): boolean {
  const saved = project.flow.hearingAnswersKey
  if (!saved || project.flow.nodes.length === 0) return false
  return saved !== hearingAnswersKey(project.hearingAnswers)
}

/** ヒアリング修正後: マニュアルセクションを要確認に（フロー未生成時は何もしない） */
export function applyHearingChangeToProject(project: Project): Project {
  if (!project.flow.hearingAnswersKey || project.flow.nodes.length === 0) {
    return project
  }
  if (project.sections.length === 0) return project
  return {
    ...project,
    sections: markSectionsHearingStale(project.sections),
  }
}

export function markSectionsHearingStale(sections: ManualSection[]): ManualSection[] {
  return sections.map((s) => {
    if (s.syncStatus === "intentional_difference" || s.syncStatus === "orphaned") return s
    return { ...s, syncStatus: "needs_review", reviewReason: "hearing" }
  })
}

export function stampHearingOnSection(
  section: ManualSection,
  answers: HearingAnswer[],
): ManualSection {
  const key = hearingAnswersKey(answers)
  return {
    ...section,
    reviewReason: section.reviewReason === "hearing" ? undefined : section.reviewReason,
    sourceSnapshot: {
      label: section.sourceSnapshot?.label ?? section.title,
      kind: section.sourceSnapshot?.kind,
      sectionNumber: section.sourceSnapshot?.sectionNumber ?? section.sectionNumber,
      deepdiveAnswersKey: section.sourceSnapshot?.deepdiveAnswersKey,
      hearingAnswersKey: key,
    },
  }
}

export function stampAllSectionsHearing(
  sections: ManualSection[],
  answers: HearingAnswer[],
): ManualSection[] {
  return sections.map((s) => stampHearingOnSection(s, answers))
}

/** 骨組みを確認済み（再生成せず現状維持） */
export function acknowledgeHearingReview(
  section: ManualSection,
  answers: HearingAnswer[],
): ManualSection {
  const stamped = stampHearingOnSection(section, answers)
  return {
    ...stamped,
    syncStatus: "ok",
    reviewReason: undefined,
  }
}

export function countHearingStaleSections(project: Project): number {
  return project.sections.filter((s) => sectionNeedsHearingReview(s, project)).length
}

export function sectionNeedsHearingReview(section: ManualSection, project: Project): boolean {
  if (section.reviewReason === "hearing") return true
  if (section.syncStatus !== "needs_review") return false
  if (section.reviewReason === "deepdive" || section.reviewReason === "flow") return false
  const saved = section.sourceSnapshot?.hearingAnswersKey
  if (!saved) return isFlowHearingStale(project)
  return saved !== hearingAnswersKey(project.hearingAnswers)
}
