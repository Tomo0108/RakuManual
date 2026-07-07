import {
  CircleDot,
  Diamond,
  FileInput,
  GitBranch,
  Mail,
  Square,
  UserCheck,
  type LucideIcon,
} from "lucide-react"
import type { StepKind } from "@/lib/types"

export type ConnectorCategory = "process" | "branch" | "terminal"

export interface FlowConnector {
  id: string
  label: string
  description: string
  kind: StepKind
  defaultLabel: string
  icon: LucideIcon
  category: ConnectorCategory
  /** よく使うセクションに表示 */
  frequent?: boolean
}

export const CONNECTOR_CATEGORIES: { id: ConnectorCategory; label: string }[] = [
  { id: "process", label: "処理" },
  { id: "branch", label: "分岐" },
  { id: "terminal", label: "終端" },
]

export const FLOW_CONNECTORS: FlowConnector[] = [
  {
    id: "process",
    label: "処理ステップ",
    description: "通常の作業・手続きを表すステップ",
    kind: "process",
    defaultLabel: "新しいステップ",
    icon: Square,
    category: "process",
    frequent: true,
  },
  {
    id: "approval",
    label: "承認",
    description: "上長・担当者による承認作業",
    kind: "process",
    defaultLabel: "承認作業",
    icon: UserCheck,
    category: "process",
    frequent: true,
  },
  {
    id: "system-input",
    label: "システム入力",
    description: "業務システムへのデータ入力",
    kind: "process",
    defaultLabel: "システムに入力",
    icon: FileInput,
    category: "process",
  },
  {
    id: "notification",
    label: "通知・連絡",
    description: "メールやチャットでの連絡作業",
    kind: "process",
    defaultLabel: "関係者へ連絡",
    icon: Mail,
    category: "process",
  },
  {
    id: "decision",
    label: "条件分岐",
    description: "はい/いいえなどの判断ポイント",
    kind: "decision",
    defaultLabel: "条件分岐?",
    icon: Diamond,
    category: "branch",
    frequent: true,
  },
  {
    id: "parallel",
    label: "並列分岐",
    description: "複数経路への分岐ポイント",
    kind: "decision",
    defaultLabel: "分岐条件?",
    icon: GitBranch,
    category: "branch",
  },
  {
    id: "end",
    label: "終了",
    description: "フローの完了・終了ポイント",
    kind: "end",
    defaultLabel: "完了",
    icon: CircleDot,
    category: "terminal",
  },
]

export const FREQUENT_CONNECTORS = FLOW_CONNECTORS.filter((c) => c.frequent)

export function filterConnectors(
  connectors: FlowConnector[],
  query: string,
): FlowConnector[] {
  const q = query.trim().toLowerCase()
  if (!q) return connectors
  return connectors.filter(
    (c) =>
      c.label.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.defaultLabel.toLowerCase().includes(q),
  )
}

/** 挿入コンテキストに応じて利用可能なコネクタを絞り込む */
export function connectorsForInsert(
  mode: "between" | "after" | "append" | "canvas",
  targetKind?: StepKind,
): FlowConnector[] {
  return FLOW_CONNECTORS.filter((c) => {
    if (c.kind === "start") return false
    if (mode === "between" && targetKind === "end" && c.kind === "end") return false
    if (mode === "after" && targetKind === "end") return false
    if (mode === "append" && c.kind === "end") return true
    return true
  })
}

export function connectorById(id: string): FlowConnector | undefined {
  return FLOW_CONNECTORS.find((c) => c.id === id)
}
