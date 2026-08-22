/**
 * ルールベース NL 修正: よくある指示パターンを ops に変換（LLM 未使用・オフライン）。
 */

import type { FlowNode, FlowState } from "./flow-types.js"
import type { FlowNlOp } from "./flow-nl-ops.js"

export interface RuleMatch {
  description: string
  ops: FlowNlOp[]
}

export function matchInstructionToOps(instruction: string, state: FlowState): RuleMatch | null {
  const link = matchSystemLink(instruction, state)
  if (link) return link

  const swap = matchSwap(instruction, state)
  if (swap) return swap

  const remove = matchRemove(instruction, state)
  if (remove) return remove

  const rename = matchRename(instruction, state)
  if (rename) return rename

  const between = matchInsertBetween(instruction, state)
  if (between) return between

  const add = matchInsertAfter(instruction, state)
  if (add) return add

  const move = matchMove(instruction, state)
  if (move) return move

  const nodeSystem = matchSetNodeSystem(instruction, state)
  if (nodeSystem) return nodeSystem

  const nodeLane = matchSetNodeLane(instruction, state)
  if (nodeLane) return nodeLane

  return null
}

function mentionedNodes(instruction: string, state: FlowState): FlowNode[] {
  return state.nodes
    .filter((n) => instruction.includes(n.data.label) || includesLoose(instruction, n.data.label))
    .sort((a, b) => b.data.label.length - a.data.label.length)
}

function includesLoose(text: string, label: string): boolean {
  const head = label.slice(0, Math.min(6, label.length))
  return head.length >= 4 && text.includes(head)
}

function quotedParts(instruction: string): string[] {
  return [...instruction.matchAll(/「([^」]+)」/g)].map((m) => m[1])
}

function extractUrl(text: string): string | null {
  const absolute = text.match(/https?:\/\/[^\s、。,「」]+/i)
  if (absolute) return absolute[0]
  const domain = text.match(
    /(?:リンク(?:は|を|:)?\s*)?([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\/[^\s、。,「」]*)?)/i,
  )
  if (!domain) return null
  const host = domain[1]
  return host.startsWith("http") ? host : `https://${host}`
}

function matchSystemLink(instruction: string, _state: FlowState): RuleMatch | null {
  const url = extractUrl(instruction)
  if (!url || !/リンク|URL|url|利用システム/.test(instruction)) return null
  const named = instruction.match(/([^\s、。,「」]+)のリンク/)
  const system = named?.[1]
  return {
    description: system
      ? `「${system}」の利用システムリンクを ${url} に設定します`
      : `利用システムのリンクを ${url} に設定します`,
    ops: [{ op: "setColumnSystemUrl", system, url }],
  }
}

function matchSwap(instruction: string, state: FlowState): RuleMatch | null {
  if (!/入れ替|入替|順序を|順番を|交換/.test(instruction)) return null
  const quoted = quotedParts(instruction)
  if (quoted.length >= 2) {
    return {
      description: `「${quoted[0]}」と「${quoted[1]}」の順序を入れ替えます`,
      ops: [{ op: "swapNodes", aLabel: quoted[0], bLabel: quoted[1] }],
    }
  }
  const mentioned = mentionedNodes(instruction, state)
  if (mentioned.length >= 2) {
    return {
      description: `「${mentioned[0].data.label}」と「${mentioned[1].data.label}」の順序を入れ替えます`,
      ops: [
        { op: "swapNodes", aLabel: mentioned[0].data.label, bLabel: mentioned[1].data.label },
      ],
    }
  }
  return null
}

function matchRemove(instruction: string, state: FlowState): RuleMatch | null {
  if (!/削除|消して|取り除|なくして/.test(instruction)) return null
  if (/リンク|利用システム/.test(instruction)) return null
  const mentioned = mentionedNodes(instruction, state)
  const quoted = quotedParts(instruction)
  const label = quoted[0] ?? mentioned[0]?.data.label
  if (!label) return null
  return {
    description: `ステップ「${label}」を削除します`,
    ops: [{ op: "removeNode", label }],
  }
}

function matchRename(instruction: string, state: FlowState): RuleMatch | null {
  const changeMatch = /(?:を|は)「?(.+?)」?(?:に変更|に変えて|に修正|という名前に|へ改名)/.exec(instruction)
  if (!changeMatch) return null
  const mentioned = mentionedNodes(instruction, state)
  const quoted = quotedParts(instruction)
  const target = mentioned[0]
  if (!target) return null
  const newLabel = quoted.length >= 2 ? quoted[1] : cleanLabel(changeMatch[1])
  return {
    description: `「${target.data.label}」を「${newLabel}」に変更します`,
    ops: [{ op: "renameNode", label: target.data.label, newLabel }],
  }
}

function matchInsertBetween(instruction: string, state: FlowState): RuleMatch | null {
  const betweenMatch = /(?:の)?間に(.+?)(?:を|が)?(?:追加|入る|入れて|挟)/.exec(instruction)
  if (!betweenMatch) return null
  const mentioned = mentionedNodes(instruction, state)
  if (mentioned.length < 2) return null
  const quoted = quotedParts(instruction)
  const newLabel = quoted[quoted.length - 1] ?? cleanLabel(betweenMatch[1])
  const [a, b] = orderBySequence(mentioned[0], mentioned[1], state)
  return {
    description: `「${a.data.label}」と「${b.data.label}」の間に「${newLabel}」を追加します`,
    ops: [{ op: "addNode", label: newLabel, between: [a.data.label, b.data.label] }],
  }
}

function matchInsertAfter(instruction: string, state: FlowState): RuleMatch | null {
  if (!/追加|足して|新しく/.test(instruction) || /リンク|URL|利用システム/.test(instruction)) return null
  const quoted = quotedParts(instruction)
  const mentioned = mentionedNodes(instruction, state)
  const addMatch = /(?:の)?(?:後|後ろ|直後)に(.+?)(?:を|が)?(?:追加|入れ|足)/.exec(instruction)
  if (addMatch && mentioned[0]) {
    const newLabel = quoted[0] ?? cleanLabel(addMatch[1])
    return {
      description: `「${mentioned[0].data.label}」の直後に「${newLabel}」を追加します`,
      ops: [{ op: "addNode", label: newLabel, afterLabel: mentioned[0].data.label }],
    }
  }
  if (/追加|足して/.test(instruction) && mentioned[0]) {
    const newLabel = quoted[0] ?? extractAddLabel(instruction)
    if (newLabel && newLabel !== "新しいステップ") {
      return {
        description: `「${mentioned[0].data.label}」の直後に「${newLabel}」を追加します`,
        ops: [{ op: "addNode", label: newLabel, afterLabel: mentioned[0].data.label }],
      }
    }
  }
  return null
}

function matchMove(instruction: string, state: FlowState): RuleMatch | null {
  if (!/移動|移して|前に|後ろに|上に|下に/.test(instruction)) return null
  const mentioned = mentionedNodes(instruction, state)
  if (mentioned.length < 2) return null
  const moving = mentioned[0]
  const afterMatch = /(.+?)(?:の|を)?(?:後|後ろ|直後)に移/.exec(instruction)
  if (afterMatch) {
    const anchor = mentioned.find((n) => n.id !== moving.id) ?? mentioned[1]
    return {
      description: `「${moving.data.label}」を「${anchor.data.label}」の直後へ移動します`,
      ops: [{ op: "moveNode", label: moving.data.label, afterLabel: anchor.data.label }],
    }
  }
  const beforeMatch = /(.+?)(?:の|を)?(?:前|直前)に移/.exec(instruction)
  if (beforeMatch && mentioned[1]) {
    return {
      description: `「${moving.data.label}」を「${mentioned[1].data.label}」の直前へ移動します`,
      ops: [{ op: "moveNode", label: moving.data.label, beforeLabel: mentioned[1].data.label }],
    }
  }
  return null
}

function matchSetNodeSystem(instruction: string, state: FlowState): RuleMatch | null {
  const m = /(.+?)の利用システム(?:を|は)(.+?)(?:に変更|に変え|に設定|にして)/.exec(instruction)
  if (!m) return null
  const mentioned = mentionedNodes(instruction, state)
  const target = mentioned[0]
  if (!target) return null
  const system = m[2].replace(/[「」]/g, "").trim()
  return {
    description: `「${target.data.label}」の利用システムを「${system}」に変更します`,
    ops: [{ op: "setNodeSystem", label: target.data.label, system }],
  }
}

function matchSetNodeLane(instruction: string, state: FlowState): RuleMatch | null {
  const m = /(.+?)の担当(?:チーム|者|レーン)?(?:を|は)(.+?)(?:に変更|に変え|に移|にして)/.exec(instruction)
  if (!m) return null
  const mentioned = mentionedNodes(instruction, state)
  const target = mentioned[0]
  if (!target) return null
  const lane = m[2].replace(/[「」]/g, "").trim()
  return {
    description: `「${target.data.label}」の担当を「${lane}」に変更します`,
    ops: [{ op: "setNodeLane", label: target.data.label, lane }],
  }
}

function cleanLabel(raw: string): string {
  return raw.replace(/[「」]/g, "").replace(/(する作業|の作業|作業)$/, "").trim() || "新しいステップ"
}

function extractAddLabel(instruction: string): string {
  const m = /(.+?)(?:を|の)?(?:ステップ)?(?:を)?(?:追加|足して|入れて)/.exec(instruction)
  return m ? cleanLabel(m[1].split(/[、。]/).pop() ?? m[1]) : "新しいステップ"
}

function orderBySequence(a: FlowNode, b: FlowNode, state: FlowState): [FlowNode, FlowNode] {
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
