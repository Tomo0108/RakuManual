import type { Node, Edge } from "@xyflow/react"

/* ---------- ナビゲーション ---------- */
export type View =
  | { name: "projects" }
  | { name: "dashboard" }
  | { name: "qa" }
  | { name: "project"; projectId: string; tab: ProjectTab }

export type ProjectTab =
  | "overview"
  | "hearing"
  | "flow"
  | "deepdive"
  | "manual"
  | "export"

/* ---------- プロジェクト ---------- */
export type ProjectStatus =
  | "hearing" // ① 骨組みヒアリング中
  | "flow" // ②③ フロー図作成・編集中
  | "deepdive" // ④ 深掘りヒアリング中
  | "manual" // ⑤⑥ マニュアル作成・レビュー中
  | "published" // ⑦ 公開済み

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  hearing: "骨組みヒアリング中",
  flow: "フロー図編集中",
  deepdive: "深掘りヒアリング中",
  manual: "マニュアル作成中",
  published: "公開済み",
}

/* ---------- ヒアリング ---------- */
export type QuestionType = "text" | "choice" | "multi"

export interface HearingQuestion {
  id: string
  text: string
  hint?: string
  type: QuestionType
  options?: string[]
}

export type AnswerStatus = "answered" | "skipped" | "unknown" | "later"

export interface HearingAnswer {
  questionId: string
  value: string
  status: AnswerStatus
}

/* ---------- フロー図 ---------- */
export type StepKind = "start" | "end" | "process" | "decision"

export interface StepData extends Record<string, unknown> {
  label: string
  /** マニュアル用項番(例: 1.1, 1.2) */
  sectionNumber?: string
  /** 担当チーム(横スイムレーンの行) */
  lane: string
  kind: StepKind
  /** 利用システム(下部軸に表示) */
  system?: string
  /** 手動修正フラグ(再生成時に保護される) */
  manual?: boolean
  /** 生成根拠となったヒアリング回答 */
  source?: string
  /** 自然言語修正の差分プレビュー用 */
  diff?: "add" | "remove" | "change"
}

export type FlowNode = Node<StepData>
export type FlowEdge = Edge

/** 列ごとの利用システム(ラベル + 任意リンク) */
export interface ColumnSystemEntry {
  label: string
  url?: string
}

/** 自動整列後のグリッドメタ情報 */
export interface FlowLayoutMeta {
  columnCount: number
  /** 列インデックスごとの利用システム */
  columnSystems: ColumnSystemEntry[]
}

export interface FlowState {
  nodes: FlowNode[]
  edges: FlowEdge[]
  /** 担当チーム(行)の一覧 */
  lanes: string[]
  layoutMeta?: FlowLayoutMeta
}

/* ---------- 深掘りヒアリング ---------- */
export type DeepDiveStatus = "not-started" | "in-progress" | "done" | "recheck"

export const DEEPDIVE_LABEL: Record<DeepDiveStatus, string> = {
  "not-started": "未着手",
  "in-progress": "回答中",
  done: "完了",
  recheck: "要確認",
}

export interface DeepDiveItem {
  stepId: string
  stepLabel: string
  /** フロー図の項番(例: 1.1) */
  sectionNumber?: string
  /** 大項目の業務名(例: 経費精算業務) */
  majorTitle?: string
  /** 中項目の業務概要(例: 新規申請) */
  mediumTitle?: string
  importance: "high" | "normal" | "low"
  status: DeepDiveStatus
  answers: { question: string; answer: string }[]
}

/* ---------- マニュアル ---------- */
export type SectionStatus = "draft" | "review" | "approved"

export const SECTION_LABEL: Record<SectionStatus, string> = {
  draft: "下書き",
  review: "レビュー中",
  approved: "承認済み",
}

export interface ManualImage {
  id: string
  /** data URL など。未設定時は color プレースホルダを表示 */
  url?: string
  caption: string
  mimeType?: string
  name?: string
  /** サンプル用プレースホルダ色 */
  color?: string
}

export interface ManualBlock {
  id: string
  type: "paragraph" | "step" | "note"
  text: string
  /** AIが推測で補完した「要確認」箇所 */
  needsConfirm?: boolean
  /** 画像添付(ヘルプボタン方式で展開表示) */
  image?: ManualImage
}

export interface ManualSection {
  id: string
  title: string
  /** フロー図ステップとの対応項番 */
  sectionNumber?: string
  /** 大項目の業務名(例: 経費精算業務) */
  majorTitle?: string
  /** 中項目の業務概要(例: 新規申請) */
  mediumTitle?: string
  /** 紐づくフローステップID */
  stepId?: string
  status: SectionStatus
  version: number
  updatedAt: string
  blocks: ManualBlock[]
}

/* ---------- 変更履歴 ---------- */
export interface HistoryEntry {
  id: string
  date: string
  user: string
  action: string
}

/* ---------- プロジェクト本体 ---------- */
export interface Project {
  id: string
  name: string
  owner: string
  updatedAt: string
  status: ProjectStatus
  description: string
  reviewDeadline?: string
  hearingAnswers: HearingAnswer[]
  flow: FlowState
  deepdive: DeepDiveItem[]
  sections: ManualSection[]
  history: HistoryEntry[]
}
