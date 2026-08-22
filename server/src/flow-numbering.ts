import type { FlowNode, FlowState, StepKind } from "./flow-types.js"

function isDocumentable(kind: StepKind): boolean {
  return kind === "process" || kind === "decision"
}

/** 旧実装が付けた 1.1.1〜1.1.n（または同様の3段一括）を検出する */
export function isLegacyCollapsedNumbering(nodes: FlowNode[]): boolean {
  const nums = nodes
    .filter((n) => isDocumentable(n.data.kind))
    .map((n) => n.data.sectionNumber?.trim())
    .filter((n): n is string => Boolean(n))
  if (nums.length < 2) return false
  return nums.every((n) => /^\d+\.\d+\.\d+$/.test(n))
}

function parseMajorMedium(num: string): { major: number; medium: number } | null {
  const parts = num.split(".").map(Number)
  if (parts.length < 2 || parts.some((p) => Number.isNaN(p))) return null
  return { major: parts[0]!, medium: parts[1]! }
}

function topologicalOrder(nodes: FlowNode[], edges: FlowState["edges"]): string[] {
  const inDeg = new Map<string, number>()
  nodes.forEach((n) => inDeg.set(n.id, 0))
  edges.forEach((e) => inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1))

  const outAdj = new Map<string, string[]>()
  edges.forEach((e) => outAdj.set(e.source, [...(outAdj.get(e.source) ?? []), e.target]))

  const starts = nodes.filter((n) => (inDeg.get(n.id) ?? 0) === 0)
  const queue = starts.length > 0 ? [...starts.map((n) => n.id)] : nodes[0] ? [nodes[0].id] : []
  const order: string[] = []
  const seen = new Set<string>()

  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    order.push(id)
    for (const next of outAdj.get(id) ?? []) {
      if (!seen.has(next)) queue.push(next)
    }
  }
  nodes.forEach((n) => {
    if (!seen.has(n.id)) order.push(n.id)
  })
  return order
}

/**
 * 文書化対象ステップ(process / decision)に 1.1, 1.2, 2.1 … を付与。
 * - 担当レーンが変わると大項目を繰り上げる（例: 1.2 → 2.1）
 * - 分岐(decision)の直後の代替 process は同一項番（グループ）
 * - 既存の 1.1 / 2.1 形式は保持。旧 1.1.n 一括採番は付け直す
 */
export function assignSectionNumbers(state: FlowState): FlowState {
  const { nodes, edges } = state
  if (nodes.length === 0) return state

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const order = topologicalOrder(nodes, edges)
  const legacy = isLegacyCollapsedNumbering(nodes)

  const keep = new Map<string, string>()
  if (!legacy) {
    for (const n of nodes) {
      const num = n.data.sectionNumber?.trim()
      if (!num || !isDocumentable(n.data.kind)) continue
      // 3段はフロー項番として使わない（マニュアル分冊用）。未採番扱いにする
      if (/^\d+\.\d+\.\d+$/.test(num)) continue
      keep.set(n.id, num)
    }
  }

  const outAdj = new Map<string, string[]>()
  edges.forEach((e) => outAdj.set(e.source, [...(outAdj.get(e.source) ?? []), e.target]))

  let major = 1
  let medium = 0
  let prevLane: string | null = null
  const numberMap = new Map<string, string>()

  const syncCursor = (num: string) => {
    const parsed = parseMajorMedium(num)
    if (!parsed) return
    major = parsed.major
    medium = parsed.medium
  }

  const assignDecisionChildren = (decisionId: string, num: string) => {
    for (const childId of outAdj.get(decisionId) ?? []) {
      const child = byId.get(childId)
      if (!child || child.data.kind !== "process") continue
      if (keep.has(childId) || numberMap.has(childId)) continue
      numberMap.set(childId, num)
    }
  }

  for (const id of order) {
    const n = byId.get(id)
    if (!n || n.data.kind === "start" || n.data.kind === "end") continue
    if (!isDocumentable(n.data.kind)) continue

    const existing = numberMap.get(id) ?? keep.get(id)
    if (existing) {
      if (!numberMap.has(id)) numberMap.set(id, existing)
      syncCursor(existing)
      prevLane = n.data.lane
      if (n.data.kind === "decision") assignDecisionChildren(id, existing)
      continue
    }

    const lane = n.data.lane ?? ""
    if (prevLane !== null && lane !== prevLane) {
      major += 1
      medium = 1
    } else {
      medium += 1
    }

    const num = `${major}.${medium}`
    numberMap.set(id, num)
    prevLane = lane
    if (n.data.kind === "decision") assignDecisionChildren(id, num)
  }

  let changed = false
  const nextNodes = nodes.map((n) => {
    const num = numberMap.get(n.id)
    if (!num) return n
    if (n.data.sectionNumber === num) return n
    changed = true
    return { ...n, data: { ...n.data, sectionNumber: num } }
  })

  if (!changed) return state
  return { ...state, nodes: nextNodes }
}

/** 項番付きでソートしたノード一覧(マニュアル生成用) */
export function numberedSteps(state: FlowState): FlowNode[] {
  return [...state.nodes]
    .filter((n) => n.data.sectionNumber)
    .sort((a, b) => {
      const pa = a.data.sectionNumber!.split(".").map(Number)
      const pb = b.data.sectionNumber!.split(".").map(Number)
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0)
        if (d !== 0) return d
      }
      return 0
    })
}
