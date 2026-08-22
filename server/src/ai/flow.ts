import {
  mergePreservingManual,
  regeneratePreservingManual,
} from "../flow-logic.js"
import type { FlowState } from "../flow-types.js"
import { enrichEdges } from "../flow-layout.js"
import {
  applyFlowNlOps,
  FlowNlEditError,
  opsPlausibleForInstruction,
  parseFlowNlEditResponse,
} from "../flow-nl-ops.js"
import { matchInstructionToOps } from "../flow-nl-rules.js"
import { buildFlowNlEditMessages } from "./prompts/flow-nl-edit.js"

export { buildFlowNlEditMessages }
export { FlowNlEditError } from "../flow-nl-ops.js"

const NL_EDIT_UNSUPPORTED =
  "指示を理解できませんでした。ステップ名を「」で囲むか、追加・削除・変更・入れ替え・リンク設定など具体的に書いてください。"

function polishFlow(state: FlowState): FlowState {
  return { ...state, edges: enrichEdges(state) }
}

function toProposal(description: string, flow: FlowState, previewFlow: FlowState) {
  return {
    description,
    previewFlow: polishFlow(previewFlow),
    appliedFlow: polishFlow(flow),
  }
}

function markPreviewDiff(base: FlowState, next: FlowState): FlowState {
  const baseIds = new Set(base.nodes.map((n) => n.id))
  const baseLabels = new Map(base.nodes.map((n) => [n.id, n.data.label]))
  return {
    ...next,
    nodes: next.nodes.map((n) => {
      if (!baseIds.has(n.id)) return { ...n, data: { ...n.data, diff: "add" as const } }
      if (baseLabels.get(n.id) !== n.data.label) {
        return { ...n, data: { ...n.data, diff: "change" as const } }
      }
      return n
    }),
  }
}

/** LLM 応答 + ルールベースのフォールバックで NL 修正提案を生成 */
export function proposeFlowNlEdit(
  instruction: string,
  flow: FlowState,
  llmText?: string,
) {
  const trimmed = instruction.trim()
  if (!trimmed) throw new FlowNlEditError("指示が空です")

  if (llmText) {
    const parsed = parseFlowNlEditResponse(llmText)
    if (parsed && opsPlausibleForInstruction(trimmed, parsed.ops)) {
      try {
        const { flow: applied, description } = applyFlowNlOps(flow, parsed.ops, parsed.description)
        return toProposal(description, applied, markPreviewDiff(flow, applied))
      } catch (e) {
        if (!(e instanceof FlowNlEditError)) throw e
        /* LLM ops 失敗時はルールベースへ */
      }
    }
  }

  const rules = matchInstructionToOps(trimmed, flow)
  if (rules) {
    try {
      const { flow: applied, description } = applyFlowNlOps(flow, rules.ops, rules.description)
      return toProposal(description, applied, markPreviewDiff(flow, applied))
    } catch (e) {
      if (!(e instanceof FlowNlEditError)) throw e
    }
  }

  throw new FlowNlEditError(NL_EDIT_UNSUPPORTED)
}

/** @deprecated use proposeFlowNlEdit */
export function proposeNlEdit(instruction: string, flow: FlowState) {
  return proposeFlowNlEdit(instruction, flow)
}

export function regenerateFlowPreservingManual(flow: FlowState, projectName: string): FlowState {
  return regeneratePreservingManual(flow, projectName)
}

export function mergeFlowPreservingManual(current: FlowState, generated: FlowState): FlowState {
  return mergePreservingManual(current, generated)
}
