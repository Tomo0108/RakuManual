/** サーバー側 flow-logic 用の最小型（app/src/lib/types.ts から抽出） */

export type StepKind = "start" | "end" | "process" | "decision"

export interface StepData extends Record<string, unknown> {
  label: string
  sectionNumber?: string
  lane: string
  kind: StepKind
  connectorId?: string
  system?: string
  manual?: boolean
  source?: string
  diff?: "add" | "remove" | "change"
}

export interface FlowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: StepData
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  label?: string
  sourceHandle?: string
  targetHandle?: string
  animated?: boolean
  type?: string
  data?: Record<string, unknown>
  style?: Record<string, unknown>
  labelStyle?: Record<string, unknown>
}

export interface ColumnSystemEntry {
  label: string
  url?: string
}

export interface FlowLayoutMeta {
  columnCount: number
  columnSystems: ColumnSystemEntry[]
  /** autoLayout アルゴリズム版（改善時にインクリメントし再整列を促す） */
  layoutVersion?: number
}

export interface FlowState {
  nodes: FlowNode[]
  edges: FlowEdge[]
  lanes: string[]
  layoutMeta?: FlowLayoutMeta
}
