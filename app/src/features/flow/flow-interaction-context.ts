import type { FlowConnector } from "./flow-connectors"

export type ConnectorInsertMode = "between" | "after" | "append" | "canvas"

export interface ConnectorInsertTarget {
  mode: ConnectorInsertMode
  sourceId?: string
  targetId?: string
  nodeId?: string
  targetKind?: "start" | "end" | "process" | "decision"
}

export interface FlowInteractionContext {
  locked: boolean
  onRequestInsert: (target: ConnectorInsertTarget, anchor?: { x: number; y: number }) => void
  onInsertConnector: (connector: FlowConnector, target: ConnectorInsertTarget) => void
}

let ctx: FlowInteractionContext = {
  locked: false,
  onRequestInsert: () => {},
  onInsertConnector: () => {},
}

export function setFlowInteractionContext(next: FlowInteractionContext) {
  ctx = next
}

export function getFlowInteractionContext(): FlowInteractionContext {
  return ctx
}
