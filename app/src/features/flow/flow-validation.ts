import type { FlowEdge, FlowNode, FlowState } from "@/lib/types"

export type FlowIssueSeverity = "error" | "warning"

export interface FlowIssue {
  id: string
  severity: FlowIssueSeverity
  message: string
  nodeId?: string
  edgeId?: string
}

export interface FlowValidationResult {
  issues: FlowIssue[]
  errorCount: number
  warningCount: number
  invalidNodeIds: Set<string>
  invalidEdgeIds: Set<string>
}

/** フロー図の構造的な問題を検出する(確定前チェック用) */
export function validateFlow(state: FlowState): FlowValidationResult {
  const issues: FlowIssue[] = []
  const { nodes, edges } = state

  if (nodes.length === 0) {
    return {
      issues: [],
      errorCount: 0,
      warningCount: 0,
      invalidNodeIds: new Set(),
      invalidEdgeIds: new Set(),
    }
  }

  const starts = nodes.filter((n) => n.data.kind === "start")
  const ends = nodes.filter((n) => n.data.kind === "end")

  if (starts.length === 0) {
    issues.push({
      id: "no-start",
      severity: "error",
      message: "開始ステップがありません",
    })
  } else if (starts.length > 1) {
    for (const n of starts) {
      issues.push({
        id: `multi-start-${n.id}`,
        severity: "error",
        message: `開始ステップが複数あります: 「${n.data.label || n.id}」`,
        nodeId: n.id,
      })
    }
  }

  if (ends.length === 0) {
    issues.push({
      id: "no-end",
      severity: "error",
      message: "終了ステップがありません",
    })
  }

  const outAdj = new Map<string, string[]>()
  const inDeg = new Map<string, number>()
  nodes.forEach((n) => {
    outAdj.set(n.id, [])
    inDeg.set(n.id, 0)
  })
  edges.forEach((e) => {
    outAdj.get(e.source)?.push(e.target)
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1)
  })

  for (const n of nodes) {
    const outs = outAdj.get(n.id) ?? []
    const ins = inDeg.get(n.id) ?? 0

    if (!n.data.label?.trim()) {
      issues.push({
        id: `empty-label-${n.id}`,
        severity: "warning",
        message: "ラベルが空のステップがあります",
        nodeId: n.id,
      })
    }

    if (n.data.kind !== "start" && n.data.kind !== "end" && outs.length === 0 && ins === 0) {
      issues.push({
        id: `orphan-${n.id}`,
        severity: "error",
        message: `孤立したステップです: 「${n.data.label || n.id}」`,
        nodeId: n.id,
      })
    }

    if (n.data.kind === "decision") {
      const yes = edges.filter(
        (e) =>
          e.source === n.id &&
          (e.sourceHandle === "yes" || /はい|可|○|真|yes/i.test(String(e.label ?? ""))),
      )
      const no = edges.filter(
        (e) =>
          e.source === n.id &&
          (e.sourceHandle === "no" || /いいえ|不要|否|×|偽|no/i.test(String(e.label ?? ""))),
      )
      if (outs.length < 2) {
        issues.push({
          id: `decision-outs-${n.id}`,
          severity: "error",
          message: `分岐「${n.data.label || n.id}」の出口が不足しています（2本必要）`,
          nodeId: n.id,
        })
      } else if (yes.length === 0 || no.length === 0) {
        issues.push({
          id: `decision-labels-${n.id}`,
          severity: "warning",
          message: `分岐「${n.data.label || n.id}」のはい／いいえが揃っていません`,
          nodeId: n.id,
        })
      }
    }

    if (n.data.kind === "start" && outs.length === 0) {
      issues.push({
        id: `start-out-${n.id}`,
        severity: "error",
        message: "開始ステップから先へ結線がありません",
        nodeId: n.id,
      })
    }

    if (n.data.kind === "end" && ins === 0) {
      issues.push({
        id: `end-in-${n.id}`,
        severity: "error",
        message: "終了ステップへの結線がありません",
        nodeId: n.id,
      })
    }
  }

  /* 開始から到達できないノード */
  if (starts.length === 1) {
    const reachable = new Set<string>()
    const queue = [starts[0].id]
    while (queue.length) {
      const id = queue.shift()!
      if (reachable.has(id)) continue
      reachable.add(id)
      for (const next of outAdj.get(id) ?? []) {
        if (!reachable.has(next)) queue.push(next)
      }
    }
    for (const n of nodes) {
      if (!reachable.has(n.id) && n.data.kind !== "start") {
        issues.push({
          id: `unreachable-${n.id}`,
          severity: "error",
          message: `開始から到達できません: 「${n.data.label || n.id}」`,
          nodeId: n.id,
        })
      }
    }
  }

  /* 終了へ到達できないノード（終端でないもの） */
  if (ends.length > 0) {
    const revAdj = new Map<string, string[]>()
    nodes.forEach((n) => revAdj.set(n.id, []))
    edges.forEach((e) => revAdj.get(e.target)?.push(e.source))
    const canReachEnd = new Set<string>()
    const queue = ends.map((e) => e.id)
    while (queue.length) {
      const id = queue.shift()!
      if (canReachEnd.has(id)) continue
      canReachEnd.add(id)
      for (const prev of revAdj.get(id) ?? []) {
        if (!canReachEnd.has(prev)) queue.push(prev)
      }
    }
    for (const n of nodes) {
      if (n.data.kind === "end") continue
      if (!canReachEnd.has(n.id) && (outAdj.get(n.id)?.length ?? 0) > 0) {
        issues.push({
          id: `no-path-to-end-${n.id}`,
          severity: "warning",
          message: `終了へ辿り着けません: 「${n.data.label || n.id}」`,
          nodeId: n.id,
        })
      }
    }
  }

  const invalidNodeIds = new Set(issues.filter((i) => i.nodeId).map((i) => i.nodeId!))
  const invalidEdgeIds = new Set<string>()

  /* 接続先が無い・不正なエッジ */
  for (const e of edges) {
    const src = nodes.find((n) => n.id === e.source)
    const tgt = nodes.find((n) => n.id === e.target)
    if (!src || !tgt) {
      issues.push({
        id: `bad-edge-${e.id}`,
        severity: "error",
        message: "不正な結線があります",
        edgeId: e.id,
      })
      invalidEdgeIds.add(e.id)
    }
  }

  const errorCount = issues.filter((i) => i.severity === "error").length
  const warningCount = issues.filter((i) => i.severity === "warning").length

  return { issues, errorCount, warningCount, invalidNodeIds, invalidEdgeIds }
}

/** 検証結果をノード／エッジの見た目に反映 */
export function applyValidationMarks(
  state: FlowState,
  result: FlowValidationResult,
): FlowState {
  const nodes: FlowNode[] = state.nodes.map((n) => {
    const hasIssue = result.invalidNodeIds.has(n.id)
    const severity = result.issues.find((i) => i.nodeId === n.id)?.severity
    return {
      ...n,
      data: {
        ...n.data,
        validationError: hasIssue && severity === "error" ? true : undefined,
        validationWarning: hasIssue && severity === "warning" ? true : undefined,
      },
    }
  })

  const edges: FlowEdge[] = state.edges.map((e) => {
    if (!result.invalidEdgeIds.has(e.id)) {
      const srcIssue = result.invalidNodeIds.has(e.source) || result.invalidNodeIds.has(e.target)
      if (!srcIssue) return e
      /* 問題ノードに接続するエッジは破線で注意喚起 */
      return {
        ...e,
        style: {
          ...(typeof e.style === "object" && e.style ? e.style : {}),
          strokeDasharray: "4 4",
          stroke: "var(--destructive)",
          opacity: 0.75,
        },
        data: { ...(e.data as object), validationMark: true, showAdd: (e.data as { showAdd?: boolean })?.showAdd },
      }
    }
    return {
      ...e,
      style: {
        ...(typeof e.style === "object" && e.style ? e.style : {}),
        strokeDasharray: "4 4",
        stroke: "var(--destructive)",
        opacity: 0.8,
      },
      data: { ...(e.data as object), validationMark: true, showAdd: (e.data as { showAdd?: boolean })?.showAdd },
    }
  })

  return { ...state, nodes, edges }
}
