/** API サーバー用の最小型（app/src/lib/types.ts と整合） */

export type UserRole = "viewer" | "creator" | "admin"

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
}

export interface HearingAnswer {
  questionId: string
  value: string
  status: "answered" | "skipped" | "unknown" | "later"
  /** 追加質問（follow-up）は設問マスタに無いため質問文を保持する */
  questionText?: string
}

/** 公開範囲。未設定の既存プロジェクトは "org" 扱い（後方互換） */
export type ProjectVisibility = "org" | "members"

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
  /** 公開範囲。未設定は "org"（後方互換）、新規公開は "members" */
  visibility?: ProjectVisibility
  description: string
  reviewDeadline?: string
  hearingAnswers: HearingAnswer[]
  flow: Record<string, unknown>
  deepdive: Array<{ stepId: string } & Record<string, unknown>>
  sections: Array<{ id: string } & Record<string, unknown>>
  history: { id: string; date: string; user: string; action: string }[]
  sectionRevisions?: Record<string, unknown>[]
  restorePoints?: Record<string, unknown>[]
  /** 公開日時 ISO */
  publishedAt?: string
  /** 公開時点のマニュアルスナップショット */
  publishedSections?: Record<string, unknown>[]
}
