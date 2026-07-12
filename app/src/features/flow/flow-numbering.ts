import type { FlowNode, FlowState } from "@/lib/types"

/** フロー上の文書化対象ステップ(process / decision)に 1.1, 1.2 … の項番を付与。
 * 既存の sectionNumber は保持し、未設定ノードにのみ採番する(大項目跨ぎ・グルーピングを壊さない)。 */
export function assignSectionNumbers(state: FlowState): FlowState {
  const { nodes, edges } = state
  if (nodes.length === 0) return state

  const inDeg = new Map<string, number>()
  nodes.forEach((n) => inDeg.set(n.id, 0))
  edges.forEach((e) => inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1))

  const outAdj = new Map<string, string[]>()
  edges.forEach((e) => outAdj.set(e.source, [...(outAdj.get(e.source) ?? []), e.target]))

  const starts = nodes.filter((n) => (inDeg.get(n.id) ?? 0) === 0)
  const queue = starts.length > 0 ? [...starts.map((n) => n.id)] : [nodes[0].id]
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

  let maxSub = 0
  for (const n of nodes) {
    const num = n.data.sectionNumber?.trim()
    if (!num) continue
    const parts = num.split(".").map(Number)
    if (parts[0] === 1 && parts.length >= 2 && !Number.isNaN(parts[1])) {
      maxSub = Math.max(maxSub, parts[1])
    }
  }

  let sub = maxSub + 1
  const numberMap = new Map<string, string>()
  for (const id of order) {
    const n = nodes.find((node) => node.id === id)!
    if (n.data.kind === "start" || n.data.kind === "end") continue
    if (n.data.sectionNumber?.trim()) continue
    numberMap.set(id, `1.${sub}`)
    sub++
  }

  if (numberMap.size === 0) return state

  return {
    ...state,
    nodes: nodes.map((n) => {
      const num = numberMap.get(n.id)
      if (!num) return n
      return { ...n, data: { ...n.data, sectionNumber: num } }
    }),
  }
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
