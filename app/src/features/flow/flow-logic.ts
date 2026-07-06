import type { FlowEdge, FlowNode, FlowState } from "@/lib/types"
import { uid } from "@/lib/project-utils"
import { autoLayout } from "./flow-layout"

export { autoLayout } from "./flow-layout"

export function makeNode(
  label: string,
  lane: string,
  kind: FlowNode["data"]["kind"],
  position: { x: number; y: number },
  extra?: Partial<FlowNode["data"]>,
): FlowNode {
  return {
    id: uid("n"),
    type: "step",
    position,
    data: { label, lane, kind, manual: true, ...extra },
  }
}

export interface NlProposal {
  description: string
  apply: (state: FlowState) => FlowState
  /** プレビュー用: diffフラグ付きの状態 */
  preview: (state: FlowState) => FlowState
}

/**
 * 自然言語の修正指示を解釈して修正案を作る(モック実装)。
 * 「AとBの間に◯◯を追加」「◯◯を削除」「◯◯を△△に変更」などのパターンを認識する。
 */
export function interpretInstruction(instruction: string, state: FlowState): NlProposal {
  const { nodes } = state
  // 指示文に含まれるノードを、ラベルの部分一致で探す(長い順に優先)
  const mentioned = nodes
    .filter((n) => instruction.includes(n.data.label) || includesLoose(instruction, n.data.label))
    .sort((a, b) => b.data.label.length - a.data.label.length)

  const quoted = [...instruction.matchAll(/「([^」]+)」/g)].map((m) => m[1])

  // --- 削除 ---
  if (/削除|消して|いらない|不要/.test(instruction) && mentioned.length > 0) {
    const target = mentioned[0]
    return {
      description: `ステップ「${target.data.label}」を削除します。前後のステップは自動的に結線し直します。`,
      preview: (s) => ({
        ...s,
        nodes: s.nodes.map((n) =>
          n.id === target.id ? { ...n, data: { ...n.data, diff: "remove" as const } } : n,
        ),
      }),
      apply: (s) => removeNodeAndReconnect(s, target.id),
    }
  }

  // --- 間に追加 ---
  const betweenMatch = /(?:の)?間に(.+?)(?:を|が)?(?:追加|入る|入れて|挟)/.exec(instruction)
  if (betweenMatch && mentioned.length >= 2) {
    const [a, b] = orderBySequence(mentioned[0], mentioned[1], state)
    const newLabel = quoted[quoted.length - 1] ?? cleanLabel(betweenMatch[1])
    return {
      description: `「${a.data.label}」と「${b.data.label}」の間に新しいステップ「${newLabel}」を追加します。`,
      preview: (s) => previewInsertBetween(s, a.id, b.id, newLabel),
      apply: (s) => insertBetween(s, a.id, b.id, newLabel),
    }
  }

  // --- 変更 ---
  const changeMatch = /(?:を|は)「?(.+?)」?(?:に変更|に変えて|に修正|という名前に)/.exec(instruction)
  if (changeMatch && mentioned.length > 0) {
    const target = mentioned[0]
    const newLabel = quoted.length >= 2 ? quoted[1] : cleanLabel(changeMatch[1])
    return {
      description: `ステップ「${target.data.label}」の内容を「${newLabel}」に変更します。`,
      preview: (s) => ({
        ...s,
        nodes: s.nodes.map((n) =>
          n.id === target.id
            ? { ...n, data: { ...n.data, label: newLabel, diff: "change" as const } }
            : n,
        ),
      }),
      apply: (s) => ({
        ...s,
        nodes: s.nodes.map((n) =>
          n.id === target.id
            ? { ...n, data: { ...n.data, label: newLabel, manual: true } }
            : n,
        ),
      }),
    }
  }

  // --- 追加(挿入位置が特定できた場合は後ろに) ---
  if (/追加|足して|入れて|新しく/.test(instruction)) {
    const newLabel = quoted[0] ?? extractAddLabel(instruction)
    const anchor = mentioned[0] ?? state.nodes[state.nodes.length - 2] ?? state.nodes[0]
    const nextEdge = state.edges.find((e) => e.source === anchor?.id)
    if (anchor && nextEdge) {
      const b = state.nodes.find((n) => n.id === nextEdge.target)!
      return {
        description: `「${anchor.data.label}」の直後に新しいステップ「${newLabel}」を追加します。`,
        preview: (s) => previewInsertBetween(s, anchor.id, b.id, newLabel),
        apply: (s) => insertBetween(s, anchor.id, b.id, newLabel),
      }
    }
    return {
      description: `フローの末尾に新しいステップ「${newLabel}」を追加します。`,
      preview: (s) => previewAppend(s, newLabel),
      apply: (s) => applyAppend(s, newLabel),
    }
  }

  // --- フォールバック ---
  const fallbackLabel = quoted[0] ?? "新しいステップ"
  return {
    description: `指示内容から「${fallbackLabel}」というステップの追加を提案します。位置はドラッグで調整してください。`,
    preview: (s) => previewAppend(s, fallbackLabel),
    apply: (s) => applyAppend(s, fallbackLabel),
  }
}

/* ---------- 内部ヘルパー ---------- */

function includesLoose(text: string, label: string): boolean {
  const head = label.slice(0, Math.min(6, label.length))
  return head.length >= 4 && text.includes(head)
}

function cleanLabel(raw: string): string {
  return raw.replace(/[「」]/g, "").replace(/(する作業|の作業|作業)$/, "").trim() || "新しいステップ"
}

function extractAddLabel(instruction: string): string {
  const m = /(.+?)(?:を|の)?(?:ステップ)?(?:を)?(?:追加|足して|入れて)/.exec(instruction)
  return m ? cleanLabel(m[1].split(/[、。]/).pop() ?? m[1]) : "新しいステップ"
}

function orderBySequence(a: FlowNode, b: FlowNode, state: FlowState): [FlowNode, FlowNode] {
  // aからbへ到達できるならa→b、そうでなければb→a
  const adj = new Map<string, string[]>()
  state.edges.forEach((e) => adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]))
  const stack = [a.id]
  const seen = new Set<string>()
  while (stack.length) {
    const id = stack.pop()!
    if (id === b.id) return [a, b]
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(adj.get(id) ?? []))
  }
  return [b, a]
}

function midpoint(a: FlowNode, b: FlowNode) {
  return {
    x: (a.position.x + b.position.x) / 2 + 30,
    y: (a.position.y + b.position.y) / 2 + 20,
  }
}

function previewInsertBetween(s: FlowState, aId: string, bId: string, label: string): FlowState {
  const a = s.nodes.find((n) => n.id === aId)!
  const b = s.nodes.find((n) => n.id === bId)!
  const node = makeNode(label, a.data.lane, "process", midpoint(a, b), { diff: "add" })
  return {
    ...s,
    nodes: [...s.nodes, node],
    edges: [
      ...s.edges.filter((e) => !(e.source === aId && e.target === bId)),
      { id: uid("e"), source: aId, target: node.id, animated: true },
      { id: uid("e"), source: node.id, target: bId, animated: true },
    ],
  }
}

function insertBetween(s: FlowState, aId: string, bId: string, label: string): FlowState {
  const preview = previewInsertBetween(s, aId, bId, label)
  const cleaned = {
    ...preview,
    nodes: preview.nodes.map((n) => ({ ...n, data: { ...n.data, diff: undefined } })),
    edges: preview.edges.map((e) => ({ ...e, animated: false })),
  }
  return autoLayout(cleaned)
}

function previewAppend(s: FlowState, label: string): FlowState {
  const last = s.nodes[s.nodes.length - 1]
  const pos = last ? { x: last.position.x, y: last.position.y + 140 } : { x: 60, y: 40 }
  const node = makeNode(label, last?.data.lane ?? s.lanes[0] ?? "担当者", "process", pos, { diff: "add" })
  return {
    ...s,
    nodes: [...s.nodes, node],
    edges: last ? [...s.edges, { id: uid("e"), source: last.id, target: node.id, animated: true }] : s.edges,
  }
}

function applyAppend(s: FlowState, label: string): FlowState {
  const preview = previewAppend(s, label)
  const cleaned = {
    ...preview,
    nodes: preview.nodes.map((n) => ({ ...n, data: { ...n.data, diff: undefined } })),
    edges: preview.edges.map((e) => ({ ...e, animated: false })),
  }
  return autoLayout(cleaned)
}

export function removeNodeAndReconnect(s: FlowState, nodeId: string): FlowState {
  const incoming = s.edges.filter((e) => e.target === nodeId)
  const outgoing = s.edges.filter((e) => e.source === nodeId)
  const bridges: FlowEdge[] = []
  for (const i of incoming) {
    for (const o of outgoing) {
      if (i.source !== o.target) {
        bridges.push({ id: uid("e"), source: i.source, target: o.target })
      }
    }
  }
  const next = {
    ...s,
    nodes: s.nodes.filter((n) => n.id !== nodeId),
    edges: [
      ...s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      ...bridges,
    ],
  }
  return autoLayout(next)
}

/**
 * フロー図の再生成(F-2)。
 * 手動修正フラグ(manual)が付いたノードと、その結線は保護して残す。
 */
export function regeneratePreservingManual(current: FlowState, projectName: string): FlowState {
  const generated = generateFlowFromHearing(projectName)
  const manualNodes = current.nodes.filter((n) => n.data.manual)
  const manualIds = new Set(manualNodes.map((n) => n.id))
  const survivingIds = new Set([...generated.nodes.map((n) => n.id), ...manualIds])
  const keptManualEdges = current.edges.filter(
    (e) =>
      (manualIds.has(e.source) || manualIds.has(e.target)) &&
      survivingIds.has(e.source) &&
      survivingIds.has(e.target),
  )
  return autoLayout({
    lanes: [...new Set([...generated.lanes, ...manualNodes.map((n) => n.data.lane)])],
    nodes: [...generated.nodes, ...manualNodes],
    edges: [...generated.edges, ...keptManualEdges],
  })
}

/** ヒアリング回答からフロー図をモック生成する(F-2) — 横軸スイムレーン */
export function generateFlowFromHearing(projectName: string): FlowState {
  const lanes = ["担当者", "確認者"]
  const n0 = uid("n")
  const n1 = uid("n")
  const n2 = uid("n")
  const n3 = uid("n")
  const n4 = uid("n")
  const nodes: FlowNode[] = [
    { id: n0, type: "step", position: { x: 0, y: 0 }, data: { label: "業務開始(トリガー受領)", lane: "担当者", kind: "start", system: "—", source: "q4: 開始条件" } },
    { id: n1, type: "step", position: { x: 0, y: 0 }, data: { label: `${projectName}の準備作業`, lane: "担当者", kind: "process", system: "業務システム", source: "q8: 手順1" } },
    { id: n2, type: "step", position: { x: 0, y: 0 }, data: { label: "メインの作業を実施", lane: "担当者", kind: "process", system: "業務システム", source: "q8: 手順2" } },
    { id: n3, type: "step", position: { x: 0, y: 0 }, data: { label: "内容に問題ない?", lane: "確認者", kind: "decision", source: "q9: 分岐" } },
    { id: n4, type: "step", position: { x: 0, y: 0 }, data: { label: "完了処理・記録", lane: "確認者", kind: "end", system: "業務システム", source: "q7: 完了条件" } },
  ]
  const edges: FlowEdge[] = [
    { id: uid("e"), source: n0, target: n1 },
    { id: uid("e"), source: n1, target: n2 },
    { id: uid("e"), source: n2, target: n3 },
    { id: uid("e"), source: n3, target: n4, label: "はい" },
    { id: uid("e"), source: n3, target: n1, label: "いいえ(やり直し)" },
  ]
  return autoLayout({ lanes, nodes, edges })
}
