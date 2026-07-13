import type { FlowEdge, FlowNode, FlowState, ColumnSystemEntry } from "@/lib/types"
import { assignSectionNumbers } from "./flow-numbering"

/** ノード種別ごとのレイアウト寸法(StepNode と一致させる) */
export const NODE_DIMS = {
  start: { w: 168, h: 52 },
  end: { w: 168, h: 52 },
  process: { w: 188, h: 72 },
  decision: { w: 148, h: 88 },
} as const

export const TEAM_LABEL_WIDTH = 112
export const AXIS_HEADER_HEIGHT = 32
export const FLOW_MINIMAP_WIDTH = 132
export const FLOW_MINIMAP_HEIGHT = 88
export const LANE_ROW_HEIGHT = 112
export const LANE_STACK_GAP = 14
export const LANE_PADDING = 12
export const COL_WIDTH = 240
export const SYSTEM_ROW_HEIGHT = 44
export const FLOW_PADDING_LEFT = 16
export const FLOW_PADDING_TOP = 12

export const FLOW_ORIGIN_X = FLOW_PADDING_LEFT
export const FLOW_ORIGIN_Y = FLOW_PADDING_TOP

export function dimForKind(kind: string) {
  if (kind === "start" || kind === "end" || kind === "decision") return NODE_DIMS[kind]
  return NODE_DIMS.process
}

function nodeDims(n: FlowNode) {
  const k = n.data.kind
  return dimForKind(k === "start" || k === "end" || k === "decision" ? k : "process")
}

export function laneCenterY(laneIndex: number, metrics?: LaneRowMetric[]): number {
  if (metrics?.[laneIndex]) {
    const m = metrics[laneIndex]
    return m.top + m.height / 2
  }
  return FLOW_ORIGIN_Y + laneIndex * LANE_ROW_HEIGHT + LANE_ROW_HEIGHT / 2
}

export function colCenterX(col: number): number {
  return FLOW_ORIGIN_X + col * COL_WIDTH + COL_WIDTH / 2
}

/** 単一ノードを担当行の中央に配置 */
export function nodeYInLaneMetric(metric: LaneRowMetric, nodeHeight: number): number {
  return metric.top + (metric.height - nodeHeight) / 2
}

/** 同一列に縦並びするノード用のY座標 */
export function stackedYInLaneMetric(metric: LaneRowMetric, slot: number, nodeHeight: number): number {
  return metric.top + LANE_PADDING + slot * (nodeHeight + LANE_STACK_GAP)
}

export function yInLaneForStack(
  metric: LaneRowMetric,
  slot: number,
  stackCount: number,
  nodeHeight: number,
): number {
  if (stackCount <= 1) return nodeYInLaneMetric(metric, nodeHeight)
  return stackedYInLaneMetric(metric, slot, nodeHeight)
}

export function nodeYInLane(laneIndex: number, nodeHeight: number, slot = 0): number {
  const slotOffset = slot * (LANE_ROW_HEIGHT * 0.55)
  return laneCenterY(laneIndex) - nodeHeight / 2 + slotOffset
}

/** @deprecated layoutAllLaneNodes 経由の metric ベース配置を推奨 */
export function stackedYInLane(laneIndex: number, slot: number, nodeHeight: number): number {
  const rowTop = FLOW_ORIGIN_Y + laneIndex * LANE_ROW_HEIGHT
  return rowTop + LANE_PADDING + slot * (nodeHeight + LANE_STACK_GAP)
}

export function nodeXInCol(col: number, nodeWidth: number): number {
  return FLOW_ORIGIN_X + col * COL_WIDTH + (COL_WIDTH - nodeWidth) / 2
}

/** ノード中心Yから最寄り担当行インデックス */
export function nearestLaneIndex(
  y: number,
  nodeHeight: number,
  laneCount: number,
  metrics?: LaneRowMetric[],
): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < laneCount; i++) {
    const center = laneCenterY(i, metrics)
    const dist = Math.abs(y + nodeHeight / 2 - center)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

/** ノードXから列インデックス */
export function colFromX(x: number, nodeWidth: number): number {
  const center = x + nodeWidth / 2
  return Math.max(0, Math.round((center - FLOW_ORIGIN_X - COL_WIDTH / 2) / COL_WIDTH))
}

/** ドラッグ終了時: 行・列スナップ + 担当チーム更新(同列重なりは縦に積む) */
export function snapNodePosition(
  node: FlowNode,
  laneCount: number,
  lanes: string[],
  others: FlowNode[] = [],
): { position: { x: number; y: number }; lane: string } {
  const kind = node.data.kind
  const dims = dimForKind(kind === "start" || kind === "end" || kind === "decision" ? kind : "process")
  const allNodes = [...others.filter((n) => n.id !== node.id), node]
  const metrics = computeLaneRowMetrics(allNodes, lanes)
  const li = nearestLaneIndex(node.position.y, dims.h, laneCount, metrics)
  const col = colFromX(node.position.x, dims.w)
  const lane = lanes[li] ?? lanes[lanes.length - 1] ?? "担当者"
  const metric = metrics[li] ?? { top: FLOW_ORIGIN_Y, height: LANE_ROW_HEIGHT }

  const peersInCol = others
    .filter((n) => {
      if (n.id === node.id || n.data.lane !== lane) return false
      return colFromX(n.position.x, nodeDims(n).w) === col
    })
    .sort((a, b) => a.position.y - b.position.y)

  const stackCount = peersInCol.length + 1
  let slot = 0
  if (peersInCol.length > 0) {
    const ordered = [...peersInCol, node].sort((a, b) => {
      if (a.id === node.id) return node.position.y - b.position.y
      if (b.id === node.id) return a.position.y - node.position.y
      return a.position.y - b.position.y
    })
    slot = ordered.findIndex((n) => n.id === node.id)
  }

  return {
    position: {
      x: nodeXInCol(col, dims.w),
      y: yInLaneForStack(metric, slot, stackCount, dims.h),
    },
    lane,
  }
}

/** 担当行の累積レイアウトに合わせて全ノードのY座標を再配置 */
export function layoutAllLaneNodes(nodes: FlowNode[], lanes: string[]): FlowNode[] {
  if (nodes.length === 0) return nodes

  const metrics = computeLaneRowMetrics(nodes, lanes)
  const byLaneCol = new Map<string, FlowNode[]>()

  for (const n of nodes) {
    const li = lanes.indexOf(n.data.lane)
    if (li < 0) continue
    const col = colFromX(n.position.x, nodeDims(n).w)
    const key = `${n.data.lane}:${col}`
    if (!byLaneCol.has(key)) byLaneCol.set(key, [])
    byLaneCol.get(key)!.push(n)
  }

  return nodes.map((n) => {
    const li = lanes.indexOf(n.data.lane)
    if (li < 0) return n
    const dims = nodeDims(n)
    const col = colFromX(n.position.x, dims.w)
    const key = `${n.data.lane}:${col}`
    const group = byLaneCol.get(key) ?? [n]
    const sorted = [...group].sort((a, b) => a.position.y - b.position.y)
    const slot = sorted.findIndex((x) => x.id === n.id)
    const metric = metrics[li] ?? { top: FLOW_ORIGIN_Y, height: LANE_ROW_HEIGHT }

    return {
      ...n,
      position: {
        x: nodeXInCol(col, dims.w),
        y: yInLaneForStack(metric, slot, sorted.length, dims.h),
      },
    }
  })
}

/** 同一担当チーム・同一列のノードを縦に整列し直す */
export function restackLaneColumnNodes(nodes: FlowNode[], lanes: string[]): FlowNode[] {
  return layoutAllLaneNodes(nodes, lanes)
}

/** 旧 string[] 形式との互換 */
export function normalizeColumnSystems(
  raw: ColumnSystemEntry[] | string[] | undefined,
  count: number,
): ColumnSystemEntry[] {
  const existing: ColumnSystemEntry[] = (raw ?? []).map((item) =>
    typeof item === "string" ? { label: item } : item,
  )
  return Array.from({ length: count }, (_, col) => ({
    label: existing[col]?.label ?? "—",
    url: existing[col]?.url,
  }))
}

/**
 * ノード位置から layoutMeta(列数・利用システム)を再計算。
 * 追加/削除/ドラッグ後も下部パネルと整合させる。
 */
export function syncLayoutMeta(state: FlowState): FlowState {
  if (state.nodes.length === 0) {
    return { ...state, layoutMeta: { columnCount: 0, columnSystems: [] } }
  }

  const prev = normalizeColumnSystems(state.layoutMeta?.columnSystems, state.layoutMeta?.columnCount ?? 0)
  const colMap = new Map<number, Set<string>>()
  let maxCol = 0

  for (const n of state.nodes) {
    const kind = n.data.kind
    const dims = dimForKind(kind === "start" || kind === "end" || kind === "decision" ? kind : "process")
    const col = colFromX(n.position.x, dims.w)
    maxCol = Math.max(maxCol, col)
    if (!colMap.has(col)) colMap.set(col, new Set())
    const sys = n.data.system?.trim()
    if (sys && sys !== "—") colMap.get(col)!.add(sys)
  }

  const columnCount = maxCol + 1
  const columnSystems: ColumnSystemEntry[] = Array.from({ length: columnCount }, (_, col) => {
    const systems = colMap.get(col)
    const autoLabel = systems && systems.size > 0 ? [...systems].join(" / ") : "—"
    const kept = prev[col]
    return {
      label: kept?.label && kept.label !== "—" && autoLabel === "—" ? kept.label : autoLabel,
      url: kept?.url,
    }
  })

  return { ...state, layoutMeta: { columnCount, columnSystems } }
}

/** 分岐ノードの出口ハンドル ID */
export const DECISION_HANDLE = { yes: "yes", no: "no" } as const

const FLOW_BOUNDS_PADDING = 32

/** ノード配置からフロー図の表示範囲を算出 */
export function flowContentBounds(state: FlowState) {
  if (state.nodes.length === 0) {
    return { minX: 0, minY: 0, width: 400, height: 300 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const n of state.nodes) {
    const kind = n.data.kind
    const dims = dimForKind(kind === "start" || kind === "end" || kind === "decision" ? kind : "process")
    minX = Math.min(minX, n.position.x)
    minY = Math.min(minY, n.position.y)
    maxX = Math.max(maxX, n.position.x + dims.w)
    maxY = Math.max(maxY, n.position.y + dims.h)
  }

  const paddedMinX = Math.max(0, minX - FLOW_BOUNDS_PADDING)
  const paddedMinY = Math.max(0, minY - FLOW_BOUNDS_PADDING)
  const paddedMaxX = maxX + FLOW_BOUNDS_PADDING
  const paddedMaxY = maxY + FLOW_BOUNDS_PADDING

  return {
    minX: paddedMinX,
    minY: paddedMinY,
    width: paddedMaxX - paddedMinX,
    height: paddedMaxY - paddedMinY,
  }
}

/** ビューポート X の移動可能範囲 */
export function flowPanXRange(bounds: ReturnType<typeof flowContentBounds>, viewWidth: number, zoom: number) {
  const scaledW = bounds.width * zoom
  if (scaledW <= viewWidth) {
    const centered = (viewWidth - scaledW) / 2 - bounds.minX * zoom
    return { min: centered, max: centered }
  }
  return {
    min: viewWidth - (bounds.minX + bounds.width) * zoom,
    max: -bounds.minX * zoom,
  }
}

export function clampFlowPanX(
  x: number,
  bounds: ReturnType<typeof flowContentBounds>,
  viewWidth: number,
  zoom: number,
) {
  const { min, max } = flowPanXRange(bounds, viewWidth, zoom)
  return Math.max(min, Math.min(max, x))
}

/** ビューポート Y の移動可能範囲 */
export function flowPanYRange(bounds: ReturnType<typeof flowContentBounds>, viewHeight: number, zoom: number) {
  const scaledH = bounds.height * zoom
  if (scaledH <= viewHeight) {
    const centered = (viewHeight - scaledH) / 2 - bounds.minY * zoom
    return { min: centered, max: centered }
  }
  return {
    min: viewHeight - (bounds.minY + bounds.height) * zoom,
    max: -bounds.minY * zoom,
  }
}

export function clampFlowPanY(
  y: number,
  bounds: ReturnType<typeof flowContentBounds>,
  viewHeight: number,
  zoom: number,
) {
  const { min, max } = flowPanYRange(bounds, viewHeight, zoom)
  return Math.max(min, Math.min(max, y))
}

function isNoLabel(label: string | undefined): boolean {
  return /いいえ|不要|否|×|偽|no/i.test(label ?? "")
}

function isYesLabel(label: string | undefined): boolean {
  return /はい|可|○|真|yes/i.test(label ?? "")
}

/** 分岐ノードからのエッジに はい/いいえ ラベルを補完 */
export function ensureDecisionEdgeLabel(
  edge: FlowEdge,
  src: FlowNode,
  allEdges: FlowEdge[],
): string | undefined {
  const existing = typeof edge.label === "string" ? edge.label : undefined
  if (existing) return existing
  if (src.data.kind !== "decision") return undefined

  if (edge.sourceHandle === DECISION_HANDLE.no) return "いいえ"
  if (edge.sourceHandle === DECISION_HANDLE.yes) return "はい"

  const siblings = allEdges.filter((e) => e.source === edge.source && e.id !== edge.id)
  const hasYes = siblings.some((e) => isYesLabel(typeof e.label === "string" ? e.label : undefined))
  const hasNo = siblings.some((e) => isNoLabel(typeof e.label === "string" ? e.label : undefined))
  if (!hasYes) return "はい"
  if (!hasNo) return "いいえ"
  return "はい"
}

/** エッジラベルから分岐の出口を判定(はい=右、いいえ=下) */
export function decisionSourceHandle(label: string | undefined, isBack: boolean): "yes" | "no" {
  const text = label ?? ""
  if (/いいえ|不要|否|×|偽|no/i.test(text)) return "no"
  if (/はい|可|○|真|yes/i.test(text)) return "yes"
  return isBack ? "no" : "yes"
}

function isBranchLabel(label: string | undefined): boolean {
  return /はい|いいえ|yes|no/i.test(label ?? "")
}

function branchLabelStyle(label: string | undefined) {
  const isNo = /いいえ|不要|否|×|偽|no/i.test(label ?? "")
  const isYes = /はい|可|○|真|yes/i.test(label ?? "")
  const stroke = isNo ? "#e11d48" : isYes ? "var(--primary)" : "var(--border)"
  const fill = isNo ? "#e11d48" : isYes ? "var(--primary)" : "var(--foreground)"
  return {
    labelStyle: { fontSize: 10, fill, fontWeight: 600 as const },
    labelBgStyle: {
      fill: "var(--background)",
      fillOpacity: 0.96,
      stroke,
      strokeWidth: 1.5,
    },
    labelBgPadding: [5, 8] as [number, number],
    labelBgBorderRadius: 4,
  }
}

/** ノード間の相対位置から接続ハンドルを選ぶ */
function pickEdgeHandles(
  src: FlowNode,
  tgt: FlowNode,
  srcDims: { w: number; h: number },
  tgtDims: { w: number; h: number },
  decisionSource?: string,
) {
  const srcCx = src.position.x + srcDims.w / 2
  const srcCy = src.position.y + srcDims.h / 2
  const tgtCx = tgt.position.x + tgtDims.w / 2
  const tgtCy = tgt.position.y + tgtDims.h / 2
  const dx = tgtCx - srcCx
  const dy = tgtCy - srcCy

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return {
        sourceHandle: decisionSource ?? "right-out",
        targetHandle: "left",
      }
    }
    return { sourceHandle: decisionSource ?? "left-out", targetHandle: "right-in" }
  }
  if (dy >= 0) {
    return { sourceHandle: decisionSource ?? "bottom-out", targetHandle: "top-in" }
  }
  return { sourceHandle: decisionSource ?? "top-out", targetHandle: "bottom-in" }
}

function resolveHandleId(
  raw: string | null | undefined,
  fallback: string,
): string {
  if (!raw || raw === "right") return fallback
  return raw
}

/** エッジを幾何に応じてルーティング(前進/差戻し/跨ぎ行) */
export function enrichEdges(state: FlowState): FlowEdge[] {
  const nodeMap = new Map(state.nodes.map((n) => [n.id, n]))

  return state.edges.map((e) => {
    const src = nodeMap.get(e.source)
    const tgt = nodeMap.get(e.target)
    if (!src || !tgt) return e

    const srcKind = src.data.kind
    const tgtKind = tgt.data.kind
    const label = ensureDecisionEdgeLabel(e, src, state.edges)
    const srcW = dimForKind(srcKind === "start" || srcKind === "end" || srcKind === "decision" ? srcKind : "process").w
    const tgtW = dimForKind(tgtKind === "start" || tgtKind === "end" || tgtKind === "decision" ? tgtKind : "process").w

    const srcCol = colFromX(src.position.x, srcW)
    const tgtCol = colFromX(tgt.position.x, tgtW)
    const sameLane = src.data.lane === tgt.data.lane
    const isBack = tgtCol <= srcCol

    const decisionSrc =
      srcKind === "decision" ? decisionSourceHandle(label, isBack) : undefined
    const autoHandles = pickEdgeHandles(src, tgt, { w: srcW, h: dimForKind(srcKind).h }, { w: tgtW, h: dimForKind(tgtKind).h }, decisionSrc)
    /* 分岐はラベル変更にハンドルを追従させる(手動ラベル編集のため) */
    const handles = {
      sourceHandle:
        srcKind === "decision"
          ? (decisionSrc ?? autoHandles.sourceHandle)
          : resolveHandleId(e.sourceHandle, autoHandles.sourceHandle),
      targetHandle: resolveHandleId(e.targetHandle, autoHandles.targetHandle),
    }

    const branchLabels =
      srcKind === "decision" || isBranchLabel(label) ? branchLabelStyle(label) : null

    const base = { ...e, label, ...handles, ...(branchLabels ?? {}) }

    if (isBack) {
      return {
        ...base,
        type: "flowAdd",
        data: { pathOptions: { offset: 40, borderRadius: 12 }, showAdd: true },
        style: { strokeWidth: 1.5, stroke: "var(--muted-foreground)", strokeDasharray: "6 4", opacity: 0.65 },
        labelStyle: branchLabels?.labelStyle ?? { fontSize: 10, fill: "var(--muted-foreground)" },
      }
    }
    if (!sameLane) {
      return {
        ...base,
        type: "flowAdd",
        data: { pathOptions: { borderRadius: 16 }, showAdd: true },
        style: { strokeWidth: 1.5, stroke: "var(--primary)", opacity: 0.7 },
      }
    }
    return {
      ...base,
      type: "flowAdd",
      data: { showAdd: true },
      style: { strokeWidth: 1.5, stroke: "var(--foreground)", opacity: 0.55 },
    }
  })
}

export function autoLayout(state: FlowState): FlowState {
  const { nodes, edges, lanes } = state
  if (nodes.length === 0) return state

  const laneList =
    lanes.length > 0
      ? lanes
      : [...new Set(nodes.map((n) => n.data.lane).filter(Boolean))]
  if (laneList.length === 0) laneList.push("担当者")

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const laneIdx = (lane: string) => {
    const i = laneList.indexOf(lane)
    return i >= 0 ? i : laneList.length
  }

  const layer = new Map<string, number>()
  const inDeg = new Map<string, number>()
  nodes.forEach((n) => inDeg.set(n.id, 0))
  edges.forEach((e) => inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1))

  const queue = nodes.filter((n) => (inDeg.get(n.id) ?? 0) === 0).map((n) => n.id)
  if (queue.length === 0 && nodes.length > 0) queue.push(nodes[0].id)
  queue.forEach((id) => layer.set(id, 0))

  const outAdj = new Map<string, string[]>()
  edges.forEach((e) => outAdj.set(e.source, [...(outAdj.get(e.source) ?? []), e.target]))

  const visited = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const col = layer.get(id) ?? 0
    for (const next of outAdj.get(id) ?? []) {
      layer.set(next, Math.max(layer.get(next) ?? 0, col + 1))
      queue.push(next)
    }
  }
  nodes.forEach((n) => {
    if (!layer.has(n.id)) layer.set(n.id, 0)
  })

  const maxLayer = Math.max(0, ...Array.from(layer.values()))
  const layerGroups: string[][] = Array.from({ length: maxLayer + 1 }, () => [])
  nodes.forEach((n) => layerGroups[layer.get(n.id)!].push(n.id))

  const orderInLayer = new Map<string, number>()
  layerGroups[0]?.forEach((id, i) => orderInLayer.set(id, i))

  for (let col = 1; col <= maxLayer; col++) {
    const ids = layerGroups[col]
    if (!ids?.length) continue
    const scored = ids.map((id) => {
      const preds = edges.filter((e) => e.target === id).map((e) => e.source)
      const bary =
        preds.length > 0
          ? preds.reduce((s, p) => s + (orderInLayer.get(p) ?? laneIdx(nodeMap.get(p)!.data.lane)), 0) /
            preds.length
          : laneIdx(nodeMap.get(id)!.data.lane)
      return { id, score: bary }
    })
    scored.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
    scored.forEach(({ id }, i) => orderInLayer.set(id, i))
  }

  const positions = new Map<string, { x: number; y: number }>()
  const verticallyStackedIds = new Set<string>()

  for (let col = 0; col <= maxLayer; col++) {
    const ids = [...(layerGroups[col] ?? [])].sort(
      (a, b) => (orderInLayer.get(a) ?? 0) - (orderInLayer.get(b) ?? 0),
    )
    const laneSlots = new Map<number, number>()
    const laneNodes = new Map<number, string[]>()
    const laneCounts = new Map<number, number>()

    for (const id of ids) {
      const li = laneIdx(nodeMap.get(id)!.data.lane)
      laneCounts.set(li, (laneCounts.get(li) ?? 0) + 1)
    }

    for (const id of ids) {
      const node = nodeMap.get(id)!
      const dims = dimForKind(node.data.kind)
      const li = laneIdx(node.data.lane)
      const slot = laneSlots.get(li) ?? 0
      laneSlots.set(li, slot + 1)
      if (!laneNodes.has(li)) laneNodes.set(li, [])
      laneNodes.get(li)!.push(id)

      const stackInLane = (laneCounts.get(li) ?? 0) > 1
      positions.set(id, {
        x: nodeXInCol(col, dims.w),
        y: stackInLane ? stackedYInLane(li, slot, dims.h) : nodeYInLane(li, dims.h),
      })
    }

    for (const nodeIds of laneNodes.values()) {
      if (nodeIds.length > 1) nodeIds.forEach((nid) => verticallyStackedIds.add(nid))
    }
  }

  const columnSystems: ColumnSystemEntry[] = Array.from({ length: maxLayer + 1 }, (_, col) => {
    const systemsInCol = new Set<string>()
    for (const n of nodes) {
      const dims = dimForKind(n.data.kind)
      const nodeCol = colFromX(positions.get(n.id)?.x ?? n.position.x, dims.w)
      if (nodeCol !== col) continue
      const sys = n.data.system?.trim()
      if (sys && sys !== "—") systemsInCol.add(sys)
    }
    return {
      label: [...systemsInCol].join(" / ") || "—",
      url: state.layoutMeta?.columnSystems?.[col]
        ? normalizeColumnSystems(state.layoutMeta.columnSystems, maxLayer + 1)[col]?.url
        : undefined,
    }
  })

  for (const e of edges) {
    const src = nodeMap.get(e.source)
    const tgt = nodeMap.get(e.target)
    if (!src || !tgt || src.data.lane !== tgt.data.lane) continue
    if (layer.get(e.target)! !== layer.get(e.source)! + 1) continue
    if (tgt.data.kind === "decision") continue
    if (verticallyStackedIds.has(tgt.id)) continue

    const sp = positions.get(e.source)!
    const tp = positions.get(e.target)!
    const srcDims = dimForKind(src.data.kind)
    const tgtDims = dimForKind(tgt.data.kind)
    positions.set(e.target, {
      x: tp.x,
      y: sp.y + (srcDims.h - tgtDims.h) / 2,
    })
  }

  const laid: FlowState = {
    ...state,
    lanes: laneList,
    layoutMeta: { columnCount: maxLayer + 1, columnSystems },
    nodes: layoutAllLaneNodes(
      nodes.map((n) => ({
        ...n,
        position: positions.get(n.id) ?? n.position,
      })),
      laneList,
    ),
  }
  return assignSectionNumbers({ ...laid, edges: enrichEdges(laid) })
}

export function gridDimensions(laneCount: number, columnCount: number) {
  return {
    width: FLOW_ORIGIN_X + columnCount * COL_WIDTH + 32,
    height: FLOW_ORIGIN_Y + laneCount * LANE_ROW_HEIGHT + 16,
  }
}

export interface LaneRowMetric {
  top: number
  height: number
}

/**
 * 担当チーム行の累積レイアウトを算出。
 * 縦並びコネクタがある行は高さを拡張し、下の行を押し下げて潰れを防ぐ。
 */
export function computeLaneRowMetrics(nodes: FlowNode[], lanes: string[]): LaneRowMetric[] {
  const heights = lanes.map((lane) => {
    const laneNodes = nodes.filter((n) => n.data.lane === lane)
    if (laneNodes.length === 0) return LANE_ROW_HEIGHT

    const byCol = new Map<number, FlowNode[]>()
    for (const n of laneNodes) {
      const col = colFromX(n.position.x, nodeDims(n).w)
      if (!byCol.has(col)) byCol.set(col, [])
      byCol.get(col)!.push(n)
    }

    let maxH = LANE_ROW_HEIGHT
    for (const group of byCol.values()) {
      if (group.length <= 1) continue
      const stackH =
        LANE_PADDING * 2 +
        group.reduce((sum, n, i) => sum + nodeDims(n).h + (i > 0 ? LANE_STACK_GAP : 0), 0)
      maxH = Math.max(maxH, stackH)
    }
    return maxH
  })

  let top = FLOW_ORIGIN_Y
  return heights.map((height) => {
    const metric = { top, height }
    top += height
    return metric
  })
}

export function flowToScreen(
  flowX: number,
  flowY: number,
  viewport: { x: number; y: number; zoom: number },
) {
  return {
    x: viewport.x + flowX * viewport.zoom,
    y: viewport.y + flowY * viewport.zoom,
  }
}

/** 初回のみ整列が必要か(layoutMeta 欠落 or 全ノードが原点付近) */
export function needsInitialLayout(flow: FlowState): boolean {
  if (flow.nodes.length === 0) return false
  if (!flow.layoutMeta?.columnCount) return true
  return flow.nodes.every((n) => n.position.x < 8 && n.position.y < 8)
}
