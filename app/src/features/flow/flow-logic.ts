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
 * @deprecated NL 修正は API (flow-nl-ops) 経由。クライアント単体では使わない。
 */
export function interpretInstruction(_instruction: string, _state: FlowState): NlProposal | null {
  return null
}

/* ---------- 内部ヘルパー ---------- */

function midpoint(a: FlowNode, b: FlowNode) {
  return {
    x: (a.position.x + b.position.x) / 2 + 30,
    y: (a.position.y + b.position.y) / 2 + 20,
  }
}

function previewInsertBetween(
  s: FlowState,
  aId: string,
  bId: string,
  label: string,
  kind: FlowNode["data"]["kind"] = "process",
  connectorId?: string,
): FlowState {
  const a = s.nodes.find((n) => n.id === aId)!
  const b = s.nodes.find((n) => n.id === bId)!
  const node = makeNode(label, a.data.lane, kind, midpoint(a, b), {
    diff: "add",
    ...(connectorId ? { connectorId } : {}),
  })
  const origEdge = s.edges.find((e) => e.source === aId && e.target === bId)
  const origLabel = typeof origEdge?.label === "string" ? origEdge.label : undefined
  return {
    ...s,
    nodes: [...s.nodes, node],
    edges: [
      ...s.edges.filter((e) => !(e.source === aId && e.target === bId)),
      {
        id: uid("e"),
        source: aId,
        target: node.id,
        animated: true,
        ...(origLabel ? { label: origLabel, sourceHandle: origEdge?.sourceHandle } : {}),
      },
      { id: uid("e"), source: node.id, target: bId, animated: true },
    ],
  }
}

function insertBetween(
  s: FlowState,
  aId: string,
  bId: string,
  label: string,
  kind: FlowNode["data"]["kind"] = "process",
  connectorId?: string,
): FlowState {
  const preview = previewInsertBetween(s, aId, bId, label, kind, connectorId)
  const cleaned = {
    ...preview,
    nodes: preview.nodes.map((n) => ({ ...n, data: { ...n.data, diff: undefined } })),
    edges: preview.edges.map((e) => ({ ...e, animated: false })),
  }
  return autoLayout(cleaned)
}

/** 2ステップの間にコネクタ(ステップ種別)を挿入する */
export function insertConnectorBetween(
  state: FlowState,
  sourceId: string,
  targetId: string,
  kind: FlowNode["data"]["kind"],
  label?: string,
  connectorId?: string,
): FlowState {
  const defaults: Record<FlowNode["data"]["kind"], string> = {
    start: "開始",
    process: "新しいステップ",
    decision: "条件分岐?",
    end: "完了",
  }
  return insertBetween(
    state,
    sourceId,
    targetId,
    label ?? defaults[kind],
    kind,
    connectorId,
  )
}

/** ノードの直後(主経路)にコネクタを挿入する */
export function insertConnectorAfter(
  state: FlowState,
  nodeId: string,
  kind: FlowNode["data"]["kind"],
  label?: string,
  connectorId?: string,
): FlowState {
  const outgoing = state.edges.filter((e) => e.source === nodeId)
  const primary =
    outgoing.find((e) => {
      const lbl = typeof e.label === "string" ? e.label : ""
      return !/いいえ|no/i.test(lbl)
    }) ?? outgoing[0]
  if (primary) {
    return insertConnectorBetween(state, nodeId, primary.target, kind, label, connectorId)
  }
  return appendConnector(state, kind, label, nodeId, connectorId)
}

/** フロー末尾(または指定ノードの後)にコネクタを追加する */
export function appendConnector(
  state: FlowState,
  kind: FlowNode["data"]["kind"],
  label?: string,
  afterNodeId?: string,
  connectorId?: string,
): FlowState {
  const defaults: Record<FlowNode["data"]["kind"], string> = {
    start: "開始",
    process: "新しいステップ",
    decision: "条件分岐?",
    end: "完了",
  }
  const actualLabel = label ?? defaults[kind]
  const anchor =
    (afterNodeId ? state.nodes.find((n) => n.id === afterNodeId) : undefined) ??
    state.nodes.filter((n) => n.data.kind !== "end").at(-1) ??
    state.nodes[state.nodes.length - 1]
  const lane = anchor?.data.lane ?? state.lanes[0] ?? "担当者"
  const pos = anchor
    ? { x: anchor.position.x + 120, y: anchor.position.y }
    : { x: 60, y: 40 }
  const node = makeNode(actualLabel, lane, kind, pos, {
    ...(connectorId ? { connectorId } : {}),
  })
  const edges = anchor
    ? [...state.edges, { id: uid("e"), source: anchor.id, target: node.id }]
    : state.edges
  return autoLayout({
    ...state,
    lanes: state.lanes.length > 0 ? state.lanes : [lane],
    nodes: [...state.nodes, node],
    edges,
  })
}

export function removeNodeAndReconnect(s: FlowState, nodeId: string): FlowState {
  const incoming = s.edges.filter((e) => e.target === nodeId)
  const outgoing = s.edges.filter((e) => e.source === nodeId)
  const bridges: FlowEdge[] = []
  for (const i of incoming) {
    for (const o of outgoing) {
      if (i.source !== o.target) {
        bridges.push({
          id: uid("e"),
          source: i.source,
          target: o.target,
          ...(typeof i.label === "string" ? { label: i.label, sourceHandle: i.sourceHandle } : {}),
        })
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
