import type { FlowNode, FlowState, StepKind } from "./flow-types.js"

/**
 * 参考資料（営業用業務マニュアル PPTX）に準拠した項番階層:
 *
 *   大項目  N       … 業務フェーズ（例: １．依頼者情報 / ２．契約商品・承認ルート）
 *   中項目  N.M     … 1操作単位＝原則1スライド（例: 1.1 商品タイプを選択、2.1、2.3）
 *   小項目  N.M.K   … 同一操作の分冊・分岐枝のみ（例: 2.2.1〜2.2.4 商品リスト、分岐の代替）
 *
 * 目次は大／中まで。小項目は「同じ中項目の続き」のときだけ付ける。
 * 無関係なステップを全部 1.1.1〜1.1.n に潰さない。
 */

function isDocumentable(kind: StepKind): boolean {
  return kind === "process" || kind === "decision"
}

/** 旧バグ: すべてが 1.1.n に潰れている採番だけ付け直す対象 */
export function isLegacyCollapsedNumbering(nodes: FlowNode[]): boolean {
  const nums = nodes
    .filter((n) => isDocumentable(n.data.kind))
    .map((n) => n.data.sectionNumber?.trim())
    .filter((n): n is string => Boolean(n))
  if (nums.length < 2) return false
  return nums.every((n) => /^1\.1\.\d+$/.test(n))
}

function parseParts(num: string): number[] {
  return num.split(".").map(Number).filter((p) => !Number.isNaN(p))
}

function formatParts(parts: number[]): string {
  return parts.join(".")
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
 * 文書化対象ステップに参考資料粒度の項番を付与。
 * - レーン変更 → 大項目繰り上げ（1.x → 2.1）
 * - 通常ステップ → 新しい中項目（1.1, 1.2, 2.1 …）
 * - 分岐の代替 process → 親の下層（2.1.1, 2.1.2）＝同一セクションの深掘り
 * - 既存の正当な 1.1 / 2.2.1 等は保持。全部 1.1.n の旧バグのみ付け直す
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
      keep.set(n.id, num)
    }
  }

  const outAdj = new Map<string, string[]>()
  edges.forEach((e) => outAdj.set(e.source, [...(outAdj.get(e.source) ?? []), e.target]))

  /** カーソルは常に中項目単位（大.中）。小項目は同一中項目の下でのみ増やす */
  let major = 1
  let medium = 0
  let prevLane: string | null = null
  const numberMap = new Map<string, string>()

  const syncCursorFromMedium = (num: string) => {
    const parts = parseParts(num)
    if (parts.length < 2) return
    major = parts[0]!
    medium = parts[1]!
  }

  const nextMediumNumber = (lane: string): string => {
    if (prevLane !== null && lane !== prevLane) {
      major += 1
      medium = 1
    } else {
      medium += 1
    }
    prevLane = lane
    return formatParts([major, medium])
  }

  const assignDecisionChildren = (decisionId: string, parentNum: string) => {
    const children: FlowNode[] = []
    for (const childId of outAdj.get(decisionId) ?? []) {
      const child = byId.get(childId)
      if (child && child.data.kind === "process") children.push(child)
    }
    let leaf = 0
    for (const child of children) {
      if (keep.has(child.id) || numberMap.has(child.id)) continue
      leaf += 1
      // 同一中項目（分岐）の下層へ。参考資料の 2.2.1 分冊と同じ「同じ内容の深掘り」
      numberMap.set(child.id, formatParts([...parseParts(parentNum).slice(0, 2), leaf]))
    }
  }

  for (const id of order) {
    const n = byId.get(id)
    if (!n || n.data.kind === "start" || n.data.kind === "end") continue
    if (!isDocumentable(n.data.kind)) continue

    const existing = numberMap.get(id) ?? keep.get(id)
    if (existing) {
      if (!numberMap.has(id)) numberMap.set(id, existing)
      syncCursorFromMedium(existing)
      prevLane = n.data.lane
      if (n.data.kind === "decision") assignDecisionChildren(id, existing)
      continue
    }

    const lane = n.data.lane ?? ""
    const num = nextMediumNumber(lane)
    numberMap.set(id, num)
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

/** フロー項番を深掘りアイテムへ同期（回答は維持） */
export function syncDeepdiveSectionNumbers<T extends { stepId: string; sectionNumber?: string }>(
  deepdive: T[],
  flow: FlowState,
): T[] {
  const byId = new Map(flow.nodes.map((n) => [n.id, n.data.sectionNumber]))
  let changed = false
  const next = deepdive.map((d) => {
    const sn = byId.get(d.stepId)
    if (!sn || sn === d.sectionNumber) return d
    changed = true
    return { ...d, sectionNumber: sn }
  })
  return changed ? next : deepdive
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
