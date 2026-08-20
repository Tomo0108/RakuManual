/** API サーバー用の最小型（app/src/lib/types.ts と整合） */

export interface AuthUser {
  id: string
  name: string
  email: string
}

export interface HearingAnswer {
  questionId: string
  value: string
  status: "answered" | "skipped" | "unknown" | "later"
}

export interface ManualBlock {
  id: string
  type: "paragraph" | "step" | "note"
  text: string
  needsConfirm?: boolean
}

export interface Project {
  id: string
  name: string
  owner: string
  ownerId?: string
  updatedAt: string
  status: "hearing" | "flow" | "deepdive" | "manual" | "published"
  description: string
  reviewDeadline?: string
  hearingAnswers: HearingAnswer[]
  flow: Record<string, unknown>
  deepdive: Array<{ stepId: string } & Record<string, unknown>>
  sections: Array<{ id: string } & Record<string, unknown>>
  history: { id: string; date: string; user: string; action: string }[]
  sectionRevisions?: Record<string, unknown>[]
  restorePoints?: Record<string, unknown>[]
}
