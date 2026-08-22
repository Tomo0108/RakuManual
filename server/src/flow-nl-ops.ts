/**
 * フロー図 NL 修正: 構造化操作のパースと適用。
 * LLM が返す ops を実際にフローへ反映する。
 */

import type { FlowEdge, FlowNode, FlowState, StepKind } from "./flow-types.js"
import { uid } from "./flow-utils.js"
import {
  autoLayout,
  colFromX,
  dimForKind,
  normalizeColumnSystems,
} from "./flow-layout.js"
import { makeNode, removeNodeAndReconnect } from "./flow-logic.js"
import { extractJson } from "./ai/structured.js"

export class FlowNlEditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FlowNlEditError"
  }
}

export type FlowNlOp =
  | { op: "setColumnSystemUrl"; system?: string; col?: number; url: string }
  | { op: "renameNode"; nodeId?: string; label?: string; newLabel: string }
  | { op: "removeNode"; nodeId?: string; label?: string }
  | {
      op: "addNode"
      label: string
      lane?: string
      kind?: StepKind
      system?: string
      afterNodeId?: string
      afterLabel?: string
      beforeNodeId?: string
      beforeLabel?: string
      between?: [string, string]
    }
  | { op: "swapNodes"; aNodeId?: string; aLabel?: string; bNodeId?: string; bLabel?: string }
  | {
      op: "moveNode"
      nodeId?: string
      label?: string
      afterNodeId?: string
      afterLabel?: string
      beforeNodeId?: string
      beforeLabel?: string
    }
  | { op: "setNodeSystem"; nodeId?: string; label?: string; system: string }
  | { op: "setNodeLane"; nodeId?: string; label?: string; lane: string }
  | { op: "setEdgeLabel"; source: string; target: string; label: string }

export interface FlowNlEditResult {
  flow: FlowState
  description: string
}

/** LLM 用: ノード一覧（座標なし） */
export function summarizeFlowForNlEdit(flow: FlowState) {
  return {
    lanes: flow.lanes,
    columnSystems: flow.layoutMeta?.columnSystems?.map((c, i) => ({ col: i, ...c })),
    nodes: flow.nodes.map((n) => ({
      id: n.id,
      label: n.data.label,
      kind: n.data.kind,
      lane: n.data.lane,
      system: n.data.system,
    })),
    edges: flow.edges.map((e) => ({
      source: e.source,
      target: e.target,
      label: e.label,
    })),
  }
}

export function parseFlowNlEditResponse(text: string): { description: string; ops: FlowNlOp[] } | null {
  try {
    const raw = JSON.parse(extractJson(text)) as {
      description?: unknown
      ops?: unknown
    }
    if (!Array.isArray(raw.ops) || raw.ops.length === 0) return null
    const ops: FlowNlOp[] = []
    for (const item of raw.ops) {
      const op = normalizeOp(item)
      if (op) ops.push(op)
    }
    if (ops.length === 0) return null
    const description =
      typeof raw.description === "string" && raw.description.trim()
        ? raw.description.trim()
        : "フロー図を修正します"
    return { description, ops }
  } catch {
    return null
  }
}

function normalizeOp(raw: unknown): FlowNlOp | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const op = String(o.op ?? "")
  switch (op) {
    case "setColumnSystemUrl":
      if (!o.url) return null
      return {
        op,
        system: o.system != null ? String(o.system) : undefined,
        col: o.col != null ? Number(o.col) : undefined,
        url: String(o.url),
      }
    case "renameNode":
      if (!o.newLabel) return null
      return {
        op,
        nodeId: o.nodeId != null ? String(o.nodeId) : undefined,
        label: o.label != null ? String(o.label) : undefined,
        newLabel: String(o.newLabel),
      }
    case "removeNode":
      return {
        op,
        nodeId: o.nodeId != null ? String(o.nodeId) : undefined,
        label: o.label != null ? String(o.label) : undefined,
      }
    case "addNode":
      if (!o.label) return null
      return {
        op,
        label: String(o.label),
        lane: o.lane != null ? String(o.lane) : undefined,
        kind: parseKind(o.kind),
        system: o.system != null ? String(o.system) : undefined,
        afterNodeId: o.afterNodeId != null ? String(o.afterNodeId) : undefined,
        afterLabel: o.afterLabel != null ? String(o.afterLabel) : undefined,
        beforeNodeId: o.beforeNodeId != null ? String(o.beforeNodeId) : undefined,
        beforeLabel: o.beforeLabel != null ? String(o.beforeLabel) : undefined,
        between: Array.isArray(o.between) && o.between.length === 2
          ? [String(o.between[0]), String(o.between[1])]
          : undefined,
      }
    case "swapNodes":
      return {
        op,
        aNodeId: o.aNodeId != null ? String(o.aNodeId) : undefined,
        aLabel: o.aLabel != null ? String(o.aLabel) : undefined,
        bNodeId: o.bNodeId != null ? String(o.bNodeId) : undefined,
        bLabel: o.bLabel != null ? String(o.bLabel) : undefined,
      }
    case "moveNode":
      return {
        op,
        nodeId: o.nodeId != null ? String(o.nodeId) : undefined,
        label: o.label != null ? String(o.label) : undefined,
        afterNodeId: o.afterNodeId != null ? String(o.afterNodeId) : undefined,
        afterLabel: o.afterLabel != null ? String(o.afterLabel) : undefined,
        beforeNodeId: o.beforeNodeId != null ? String(o.beforeNodeId) : undefined,
        beforeLabel: o.beforeLabel != null ? String(o.beforeLabel) : undefined,
      }
    case "setNodeSystem":
      if (o.system == null) return null
      return {
        op,
        nodeId: o.nodeId != null ? String(o.nodeId) : undefined,
        label: o.label != null ? String(o.label) : undefined,
        system: String(o.system),
      }
    case "setNodeLane":
      if (!o.lane) return null
      return {
        op,
        nodeId: o.nodeId != null ? String(o.nodeId) : undefined,
        label: o.label != null ? String(o.label) : undefined,
        lane: String(o.lane),
      }
    case "setEdgeLabel":
      if (!o.source || !o.target || o.label == null) return null
      return {
        op,
        source: String(o.source),
        target: String(o.target),
        label: String(o.label),
      }
    default:
      return null
  }
}

function parseKind(raw: unknown): StepKind | undefined {
  const k = String(raw ?? "")
  if (k === "start" || k === "end" || k === "decision" || k === "process") return k
  return undefined
}

/** LLM ops が指示の意図と明らかに矛盾する場合は却下 */
export function opsPlausibleForInstruction(instruction: string, ops: FlowNlOp[]): boolean {
  const linkIntent = /リンク|URL|url|利用システム/.test(instruction)
  const hasLinkOp = ops.some((o) => o.op === "setColumnSystemUrl")
  const hasAddNode = ops.some((o) => o.op === "addNode")
  if (linkIntent && hasAddNode && !hasLinkOp) return false
  const swapIntent = /入れ替|入替|順序|順番|交換/.test(instruction)
  if (swapIntent && hasAddNode && !ops.some((o) => o.op === "swapNodes" || o.op === "moveNode")) return false
  return true
}

export function applyFlowNlOps(
  flow: FlowState,
  ops: FlowNlOp[],
  description: string,
): FlowNlEditResult {
  let state = flow
  for (const op of ops) {
    state = applyOneOp(state, op)
  }
  return { flow: autoLayout(state), description }
}

function applyOneOp(state: FlowState, op: FlowNlOp): FlowState {
  switch (op.op) {
    case "setColumnSystemUrl":
      return applyColumnSystemUrl(state, op)
    case "renameNode":
      return renameNode(state, op)
    case "removeNode":
      return removeNode(state, op)
    case "addNode":
      return addNodeOp(state, op)
    case "swapNodes":
      return swapNodesOp(state, op)
    case "moveNode":
      return moveNodeOp(state, op)
    case "setNodeSystem":
      return patchNode(state, op, { system: op.system, manual: true })
    case "setNodeLane":
      return patchNode(state, op, { lane: op.lane, manual: true })
    case "setEdgeLabel":
      return setEdgeLabel(state, op.source, op.target, op.label)
    default:
      throw new FlowNlEditError("未対応の操作です")
  }
}

function resolveNode(
  state: FlowState,
  ref: { nodeId?: string; label?: string },
): FlowNode {
  if (ref.nodeId) {
    const byId = state.nodes.find((n) => n.id === ref.nodeId)
    if (byId) return byId
  }
  if (ref.label) {
    const exact = state.nodes.find((n) => n.data.label === ref.label)
    if (exact) return exact
    const partial = state.nodes
      .filter(
        (n) =>
          n.data.label.includes(ref.label!) ||
          ref.label!.includes(n.data.label) ||
          looseIncludes(ref.label!, n.data.label),
      )
      .sort((a, b) => b.data.label.length - a.data.label.length)
    if (partial[0]) return partial[0]
  }
  throw new FlowNlEditError(
    `ステップが見つかりません: ${ref.label ?? ref.nodeId ?? "?"}`,
  )
}

function resolveNodeId(state: FlowState, idOrLabel: string): string {
  const byId = state.nodes.find((n) => n.id === idOrLabel)
  if (byId) return byId.id
  return resolveNode(state, { label: idOrLabel }).id
}

function looseIncludes(text: string, label: string): boolean {
  const head = label.slice(0, Math.min(6, label.length))
  return head.length >= 4 && text.includes(head)
}

function applyColumnSystemUrl(
  state: FlowState,
  op: Extract<FlowNlOp, { op: "setColumnSystemUrl" }>,
): FlowState {
  let url = op.url.trim()
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`

  const columnCount = Math.max(
    state.layoutMeta?.columnCount ?? 0,
    state.nodes.length
      ? Math.max(
          ...state.nodes.map((n) => {
            const k = n.data.kind
            const dims = dimForKind(k === "start" || k === "end" || k === "decision" ? k : "process")
            return colFromX(n.position.x, dims.w)
          }),
        ) + 1
      : 0,
  )
  if (columnCount === 0) throw new FlowNlEditError("列がありません")

  const cols = normalizeColumnSystems(state.layoutMeta?.columnSystems, columnCount)
  const kw = op.system?.toLowerCase()
  let updated = 0
  const next = cols.map((entry, col) => {
    if (op.col != null && col !== op.col) return entry
    if (op.col == null && kw && !entry.label.toLowerCase().includes(kw) && kw !== entry.label.toLowerCase()) {
      const colSys = systemsInColumn(state, col)
      if (![...colSys].some((s) => s.toLowerCase().includes(kw) || kw.includes(s.toLowerCase()))) return entry
    }
    updated++
    return { ...entry, url }
  })
  if (updated === 0) throw new FlowNlEditError(`利用システム「${op.system ?? op.col}」が見つかりません`)
  return {
    ...state,
    layoutMeta: {
      columnCount: next.length,
      columnSystems: next,
      layoutVersion: state.layoutMeta?.layoutVersion,
    },
  }
}

function systemsInColumn(state: FlowState, col: number): Set<string> {
  const systems = new Set<string>()
  for (const n of state.nodes) {
    const sys = n.data.system?.trim()
    if (!sys || sys === "—") continue
    const k = n.data.kind
    const dims = dimForKind(k === "start" || k === "end" || k === "decision" ? k : "process")
    if (colFromX(n.position.x, dims.w) === col) systems.add(sys)
  }
  return systems
}

function renameNode(
  state: FlowState,
  op: Extract<FlowNlOp, { op: "renameNode" }>,
): FlowState {
  const node = resolveNode(state, op)
  if (node.data.kind === "start" || node.data.kind === "end") {
    throw new FlowNlEditError("開始・終了ステップの名前は変更できません")
  }
  return {
    ...state,
    nodes: state.nodes.map((n) =>
      n.id === node.id
        ? { ...n, data: { ...n.data, label: op.newLabel, manual: true } }
        : n,
    ),
  }
}

function removeNode(
  state: FlowState,
  op: Extract<FlowNlOp, { op: "removeNode" }>,
): FlowState {
  const node = resolveNode(state, op)
  if (node.data.kind === "start" || node.data.kind === "end") {
    throw new FlowNlEditError("開始・終了ステップは削除できません")
  }
  return removeNodeAndReconnect(state, node.id)
}

function addNodeOp(state: FlowState, op: Extract<FlowNlOp, { op: "addNode" }>): FlowState {
  const kind = op.kind ?? "process"
  if (kind === "start" || kind === "end") throw new FlowNlEditError("開始・終了は追加できません")

  if (op.between) {
    const aId = resolveNodeId(state, op.between[0])
    const bId = resolveNodeId(state, op.between[1])
    return insertBetweenExisting(state, aId, bId, op.label, kind, op.lane, op.system)
  }
  if (op.afterNodeId || op.afterLabel) {
    const after = resolveNode(state, { nodeId: op.afterNodeId, label: op.afterLabel })
    const next = primaryNextEdge(state, after.id)
    if (!next) throw new FlowNlEditError(`「${after.data.label}」の後に挿入できるステップがありません`)
    return insertBetweenExisting(state, after.id, next.target, op.label, kind, op.lane, op.system)
  }
  if (op.beforeNodeId || op.beforeLabel) {
    const before = resolveNode(state, { nodeId: op.beforeNodeId, label: op.beforeLabel })
    const prev = state.edges.find((e) => e.target === before.id)
    if (!prev) throw new FlowNlEditError(`「${before.data.label}」の前に挿入できるステップがありません`)
    return insertBetweenExisting(state, prev.source, before.id, op.label, kind, op.lane, op.system)
  }
  throw new FlowNlEditError("追加位置（afterLabel / beforeLabel / between）を指定してください")
}

function insertBetweenExisting(
  state: FlowState,
  aId: string,
  bId: string,
  label: string,
  kind: StepKind,
  lane?: string,
  system?: string,
): FlowState {
  const a = state.nodes.find((n) => n.id === aId)!
  const b = state.nodes.find((n) => n.id === bId)!
  const node = makeNode(label, lane ?? a.data.lane, kind, midpoint(a, b), {
    system,
    manual: true,
  })
  const origEdge = state.edges.find((e) => e.source === aId && e.target === bId)
  const origLabel = typeof origEdge?.label === "string" ? origEdge.label : undefined
  return {
    ...state,
    nodes: [...state.nodes, node],
    edges: [
      ...state.edges.filter((e) => !(e.source === aId && e.target === bId)),
      {
        id: uid("e"),
        source: aId,
        target: node.id,
        ...(origLabel ? { label: origLabel, sourceHandle: origEdge?.sourceHandle } : {}),
      },
      { id: uid("e"), source: node.id, target: bId },
    ],
  }
}

function swapNodesOp(state: FlowState, op: Extract<FlowNlOp, { op: "swapNodes" }>): FlowState {
  const a = resolveNode(state, { nodeId: op.aNodeId, label: op.aLabel })
  const b = resolveNode(state, { nodeId: op.bNodeId, label: op.bLabel })
  if (a.data.kind === "start" || a.data.kind === "end" || b.data.kind === "start" || b.data.kind === "end") {
    throw new FlowNlEditError("開始・終了ステップは入れ替えできません")
  }
  const ab = state.edges.find((e) => e.source === a.id && e.target === b.id)
  if (ab) return swapAdjacentNodes(state, a.id, b.id, ab)
  const ba = state.edges.find((e) => e.source === b.id && e.target === a.id)
  if (ba) return swapAdjacentNodes(state, b.id, a.id, ba)
  return swapByMove(state, a.id, b.id)
}

/** 非隣接: B を A の直前に移動し、A を B の旧位置の直後へ移動 */
function swapByMove(state: FlowState, aId: string, bId: string): FlowState {
  const path = mainSpinePath(state)
  const i = path.indexOf(aId)
  const j = path.indexOf(bId)
  if (i < 0 || j < 0) {
    throw new FlowNlEditError("入れ替え対象が主経路上に見つかりません。隣接するステップ同士を指定してください")
  }
  if (Math.abs(i - j) === 1) {
    const [first, second] = i < j ? [aId, bId] : [bId, aId]
    const edge = state.edges.find((e) => e.source === first && e.target === second)!
    return swapAdjacentNodes(state, first, second, edge)
  }
  let s = detachNode(state, bId)
  const aPrev = s.edges.find((e) => e.target === aId)?.source
  if (!aPrev) throw new FlowNlEditError("入れ替え位置を特定できません")
  s = insertExistingAfter(s, bId, aPrev)
  s = detachNode(s, aId)
  const bNext = primaryNextEdge(s, bId)?.target
  if (!bNext) throw new FlowNlEditError("入れ替え位置を特定できません")
  return insertExistingBefore(s, aId, bNext)
}

function swapAdjacentNodes(
  state: FlowState,
  aId: string,
  bId: string,
  edgeAB: FlowEdge,
): FlowState {
  const inA = state.edges.filter((e) => e.target === aId && e.source !== bId)
  const outB = state.edges.filter((e) => e.source === bId && e.target !== aId)
  const rest = state.edges.filter(
    (e) =>
      e.id !== edgeAB.id &&
      e.target !== aId &&
      e.source !== bId &&
      !(e.source === aId && e.target === bId),
  )
  const newEdges: FlowEdge[] = [...rest]
  for (const e of inA) newEdges.push({ ...e, target: bId })
  newEdges.push({ id: uid("e"), source: bId, target: aId })
  for (const e of outB) newEdges.push({ ...e, source: aId })
  return { ...state, edges: newEdges }
}

function moveNodeOp(state: FlowState, op: Extract<FlowNlOp, { op: "moveNode" }>): FlowState {
  const node = resolveNode(state, op)
  if (node.data.kind === "start" || node.data.kind === "end") {
    throw new FlowNlEditError("開始・終了ステップは移動できません")
  }
  let s = detachNode(state, node.id)
  if (op.afterNodeId || op.afterLabel) {
    const after = resolveNode(s, { nodeId: op.afterNodeId, label: op.afterLabel })
    return insertExistingAfter(s, node.id, after.id)
  }
  if (op.beforeNodeId || op.beforeLabel) {
    const before = resolveNode(s, { nodeId: op.beforeNodeId, label: op.beforeLabel })
    return insertExistingBefore(s, node.id, before.id)
  }
  throw new FlowNlEditError("移動先（afterLabel / beforeLabel）を指定してください")
}

function patchNode(
  state: FlowState,
  ref: { nodeId?: string; label?: string },
  patch: Partial<FlowNode["data"]>,
): FlowState {
  const node = resolveNode(state, ref)
  return {
    ...state,
    nodes: state.nodes.map((n) =>
      n.id === node.id ? { ...n, data: { ...n.data, ...patch } } : n,
    ),
  }
}

function setEdgeLabel(state: FlowState, source: string, target: string, label: string): FlowState {
  const src = resolveNodeId(state, source)
  const tgt = resolveNodeId(state, target)
  const idx = state.edges.findIndex((e) => e.source === src && e.target === tgt)
  if (idx < 0) throw new FlowNlEditError("指定の結線が見つかりません")
  const edges = [...state.edges]
  edges[idx] = { ...edges[idx], label }
  return { ...state, edges }
}

function primaryNextEdge(state: FlowState, nodeId: string): FlowEdge | undefined {
  const outs = state.edges.filter((e) => e.source === nodeId)
  return (
    outs.find((e) => !/いいえ|不要|否|差し|no/i.test(String(e.label ?? ""))) ?? outs[0]
  )
}

function mainSpinePath(state: FlowState): string[] {
  const start = state.nodes.find((n) => n.data.kind === "start")
  if (!start) return []
  const path = [start.id]
  let cur = start.id
  const seen = new Set([cur])
  for (let guard = 0; guard < state.nodes.length + 2; guard++) {
    const next = primaryNextEdge(state, cur)
    if (!next || seen.has(next.target)) break
    path.push(next.target)
    seen.add(next.target)
    cur = next.target
  }
  return path
}

function detachNode(state: FlowState, nodeId: string): FlowState {
  const incoming = state.edges.filter((e) => e.target === nodeId)
  const outgoing = state.edges.filter((e) => e.source === nodeId)
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
  return {
    ...state,
    edges: [
      ...state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      ...bridges,
    ],
  }
}

function insertExistingAfter(state: FlowState, nodeId: string, afterId: string): FlowState {
  const next = primaryNextEdge(state, afterId)
  if (!next) throw new FlowNlEditError("挿入先の後続ステップがありません")
  const orig = state.edges.find((e) => e.source === afterId && e.target === next.target)
  const origLabel = typeof orig?.label === "string" ? orig.label : undefined
  return {
    ...state,
    edges: [
      ...state.edges.filter((e) => !(e.source === afterId && e.target === next.target)),
      {
        id: uid("e"),
        source: afterId,
        target: nodeId,
        ...(origLabel ? { label: origLabel, sourceHandle: orig?.sourceHandle } : {}),
      },
      { id: uid("e"), source: nodeId, target: next.target },
    ],
  }
}

function insertExistingBefore(state: FlowState, nodeId: string, beforeId: string): FlowState {
  const prev = state.edges.find((e) => e.target === beforeId)
  if (!prev) throw new FlowNlEditError("挿入先の前ステップがありません")
  const origLabel = typeof prev.label === "string" ? prev.label : undefined
  return {
    ...state,
    edges: [
      ...state.edges.filter((e) => e.id !== prev.id),
      { id: uid("e"), source: prev.source, target: nodeId, ...(origLabel ? { label: origLabel, sourceHandle: prev.sourceHandle } : {}) },
      { id: uid("e"), source: nodeId, target: beforeId },
    ],
  }
}

function midpoint(a: FlowNode, b: FlowNode) {
  return {
    x: (a.position.x + b.position.x) / 2 + 30,
    y: (a.position.y + b.position.y) / 2 + 20,
  }
}
