import {
  CircleDot,
  Diamond,
  FileInput,
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
  /** キャンバス上のバッジ文言（省略時は KIND ラベル） */
  badge?: string
  /** 処理系の枠・背景トーン（PPTX 出力と揃える。紫は使わない） */
  tone?: "slate" | "indigo" | "sky" | "stone"
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
    description: "通常の作業・手続き（角丸四角）",
    kind: "process",
    defaultLabel: "新しいステップ",
    icon: Square,
    category: "process",
    frequent: true,
    badge: "処理",
    tone: "slate",
  },
  {
    id: "approval",
    label: "承認",
    description: "上長・担当者による承認（角丸四角＋承認バッジ）",
    kind: "process",
    defaultLabel: "承認作業",
    icon: UserCheck,
    category: "process",
    frequent: true,
    badge: "承認",
    tone: "indigo",
  },
  {
    id: "system-input",
    label: "システム入力",
    description: "業務システムへの入力（角丸四角＋システムバッジ）",
    kind: "process",
    defaultLabel: "システムに入力",
    icon: FileInput,
    category: "process",
    badge: "システム",
    tone: "sky",
  },
  {
    id: "notification",
    label: "通知・連絡",
    description: "メールやチャットでの連絡（角丸四角＋通知バッジ）",
    kind: "process",
    defaultLabel: "関係者へ連絡",
    icon: Mail,
    category: "process",
    badge: "通知",
    tone: "stone",
  },
  {
    id: "decision",
    label: "条件分岐",
    description: "はい/いいえなどの判断（ひし形）",
    kind: "decision",
    defaultLabel: "条件分岐?",
    icon: Diamond,
    category: "branch",
    frequent: true,
    badge: "分岐",
  },
  {
    id: "end",
    label: "終了",
    description: "フローの完了（丸）",
    kind: "end",
    defaultLabel: "完了",
    icon: CircleDot,
    category: "terminal",
    frequent: true,
    badge: "終了",
  },
]

export const FREQUENT_CONNECTORS = FLOW_CONNECTORS.filter((c) => c.frequent)

export function connectorById(id: string): FlowConnector | undefined {
  return FLOW_CONNECTORS.find((c) => c.id === id)
}

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

const TONE_CLASS: Record<NonNullable<FlowConnector["tone"]>, string> = {
  slate: "border-slate-300 bg-card",
  indigo: "border-indigo-300 bg-indigo-50/80",
  sky: "border-sky-300 bg-sky-50/80",
  stone: "border-neutral-400 bg-neutral-100",
}

const TONE_BADGE: Record<NonNullable<FlowConnector["tone"]>, string> = {
  slate: "text-slate-600 bg-slate-100/80",
  indigo: "text-indigo-800 bg-indigo-100/90",
  sky: "text-sky-800 bg-sky-100/90",
  stone: "text-neutral-700 bg-neutral-200/90",
}

/** キャンバス上の処理ノード見た目 */
export function processConnectorVisual(connectorId?: string) {
  const c = connectorId ? connectorById(connectorId) : undefined
  const tone = c?.tone ?? "slate"
  return {
    id: c?.id ?? "process",
    badge: c?.badge ?? "処理",
    Icon: c?.icon ?? Square,
    frameClass: TONE_CLASS[tone],
    badgeClass: TONE_BADGE[tone],
  }
}
