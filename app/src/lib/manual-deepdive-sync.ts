import type { DeepDiveItem, ManualSection, Project } from "@/lib/types"

/** 深掘り回答の内容指紋（生成・同期時点との比較用） */
export function deepdiveAnswersKey(item: Pick<DeepDiveItem, "answers">): string {
  return JSON.stringify(
    item.answers.map((a) => ({ q: a.question, a: a.answer ?? "" })),
  )
}

export function deepdiveItemForStep(project: Project, stepId: string): DeepDiveItem | undefined {
  return project.deepdive.find((d) => d.stepId === stepId)
}

/** マニュアル生成・再生成・確認済み解除後に深掘り基準線を更新 */
export function stampDeepdiveOnSection(
  section: ManualSection,
  item: DeepDiveItem | undefined,
): ManualSection {
  if (!item) return section
  const key = deepdiveAnswersKey(item)
  return {
    ...section,
    reviewReason: section.reviewReason === "deepdive" ? undefined : section.reviewReason,
    sourceSnapshot: {
      label: section.sourceSnapshot?.label ?? section.title,
      kind: section.sourceSnapshot?.kind,
      sectionNumber: section.sourceSnapshot?.sectionNumber ?? section.sectionNumber,
      deepdiveAnswersKey: key,
    },
  }
}

export function stampAllSectionsDeepdive(sections: ManualSection[], deepdive: DeepDiveItem[]): ManualSection[] {
  const byStep = new Map(deepdive.map((d) => [d.stepId, d]))
  return sections.map((s) => {
    if (!s.stepId) return s
    return stampDeepdiveOnSection(s, byStep.get(s.stepId))
  })
}

export function isDeepdiveStale(section: ManualSection, item: DeepDiveItem | undefined): boolean {
  if (!section.stepId || !item) return false
  const saved = section.sourceSnapshot?.deepdiveAnswersKey
  if (!saved) return section.reviewReason === "deepdive"
  return saved !== deepdiveAnswersKey(item)
}

export function markSectionsDeepdiveStale(sections: ManualSection[], stepId: string): ManualSection[] {
  return sections.map((s) => {
    if (s.stepId !== stepId) return s
    if (s.syncStatus === "intentional_difference" || s.syncStatus === "orphaned") return s
    return { ...s, syncStatus: "needs_review", reviewReason: "deepdive" }
  })
}

/** 深掘りを確認済み（再生成せず現状維持） */
export function acknowledgeDeepdiveReview(
  section: ManualSection,
  item: DeepDiveItem | undefined,
): ManualSection {
  const stamped = stampDeepdiveOnSection(section, item)
  return {
    ...stamped,
    syncStatus: "ok",
    reviewReason: undefined,
  }
}

export function countDeepdiveStaleSections(project: Project): number {
  return project.sections.filter((s) => sectionNeedsDeepdiveReview(s, project)).length
}

export function sectionNeedsDeepdiveReview(section: ManualSection, project: Project): boolean {
  if (section.reviewReason === "deepdive") return true
  if (section.syncStatus !== "needs_review") return false
  if (section.reviewReason === "flow") return false
  const item = deepdiveItemForStep(project, section.stepId ?? "")
  return isDeepdiveStale(section, item)
}

export function sectionNeedsFlowReview(section: ManualSection, project: Project): boolean {
  if (section.syncStatus !== "needs_review") return false
  if (section.reviewReason === "deepdive") return false
  if (section.reviewReason === "flow") return true
  return !isDeepdiveStale(section, deepdiveItemForStep(project, section.stepId ?? ""))
}
