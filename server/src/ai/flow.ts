import {
  interpretInstruction,
  regeneratePreservingManual,
} from "../flow-logic.js"
import type { FlowState } from "../flow-types.js"

export function proposeNlEdit(instruction: string, flow: FlowState) {
  const proposal = interpretInstruction(instruction, flow)
  return {
    description: proposal.description,
    previewFlow: proposal.preview(flow),
    appliedFlow: proposal.apply(flow),
  }
}

export function regenerateFlowPreservingManual(flow: FlowState, projectName: string): FlowState {
  return regeneratePreservingManual(flow, projectName)
}
