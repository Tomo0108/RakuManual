import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react"
import {
  AlignCenterVertical,
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronUp,
  Focus,
  Layers,
  ListChecks,
  Lock,
  LockOpen,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
  Wand2,
  X,
} from "lucide-react"
import type { FlowNode, FlowEdge, FlowState, Project, ProjectTab, ColumnSystemEntry } from "@/lib/types"
import type { UpdateProject } from "@/pages/ProjectPage"
import { now } from "@/lib/project-utils"
import { WARNING_TEXT } from "@/lib/semantic-styles"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { StepNode, setStepNodeContext } from "./StepNode"
import { SystemAxisPanel, TeamAxisPanel, LaneGuideOverlay, FlowCanvasHeader, MobileSystemAxisPanel, MobileTeamAxis, type FlowViewport } from "./FlowAxisPanels"
import { FlowPanBar } from "./FlowPanBar"
import { FlowHelpButton } from "./FlowHelpButton"
import { FlowMobileControls } from "./FlowMobileControls"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  autoLayout,
  generateFlowFromHearing,
  interpretInstruction,
  makeNode,
  regeneratePreservingManual,
  insertConnectorBetween,
  insertConnectorAfter,
  appendConnector,
  type NlProposal,
} from "./flow-logic"
import {
  FLOW_MINIMAP_HEIGHT,
  FLOW_MINIMAP_WIDTH,
  enrichEdges,
  flowContentBounds,
  flowPanXRange,
  clampFlowPanX,
  clampFlowPanY,
  ensureDecisionEdgeLabel,
  DECISION_HANDLE,
  needsInitialLayout,
  normalizeColumnSystems,
  snapNodePosition,
  syncLayoutMeta,
  nearestLaneIndex,
  dimForKind,
  restackLaneColumnNodes,
} from "./flow-layout"
import { assignSectionNumbers } from "./flow-numbering"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FlowAddEdge } from "./FlowAddEdge"
import { FlowConnectorPanel, FlowConnectorPanelBody } from "./FlowConnectorPanel"
import { ConnectorPicker } from "./ConnectorPicker"
import {
  setFlowInteractionContext,
  type ConnectorInsertTarget,
} from "./flow-interaction-context"
import { connectorById, type FlowConnector } from "./flow-connectors"
import { FlowInspectorPanel, type StepPatch } from "./FlowInspectorPanel"
import { FlowErrorsPanel } from "./FlowErrorsPanel"
import {
  applyValidationMarks,
  validateFlow,
  type FlowIssue,
} from "./flow-validation"

const nodeTypes = { step: StepNode }
const edgeTypes = { flowAdd: FlowAddEdge }

/** 軸パネル・エッジ表示・項番をノード配置と同期 */
function polishFlow(state: FlowState): FlowState {
  const synced = syncLayoutMeta(state)
  const numbered = assignSectionNumbers(synced)
  return { ...numbered, edges: enrichEdges(numbered) }
}

function initialFlow(projectFlow: FlowState): FlowState {
  if (projectFlow.nodes.length === 0) return projectFlow
  if (needsInitialLayout(projectFlow)) return autoLayout(projectFlow)
  return polishFlow(projectFlow)
}

interface Props {
  project: Project
  updateProject: UpdateProject
  setTab: (t: ProjectTab) => void
}

export function FlowEditorTab({ project, updateProject, setTab }: Props) {
  const isMobile = useIsMobile()
  const [flow, setFlow] = useState<FlowState>(() => initialFlow(project.flow))
  const [undoStack, setUndoStack] = useState<FlowState[]>([])
  const [redoStack, setRedoStack] = useState<FlowState[]>([])
  const [instruction, setInstruction] = useState("")
  const [proposal, setProposal] = useState<NlProposal | null>(null)
  const [aiThinking, setAiThinking] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false)
  const [nlOpen, setNlOpen] = useState(false)
  const [isLocked, setIsLocked] = useState(true)
  const [connectorPanelOpen, setConnectorPanelOpen] = useState(false)
  const [connectorSheetOpen, setConnectorSheetOpen] = useState(false)
  const [insertTarget, setInsertTarget] = useState<ConnectorInsertTarget | null>(null)
  const [viewport, setViewport] = useState<FlowViewport>({ x: 0, y: 0, zoom: 1 })
  const [mobileTeamAxisVisible, setMobileTeamAxisVisible] = useState(true)
  const mobileTeamAxisTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragSnapshot = useRef<FlowState | null>(null)
  const rfRef = useRef<ReactFlowInstance<FlowNode, FlowEdge> | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [canvasWidth, setCanvasWidth] = useState(0)
  const [canvasHeight, setCanvasHeight] = useState(0)
  const [rfReady, setRfReady] = useState(false)
  const [errorsPanelOpen, setErrorsPanelOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [confirmBlockedOpen, setConfirmBlockedOpen] = useState(false)

  const zoomBy = useCallback((factor: number) => {
    const inst = rfRef.current
    if (!inst) return
    void inst.zoomTo(inst.getZoom() * factor, { duration: 200 })
    const vp = inst.getViewport()
    setViewport(vp)
  }, [])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setCanvasWidth(el.clientWidth)
      setCanvasHeight(el.clientHeight)
    })
    ro.observe(el)
    setCanvasWidth(el.clientWidth)
    setCanvasHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [flow.nodes.length])

  const minimapH = isMobile ? 96 : FLOW_MINIMAP_HEIGHT

  const previewFlow = useMemo(
    () => (proposal ? polishFlow(proposal.preview(flow)) : flow),
    [proposal, flow],
  )

  const validation = useMemo(() => validateFlow(previewFlow), [previewFlow])

  const displayFlow = useMemo(
    () => applyValidationMarks(previewFlow, validation),
    [previewFlow, validation],
  )

  /** 選択状態の変化では再計算しない(タップ時の fitView 再発火を防ぐ) */
  const flowLayoutKey = useMemo(() => {
    const nodes = (proposal ? proposal.preview(flow) : flow).nodes
    return nodes.map((n) => `${n.id}:${n.position.x},${n.position.y}`).join("|")
  }, [flow, proposal])

  const flowBounds = useMemo(
    () => flowContentBounds(previewFlow),
    [flowLayoutKey, previewFlow],
  )
  const panXRange = useMemo(
    () => flowPanXRange(flowBounds, canvasWidth, viewport.zoom),
    [flowBounds, canvasWidth, viewport.zoom],
  )
  const translateExtent = useMemo(
    (): [[number, number], [number, number]] => [
      [flowBounds.minX, flowBounds.minY],
      [flowBounds.minX + flowBounds.width, flowBounds.minY + flowBounds.height],
    ],
    [flowBounds],
  )

  const isEditingDisabled = isLocked || !!proposal

  const bumpMobileTeamAxis = useCallback(() => {
    if (!isMobile) return
    setMobileTeamAxisVisible(true)
    if (mobileTeamAxisTimer.current) clearTimeout(mobileTeamAxisTimer.current)
    mobileTeamAxisTimer.current = setTimeout(() => setMobileTeamAxisVisible(false), 1800)
  }, [isMobile])

  useEffect(() => {
    return () => {
      if (mobileTeamAxisTimer.current) clearTimeout(mobileTeamAxisTimer.current)
    }
  }, [])

  const clampViewport = useCallback(
    (vp: FlowViewport): FlowViewport => {
      if (canvasWidth <= 0 || canvasHeight <= 0) return vp
      return {
        ...vp,
        x: clampFlowPanX(vp.x, flowBounds, canvasWidth, vp.zoom),
        y: clampFlowPanY(vp.y, flowBounds, canvasHeight, vp.zoom),
      }
    },
    [canvasWidth, canvasHeight, flowBounds],
  )

  const panFlowX = useCallback(
    (x: number) => {
      const inst = rfRef.current
      if (!inst || canvasWidth <= 0) return
      const vp = inst.getViewport()
      const next = clampViewport({ ...vp, x })
      inst.setViewport(next)
      setViewport(next)
    },
    [canvasWidth, clampViewport],
  )

  const fitCanvas = useCallback(() => {
    window.requestAnimationFrame(() => {
      rfRef.current?.fitView({
        padding: isMobile ? 0.06 : 0.15,
        maxZoom: isMobile ? 1.35 : 1,
        minZoom: 0.1,
      })
      const vp = rfRef.current?.getViewport()
      if (vp) {
        const clamped = clampViewport(vp)
        if (clamped.x !== vp.x || clamped.y !== vp.y) rfRef.current?.setViewport(clamped)
        setViewport(clamped)
      }
    })
  }, [isMobile, clampViewport])

  const restoreViewport = useCallback((vp: FlowViewport) => {
    requestAnimationFrame(() => {
      rfRef.current?.setViewport(vp)
      setViewport(vp)
      requestAnimationFrame(() => {
        rfRef.current?.setViewport(vp)
        setViewport(vp)
      })
    })
  }, [])

  const didFitRef = useRef(false)

  /* プロジェクトへ保存(自動保存) */
  const persist = useCallback(
    (next: FlowState) => {
      updateProject(project.id, (p) => ({ ...p, flow: next }))
    },
    [project.id, updateProject],
  )

  /* プロジェクト切替: 保存済みレイアウトを尊重(自動整列で上書きしない) */
  useEffect(() => {
    const next = initialFlow(project.flow)
    setFlow(next)
    setUndoStack([])
    setRedoStack([])
    setProposal(null)
    setInstruction("")
    setIsLocked(true)
    didFitRef.current = false
  // eslint-disable-next-line react-hooks/exhaustive-deps -- プロジェクト切替時のみ
  }, [project.id])

  useEffect(() => {
    if (didFitRef.current || flow.nodes.length === 0 || !rfReady || canvasWidth <= 0) return
    didFitRef.current = true
    fitCanvas()
  }, [flow.nodes.length, canvasWidth, canvasHeight, fitCanvas, rfReady])

  const prevIsMobileRef = useRef(isMobile)
  useEffect(() => {
    if (prevIsMobileRef.current === isMobile || flow.nodes.length === 0) {
      prevIsMobileRef.current = isMobile
      return
    }
    prevIsMobileRef.current = isMobile
    const t = window.setTimeout(() => fitCanvas(), 150)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- モバイル切替時のみ
  }, [isMobile])

  /* Undo用スナップショットを積んでから状態を更新する */
  const commit = useCallback(
    (updater: (prev: FlowState) => FlowState, snapshot?: FlowState) => {
      setFlow((prev) => {
        const base = snapshot ?? prev
        setUndoStack((s) => [...s.slice(-49), base])
        setRedoStack([])
        const next = updater(prev)
        persist(next)
        return next
      })
    },
    [persist],
  )

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack
      const prev = stack[stack.length - 1]
      setFlow((current) => {
        setRedoStack((r) => [...r, current])
        persist(prev)
        return prev
      })
      return stack.slice(0, -1)
    })
  }, [persist])

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack
      const next = stack[stack.length - 1]
      setFlow((current) => {
        setUndoStack((u) => [...u, current])
        persist(next)
        return next
      })
      return stack.slice(0, -1)
    })
  }, [persist])

  /* キーボードショートカット(Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z) */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (isEditingDisabled) return
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [undo, redo, isEditingDisabled])

  /* ノード名のその場編集(StepNodeから呼ばれる) */
  useEffect(() => {
    setStepNodeContext({
      lanes: flow.lanes,
      locked: isEditingDisabled,
      onRename: (id, label) => {
        commit((s) => ({
          ...s,
          nodes: s.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, label, manual: true } } : n,
          ),
        }))
      },
    })
  }, [flow.lanes, commit, isEditingDisabled])

  const selectedNodes = flow.nodes.filter((n) => n.selected)
  const selectedEdges = flow.edges.filter((e) => e.selected)
  const activeLane = selectedNodes.length === 1 ? selectedNodes[0].data.lane : undefined
  const inspectorNode =
    inspectorOpen && selectedNodes.length === 1 && selectedEdges.length === 0
      ? selectedNodes[0]
      : null
  const inspectorEdge =
    inspectorOpen && selectedEdges.length === 1 && selectedNodes.length === 0
      ? selectedEdges[0]
      : null

  const focusIssue = useCallback(
    (issue: FlowIssue) => {
      const inst = rfRef.current
      if (!inst) return
      if (issue.nodeId) {
        const node = flow.nodes.find((n) => n.id === issue.nodeId)
        if (!node) return
        setFlow((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => ({ ...n, selected: n.id === issue.nodeId })),
          edges: prev.edges.map((e) => ({ ...e, selected: false })),
        }))
        const dims = dimForKind(
          node.data.kind === "start" || node.data.kind === "end" || node.data.kind === "decision"
            ? node.data.kind
            : "process",
        )
        void inst.setCenter(
          node.position.x + dims.w / 2,
          node.position.y + dims.h / 2,
          { zoom: Math.max(inst.getZoom(), 0.9), duration: 300 },
        )
        setInspectorOpen(true)
        return
      }
      if (issue.edgeId) {
        setFlow((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => ({ ...n, selected: false })),
          edges: prev.edges.map((e) => ({ ...e, selected: e.id === issue.edgeId })),
        }))
        setInspectorOpen(true)
      }
    },
    [flow.nodes],
  )

  const updateSelectedNode = useCallback(
    (id: string, patch: StepPatch) => {
      commit((s) => {
        let nodes = s.nodes.map((n) => {
          if (n.id !== id) return n
          return {
            ...n,
            data: {
              ...n.data,
              ...patch,
              manual: true,
            },
          }
        })
        if (patch.lane || patch.kind) {
          nodes = restackLaneColumnNodes(nodes, s.lanes)
        }
        return polishFlow({ ...s, nodes })
      })
    },
    [commit],
  )

  const updateEdgeLabel = useCallback(
    (id: string, label: string) => {
      commit((s) =>
        polishFlow({
          ...s,
          edges: s.edges.map((e) =>
            e.id === id ? { ...e, label: label.trim() || undefined } : e,
          ),
        }),
      )
    },
    [commit],
  )

  const renameLane = useCallback(
    (index: number, name: string) => {
      commit((s) => {
        if (s.lanes[index] === name || s.lanes.includes(name)) return s
        const old = s.lanes[index]
        const lanes = s.lanes.map((l, i) => (i === index ? name : l))
        const nodes = s.nodes.map((n) =>
          n.data.lane === old ? { ...n, data: { ...n.data, lane: name, manual: true } } : n,
        )
        return polishFlow({ ...s, lanes, nodes: restackLaneColumnNodes(nodes, lanes) })
      })
    },
    [commit],
  )

  const addLane = useCallback(
    (name: string) => {
      commit((s) => {
        if (s.lanes.includes(name)) return s
        return polishFlow({ ...s, lanes: [...s.lanes, name] })
      })
    },
    [commit],
  )

  const deleteLane = useCallback(
    (index: number, moveToLane?: string) => {
      commit((s) => {
        if (s.lanes.length <= 1) return s
        const removed = s.lanes[index]
        const lanes = s.lanes.filter((_, i) => i !== index)
        const fallback = moveToLane && lanes.includes(moveToLane) ? moveToLane : lanes[0]
        const nodes = s.nodes.map((n) =>
          n.data.lane === removed
            ? { ...n, data: { ...n.data, lane: fallback, manual: true } }
            : n,
        )
        return polishFlow({ ...s, lanes, nodes: restackLaneColumnNodes(nodes, lanes) })
      })
      fitCanvas()
    },
    [commit, fitCanvas],
  )

  const clearSelection = useCallback(() => {
    setFlow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => ({ ...n, selected: false })),
      edges: prev.edges.map((e) => ({ ...e, selected: false })),
    }))
  }, [])

  const handleInsertConnector = useCallback(
    (connector: FlowConnector, target: ConnectorInsertTarget) => {
      commit((s) => {
        if (target.mode === "between" && target.sourceId && target.targetId) {
          return polishFlow(
            insertConnectorBetween(
              s,
              target.sourceId,
              target.targetId,
              connector.kind,
              connector.defaultLabel,
            ),
          )
        }
        if (target.mode === "after" && target.nodeId) {
          return polishFlow(
            insertConnectorAfter(s, target.nodeId, connector.kind, connector.defaultLabel),
          )
        }
        return polishFlow(
          appendConnector(s, connector.kind, connector.defaultLabel, target.nodeId),
        )
      })
      setInsertTarget(null)
      setConnectorSheetOpen(false)
      fitCanvas()
    },
    [commit, fitCanvas],
  )

  const handlePanelConnectorSelect = useCallback(
    (connector: FlowConnector) => {
      const anchor = selectedNodes[0]
      if (anchor) {
        handleInsertConnector(connector, { mode: "after", nodeId: anchor.id, targetKind: anchor.data.kind })
      } else {
        handleInsertConnector(connector, { mode: "append" })
      }
    },
    [handleInsertConnector, selectedNodes],
  )

  const onConnectorDragStart = useCallback((e: React.DragEvent, connector: FlowConnector) => {
    e.dataTransfer.setData("application/flow-connector", JSON.stringify({ id: connector.id }))
    e.dataTransfer.effectAllowed = "move"
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (isEditingDisabled) return
      const raw = e.dataTransfer.getData("application/flow-connector")
      if (!raw || !rfRef.current) return
      let id: string
      try {
        id = JSON.parse(raw).id
      } catch {
        return
      }
      const connector = connectorById(id)
      if (!connector) return
      const position = rfRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      commit((s) => {
        const laneCount = s.lanes.length || 1
        const dims = dimForKind(connector.kind === "decision" ? "decision" : "process")
        const li = nearestLaneIndex(position.y, dims.h, laneCount)
        const lane = s.lanes[li] ?? s.lanes[0] ?? "担当者"
        const node = makeNode(connector.defaultLabel, lane, connector.kind, position)
        const snapped = snapNodePosition(node, laneCount, s.lanes.length > 0 ? s.lanes : [lane], s.nodes)
        const withNode = [
          ...s.nodes,
          {
            ...node,
            position: snapped.position,
            data: { ...node.data, lane: snapped.lane, manual: true },
          },
        ]
        return polishFlow({
          ...s,
          lanes: s.lanes.length > 0 ? s.lanes : [lane],
          nodes: restackLaneColumnNodes(withNode, s.lanes.length > 0 ? s.lanes : [lane]),
        })
      })
      fitCanvas()
    },
    [commit, fitCanvas, isEditingDisabled],
  )

  useEffect(() => {
    setFlowInteractionContext({
      locked: isEditingDisabled,
      onRequestInsert: (target) => {
        if (isEditingDisabled) return
        setInsertTarget(target)
      },
      onInsertConnector: handleInsertConnector,
    })
  }, [isEditingDisabled, handleInsertConnector])

  /* React Flow のドラッグ等の変更 */
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      let effective = changes
      if (isEditingDisabled) {
        effective = changes.filter((c) => c.type === "select")
        if (effective.length === 0) return
      }

      const selectionOnly = effective.length > 0 && effective.every((c) => c.type === "select")

      if (effective.some((c) => c.type === "select")) {
        bumpMobileTeamAxis()
      }

      if (selectionOnly) {
        const vpBefore = rfRef.current?.getViewport()
        setFlow((prev) => ({
          ...prev,
          nodes: applyNodeChanges(effective, prev.nodes) as FlowState["nodes"],
        }))
        if (vpBefore) restoreViewport(vpBefore)
        return
      }

      const dragStart = effective.some((c) => c.type === "position" && c.dragging)
      if (dragStart && !dragSnapshot.current) {
        dragSnapshot.current = flow
      }
      const dragEnd = effective.some((c) => c.type === "position" && c.dragging === false)
      const hasRemove = effective.some((c) => c.type === "remove")
      if (hasRemove) {
        // Deleteキーによる削除もUndo可能にする
        setUndoStack((s) => [...s.slice(-49), flow])
        setRedoStack([])
      }
      setFlow((prev) => {
        const removedIds = new Set(
          effective.filter((c) => c.type === "remove").map((c) => c.id),
        )
        let updatedNodes = applyNodeChanges(effective, prev.nodes) as FlowState["nodes"]

        // ドラッグ終了時: 行・列スナップ + 担当チーム更新
        if (dragEnd) {
          updatedNodes = updatedNodes.map((n) => {
            const posChange = effective.find(
              (c) => c.type === "position" && c.id === n.id && c.dragging === false,
            )
            if (!posChange || posChange.type !== "position" || !posChange.position) return n
            const snapped = snapNodePosition(n, prev.lanes.length || 1, prev.lanes, updatedNodes)
            return {
              ...n,
              position: snapped.position,
              data: { ...n.data, lane: snapped.lane, manual: true },
            }
          })
          updatedNodes = restackLaneColumnNodes(updatedNodes, prev.lanes)
        }

        const next = polishFlow({
          ...prev,
          nodes: updatedNodes,
          edges: hasRemove
            ? prev.edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target))
            : prev.edges,
        })
        if (dragEnd || hasRemove) persist(next)
        return next
      })
      if (dragEnd && dragSnapshot.current) {
        const snap = dragSnapshot.current
        dragSnapshot.current = null
        setUndoStack((s) => [...s.slice(-49), snap])
        setRedoStack([])
      }
    },
    [flow, persist, isEditingDisabled, bumpMobileTeamAxis, restoreViewport],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      let effective = changes
      if (isEditingDisabled) {
        effective = changes.filter((c) => c.type === "select")
        if (effective.length === 0) return
      }

      const selectionOnly = effective.length > 0 && effective.every((c) => c.type === "select")
      if (selectionOnly) {
        const vpBefore = rfRef.current?.getViewport()
        setFlow((prev) => ({
          ...prev,
          edges: applyEdgeChanges(effective, prev.edges) as FlowState["edges"],
        }))
        if (vpBefore) restoreViewport(vpBefore)
        return
      }

      const hasRemove = effective.some((c) => c.type === "remove")
      if (hasRemove) {
        setUndoStack((s) => [...s.slice(-49), flow])
        setRedoStack([])
      }
      setFlow((prev) => {
        const next = { ...prev, edges: applyEdgeChanges(effective, prev.edges) as FlowState["edges"] }
        if (hasRemove) persist(next)
        return next
      })
    },
    [flow, persist, isEditingDisabled, restoreViewport],
  )

  const onConnect = useCallback(
    (conn: Connection) => {
      commit((s) => {
        const newEdges = addEdge(conn, s.edges) as FlowState["edges"]
        const added = newEdges[newEdges.length - 1]
        const src = s.nodes.find((n) => n.id === conn.source)
        if (!src || src.data.kind !== "decision" || !added) {
          return polishFlow({ ...s, edges: newEdges })
        }
        const label = ensureDecisionEdgeLabel(added, src, newEdges)
        const sourceHandle = label === "いいえ" ? DECISION_HANDLE.no : DECISION_HANDLE.yes
        const edges = newEdges.map((e, i) =>
          i === newEdges.length - 1 ? { ...e, label, sourceHandle } : e,
        )
        return polishFlow({ ...s, edges })
      })
    },
    [commit],
  )

  /* ツールバー操作 */
  const openConnectorPicker = useCallback(() => {
    if (isMobile) setConnectorSheetOpen(true)
    else setConnectorPanelOpen(true)
  }, [isMobile])

  const deleteSelected = () => {
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return
    const nodeIds = new Set(selectedNodes.map((n) => n.id))
    const edgeIds = new Set(selectedEdges.map((e) => e.id))
    commit((s) =>
      polishFlow({
        ...s,
        nodes: s.nodes.filter((n) => !nodeIds.has(n.id)),
        edges: s.edges.filter(
          (e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target),
        ),
      }),
    )
  }

  const doAutoLayout = () => {
    commit((s) => autoLayout(s))
    fitCanvas()
  }

  /* AI生成(空の場合) */
  const generate = () => {
    setGenerating(true)
    window.setTimeout(() => {
      const generated = generateFlowFromHearing(project.name)
      commit(() => generated)
      updateProject(project.id, (p) => ({
        ...p,
        status: p.status === "hearing" ? "flow" : p.status,
        history: [
          { id: `h-${Date.now()}`, date: now(), user: "山田 太郎", action: "フロー図をAI生成" },
          ...p.history,
        ],
      }))
      setGenerating(false)
      fitCanvas()
    }, 900)
  }

  /* 再生成(F-2): 手動修正ノードは保護。Undoでも復元可能 */
  const regenerate = () => {
    setRegenConfirmOpen(false)
    commit(() => regeneratePreservingManual(flow, project.name))
    fitCanvas()
    updateProject(project.id, (p) => ({
      ...p,
      history: [
        {
          id: `h-${Date.now()}`,
          date: now(),
          user: "山田 太郎",
          action: "フロー図を再生成(手動修正ステップは保護)",
        },
        ...p.history,
      ],
    }))
  }

  /* 自然言語修正: 提案の生成 → 差分プレビュー → 承認/却下 */
  const askAi = () => {
    if (!instruction.trim()) return
    setAiThinking(true)
    window.setTimeout(() => {
      setProposal(interpretInstruction(instruction.trim(), flow))
      setAiThinking(false)
    }, 700)
  }

  const approveProposal = () => {
    if (!proposal) return
    commit((s) => polishFlow(proposal.apply(s)))
    updateProject(project.id, (p) => ({
      ...p,
      history: [
        { id: `h-${Date.now()}`, date: now(), user: "山田 太郎", action: `自然言語修正を適用: ${proposal.description.slice(0, 40)}…` },
        ...p.history,
      ],
    }))
    setProposal(null)
    setInstruction("")
    fitCanvas()
  }

  const requestConfirmFlow = () => {
    if (validation.errorCount > 0) {
      setConfirmBlockedOpen(true)
      setErrorsPanelOpen(true)
      return
    }
    confirmFlow()
  }

  const confirmFlow = () => {
    setConfirmBlockedOpen(false)
    const finalized = polishFlow(flow)
    setFlow(finalized)
    persist(finalized)
    updateProject(project.id, (p) => {
      const known = new Map(p.deepdive.map((d) => [d.stepId, d]))
      const nextDeepdive = finalized.nodes
        .filter((n) => n.data.kind === "process" || n.data.kind === "decision")
        .map((n) => {
          const existing = known.get(n.id)
          if (!existing) {
            return {
              stepId: n.id,
              stepLabel: n.data.label,
              sectionNumber: n.data.sectionNumber,
              importance: "normal" as const,
              status: "not-started" as const,
              answers: [],
            }
          }
          const labelChanged = existing.stepLabel !== n.data.label
          return {
            ...existing,
            stepLabel: n.data.label,
            sectionNumber: n.data.sectionNumber,
            status:
              labelChanged && (existing.status === "done" || existing.status === "in-progress")
                ? ("recheck" as const)
                : existing.status,
          }
        })
      const recheckCount = nextDeepdive.filter(
        (d) => d.status === "recheck" && known.get(d.stepId)?.status !== "recheck",
      ).length
      return {
        ...p,
        flow: finalized,
        updatedAt: now().slice(0, 10),
        status: p.status === "flow" || p.status === "hearing" ? "deepdive" : p.status,
        deepdive: nextDeepdive,
        history: [
          {
            id: `h-${Date.now()}`,
            date: now(),
            user: "山田 太郎",
            action:
              recheckCount > 0
                ? `フロー図を確定(変更の影響で ${recheckCount} 件の深掘り回答が要確認になりました)`
                : "フロー図を確定",
          },
          ...p.history,
        ],
      }
    })
    setTab("deepdive")
  }

  const columnSystems = normalizeColumnSystems(
    previewFlow.layoutMeta?.columnSystems ?? flow.layoutMeta?.columnSystems,
    previewFlow.layoutMeta?.columnCount ?? flow.layoutMeta?.columnCount ?? 1,
  )

  const updateColumnSystem = (col: number, entry: ColumnSystemEntry) => {
    commit((s) => {
      const count = s.layoutMeta?.columnCount ?? col + 1
      const cols = normalizeColumnSystems(s.layoutMeta?.columnSystems, count)
      cols[col] = entry
      return { ...s, layoutMeta: { columnCount: count, columnSystems: cols } }
    })
  }

  /* 空状態 */
  if (flow.nodes.length === 0) {
    const hearingDone = project.hearingAnswers.length >= 8
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="size-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold">フロー図をAIで生成</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            骨組みヒアリングの回答をもとに、担当者レーン・条件分岐を含む業務フロー図を自動生成します。生成後は自由に編集できます。
          </p>
          {!hearingDone && (
            <p className={cn("mt-3 text-xs", WARNING_TEXT)}>
              ヒアリングの回答がまだ少ないため、生成精度が下がる可能性があります
            </p>
          )}
          <div className="mt-5 flex justify-center gap-3">
            <Button variant="outline" onClick={() => setTab("hearing")} className="gap-1.5">
              <ArrowLeft className="size-4" />
              ヒアリングに戻る
            </Button>
            <Button onClick={generate} disabled={generating} className="gap-1.5">
              <Sparkles className="size-4" />
              {generating ? "生成中…" : "フロー図を生成する"}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* ツールバー */}
      <div className="scrollbar-none scroll-touch flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-background px-2 py-1.5 md:gap-1 md:px-3 md:py-1.5">
        {(isMobile || !connectorPanelOpen) && (
          <ToolButton
            label="コネクタを追加"
            onClick={openConnectorPicker}
            disabled={isEditingDisabled}
          >
            <Layers className="size-4" />
          </ToolButton>
        )}
        {!isMobile && <Separator orientation="vertical" className="mx-0.5 !h-5" />}
        <ToolButton
          label="選択中の要素を削除(Delete)"
          onClick={deleteSelected}
          disabled={isEditingDisabled || (selectedNodes.length === 0 && selectedEdges.length === 0)}
        >
          <Trash2 className="size-4" />
        </ToolButton>
        {(selectedNodes.length > 0 || selectedEdges.length > 0) && (
          <span className="hidden px-1 text-[10px] text-muted-foreground sm:inline">
            {selectedNodes.length > 0 && `${selectedNodes.length}ノード`}
            {selectedNodes.length > 0 && selectedEdges.length > 0 && " / "}
            {selectedEdges.length > 0 && `${selectedEdges.length}結線`}
          </span>
        )}
        <ToolButton label="元に戻す(⌘Z)" onClick={undo} disabled={isEditingDisabled || undoStack.length === 0}>
          <Undo2 className="size-4" />
        </ToolButton>
        <ToolButton label="やり直す(⇧⌘Z)" onClick={redo} disabled={isEditingDisabled || redoStack.length === 0}>
          <Redo2 className="size-4" />
        </ToolButton>
        {!isMobile && (
          <>
            <Separator orientation="vertical" className="mx-0.5 !h-5" />
            <ToolButton label="レイアウトを自動整列" onClick={doAutoLayout} disabled={isEditingDisabled}>
              <AlignCenterVertical className="size-4" />
            </ToolButton>
            <ToolButton
              label="ヒアリング回答からフロー図を再生成(手動修正は保護)"
              onClick={() => setRegenConfirmOpen(true)}
              disabled={isEditingDisabled}
            >
              <Sparkles className="size-4" />
            </ToolButton>
          </>
        )}
        {isMobile && (
          <ToolButton
            label="全体表示"
            onClick={() => {
              bumpMobileTeamAxis()
              fitCanvas()
            }}
          >
            <Focus className="size-4" />
          </ToolButton>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1 pl-1">
          {validation.issues.length > 0 && (
            <ToolButton
              label={`問題 ${validation.errorCount}件のエラー / ${validation.warningCount}件の警告`}
              onClick={() => setErrorsPanelOpen((v) => !v)}
            >
              <span className="relative">
                <AlertTriangle
                  className={cn(
                    "size-4",
                    validation.errorCount > 0 ? "text-destructive" : "text-amber-600",
                  )}
                />
                <span className="absolute -top-1.5 -right-1.5 flex size-3.5 items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-white">
                  {validation.issues.length}
                </span>
              </span>
            </ToolButton>
          )}
          <FlowHelpButton isMobile={isMobile} isLocked={isLocked} />
          <ToolButton
            label={isLocked ? "編集モードに切り替え" : "ロックして閲覧モードに"}
            onClick={() => setIsLocked((v) => !v)}
            disabled={!!proposal}
          >
            {isLocked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
          </ToolButton>
          <ToolButton
            label={isMobile ? "確定" : "フロー図を確定して深掘りへ"}
            onClick={requestConfirmFlow}
            variant="default"
          >
            <ListChecks className="size-4" />
          </ToolButton>
        </div>
      </div>

      {/* キャンバス: コネクタ(左) + 担当チーム + フロー(中央) + 利用システム(下) */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          {!isMobile && (
            <FlowConnectorPanel
              collapsed={!connectorPanelOpen}
              onToggleCollapse={() => setConnectorPanelOpen((v) => !v)}
              onSelect={handlePanelConnectorSelect}
              onDragStart={onConnectorDragStart}
              disabled={isEditingDisabled}
            />
          )}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              {!isMobile && (
                <TeamAxisPanel
                  lanes={flow.lanes}
                  nodes={previewFlow.nodes}
                  viewport={viewport}
                  activeLane={activeLane}
                  editable={!isEditingDisabled}
                  onRenameLane={renameLane}
                  onAddLane={addLane}
                  onDeleteLane={deleteLane}
                />
              )}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {!isMobile && <FlowCanvasHeader />}
                <div
                  ref={canvasRef}
                  className="relative min-h-0 flex-1"
                  onPointerDown={bumpMobileTeamAxis}
                >
              <ReactFlowProvider>
                {/* 行・列ガイド(フロー座標系) */}
                <div
                  className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
                  aria-hidden
                >
                  <div
                    style={{
                      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                      transformOrigin: "0 0",
                    }}
                  >
                    <LaneGuideOverlay lanes={flow.lanes} nodes={previewFlow.nodes} layoutMeta={flow.layoutMeta} />
                  </div>
                </div>
                <ReactFlow
                  className="z-[1] h-full"
                  nodes={displayFlow.nodes}
                  edges={displayFlow.edges}
                  onInit={(inst) => {
                    rfRef.current = inst
                    setRfReady(true)
                  }}
                  viewport={viewport}
                  onViewportChange={(vp) => {
                    bumpMobileTeamAxis()
                    setViewport(clampViewport(vp))
                  }}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={isEditingDisabled ? undefined : onConnect}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  onPaneClick={() => {
                    if (!proposal) setInspectorOpen(true)
                  }}
                  onPaneContextMenu={(e) => {
                    e.preventDefault()
                    if (isEditingDisabled) return
                    setInsertTarget({ mode: "append" })
                  }}
                  onNodeContextMenu={(e, node) => {
                    e.preventDefault()
                    if (isEditingDisabled) return
                    setInsertTarget({
                      mode: "after",
                      nodeId: node.id,
                      targetKind: node.data.kind,
                    })
                  }}
                  onEdgeContextMenu={(e, edge) => {
                    e.preventDefault()
                    if (isEditingDisabled) return
                    setInsertTarget({
                      mode: "between",
                      sourceId: edge.source,
                      targetId: edge.target,
                    })
                  }}
                  onNodeClick={() => setInspectorOpen(true)}
                  onEdgeClick={() => setInspectorOpen(true)}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  nodesDraggable={!isEditingDisabled}
                  nodesConnectable={!isEditingDisabled}
                  elementsSelectable={!proposal}
                  selectionOnDrag={false}
                  panOnDrag
                  multiSelectionKeyCode="Shift"
                  selectionKeyCode="Shift"
                  translateExtent={translateExtent}
                  minZoom={0.12}
                  maxZoom={2.5}
                  zoomOnPinch
                  zoomOnScroll={!isMobile}
                  panOnScroll={false}
                  deleteKeyCode={isEditingDisabled ? null : ["Backspace", "Delete"]}
                  proOptions={{ hideAttribution: true }}
                  defaultEdgeOptions={{
                    type: "smoothstep",
                    style: { strokeWidth: 1.5, stroke: "var(--foreground)", opacity: 0.55 },
                    labelStyle: { fontSize: 10, fill: "var(--foreground)" },
                    labelBgStyle: { fill: "var(--background)", fillOpacity: 0.85 },
                    labelBgPadding: [4, 6] as [number, number],
                    labelBgBorderRadius: 4,
                  }}
                  connectionLineStyle={{ strokeWidth: 1.5, stroke: "var(--primary)" }}
                >
                  <Background gap={16} size={1} color="var(--border)" />
                  {!isMobile && (
                    <Controls
                      position="top-left"
                      showInteractive={false}
                      className="!m-3 !shadow-sm [&>button]:!size-7"
                    />
                  )}
                </ReactFlow>
                {isMobile && (
                  <FlowMobileControls
                    visible={mobileTeamAxisVisible}
                    onZoomIn={() => {
                      bumpMobileTeamAxis()
                      zoomBy(1.25)
                    }}
                    onZoomOut={() => {
                      bumpMobileTeamAxis()
                      zoomBy(1 / 1.25)
                    }}
                    onFitView={() => {
                      bumpMobileTeamAxis()
                      fitCanvas()
                    }}
                    className="top-2"
                  />
                )}
                {isMobile && (
                  <MobileTeamAxis
                    lanes={flow.lanes}
                    nodes={previewFlow.nodes}
                    viewport={viewport}
                    activeLane={activeLane}
                    visible={mobileTeamAxisVisible}
                  />
                )}
                {isMobile && activeLane && (
                  <div className="pointer-events-none absolute right-2 top-2 z-40 max-w-[calc(100%-5rem)] rounded-lg border border-primary/40 bg-primary-subtle/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
                    <span className="block text-[8px] font-medium uppercase tracking-wide text-primary/70">担当部署</span>
                    <span className="block truncate text-[11px] font-semibold text-primary">{activeLane}</span>
                  </div>
                )}
                {/* ReactFlow は overflow:hidden のため MiniMap はキャンバス内に重ねて配置 */}
                <div
                  className={cn(
                    "pointer-events-auto absolute z-50",
                    isMobile ? "right-2 bottom-2" : "right-3 bottom-3",
                  )}
                  style={{
                    width: isMobile ? 148 : FLOW_MINIMAP_WIDTH,
                    height: minimapH,
                  }}
                >
                  <FlowMinimap
                    width={isMobile ? 148 : FLOW_MINIMAP_WIDTH}
                    height={minimapH}
                  />
                </div>
              </ReactFlowProvider>

              {errorsPanelOpen && validation.issues.length > 0 && (
                <div className="absolute top-12 left-3 z-30">
                  <FlowErrorsPanel
                    issues={validation.issues}
                    onFocusIssue={focusIssue}
                    onClose={() => setErrorsPanelOpen(false)}
                  />
                </div>
              )}

              {proposal && (
                <div className="absolute inset-x-0 top-12 z-20 flex justify-center px-4">
                  <Alert className="max-w-xl border-primary/40 bg-background shadow-lg">
                    <Wand2 className="size-4 text-primary" />
                    <AlertTitle className="font-semibold">AIの修正案(差分プレビュー中)</AlertTitle>
                    <AlertDescription>
                      <p className="text-[13px] leading-relaxed">{proposal.description}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        緑=追加 / 赤=削除 / 黄=変更。承認するまでフロー図は変更されません。
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" className="gap-1" onClick={approveProposal}>
                          <Check className="size-3.5" />
                          承認して反映
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => setProposal(null)}>
                          <X className="size-3.5" />
                          却下
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </div>
            <FlowPanBar
              viewport={viewport}
              contentWidth={flowBounds.width}
              viewWidth={canvasWidth}
              panMinX={panXRange.min}
              panMaxX={panXRange.max}
              onPanX={panFlowX}
            />
              </div>
            </div>
            {isMobile ? (
              <MobileSystemAxisPanel columnSystems={columnSystems} viewport={viewport} />
            ) : (
              <SystemAxisPanel
                columnSystems={columnSystems}
                viewport={viewport}
                onUpdateColumn={isEditingDisabled ? undefined : updateColumnSystem}
                readOnly={isEditingDisabled}
              />
            )}
          </div>
        {!isMobile && (inspectorNode || inspectorEdge) && (
          <FlowInspectorPanel
            node={inspectorNode}
            edge={inspectorEdge}
            lanes={flow.lanes}
            locked={isEditingDisabled}
            onUpdateNode={updateSelectedNode}
            onUpdateEdgeLabel={updateEdgeLabel}
            onClose={clearSelection}
          />
        )}
        </div>
      </div>

      {/* コネクタ選択(キャンバス上の＋・右クリック) */}
      <Dialog open={!!insertTarget} onOpenChange={(open) => !open && setInsertTarget(null)}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-sm">コネクタを追加</DialogTitle>
            <DialogDescription className="text-xs">
              {insertTarget?.mode === "between"
                ? "この結線の間に挿入するコネクタを選んでください"
                : insertTarget?.mode === "after"
                  ? "このステップの後に追加するコネクタを選んでください"
                  : "追加するコネクタを選んでください"}
            </DialogDescription>
          </DialogHeader>
          {insertTarget && (
            <ConnectorPicker
              mode={insertTarget.mode}
              targetKind={insertTarget.targetKind}
              onSelect={(c) => handleInsertConnector(c, insertTarget)}
              className="max-h-[min(60vh,420px)]"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* モバイル: コネクタパネル */}
      <Dialog open={connectorSheetOpen} onOpenChange={setConnectorSheetOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-sm">コネクタを追加</DialogTitle>
            <DialogDescription className="text-xs">
              追加するコネクタを選んでください
            </DialogDescription>
          </DialogHeader>
          <FlowConnectorPanelBody
            onSelect={(c) => {
              const anchor = selectedNodes[0]
              if (anchor) {
                handleInsertConnector(c, { mode: "after", nodeId: anchor.id, targetKind: anchor.data.kind })
              } else {
                handleInsertConnector(c, { mode: "append" })
              }
            }}
          />
        </DialogContent>
      </Dialog>

      {/* 再生成の確認ダイアログ(破壊的操作の確認 4-A) */}
      <Dialog open={regenConfirmOpen} onOpenChange={setRegenConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>フロー図を再生成しますか?</DialogTitle>
            <DialogDescription>
              ヒアリング回答をもとにフロー図を作り直します。
              <span className="font-medium text-foreground">
                「手動修正」バッジの付いたステップは保護され、上書きされません。
              </span>
              再生成後も ⌘Z でいつでも元に戻せます。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenConfirmOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={regenerate} className="gap-1.5">
              <Sparkles className="size-4" />
              再生成する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 検証エラーがある場合の確定ブロック */}
      <Dialog open={confirmBlockedOpen} onOpenChange={setConfirmBlockedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>フロー図に問題があります</DialogTitle>
            <DialogDescription>
              エラーが {validation.errorCount} 件あるため確定できません。問題パネルから該当箇所を確認して修正してください。
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-destructive">
            {validation.issues
              .filter((i) => i.severity === "error")
              .slice(0, 8)
              .map((i) => (
                <li key={i.id}>・{i.message}</li>
              ))}
          </ul>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmBlockedOpen(false)
                setErrorsPanelOpen(true)
              }}
            >
              問題を確認する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* モバイル: ステップ／結線インスペクタ */}
      {isMobile && (
        <Dialog
          open={!!(inspectorNode || inspectorEdge)}
          onOpenChange={(open) => {
            if (!open) clearSelection()
          }}
        >
          <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton={false}>
            <FlowInspectorPanel
              node={inspectorNode}
              edge={inspectorEdge}
              lanes={flow.lanes}
              locked={isEditingDisabled}
              onUpdateNode={updateSelectedNode}
              onUpdateEdgeLabel={updateEdgeLabel}
              onClose={clearSelection}
              className="w-full border-0"
            />
          </DialogContent>
        </Dialog>
      )}

      {/* 自然言語修正の入力(F-3) */}
      {isMobile ? (
        <div className="shrink-0 border-t bg-background">
          {nlOpen ? (
            <div className="px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <div className="mb-2 flex items-center justify-end">
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setNlOpen(false)} aria-label="閉じる">
                  <ChevronUp className="size-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="修正内容を入力…"
                  className="h-10 flex-1 text-sm"
                  disabled={!!proposal || aiThinking}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) askAi()
                  }}
                />
                <Button
                  size="icon"
                  className="size-10 shrink-0"
                  onClick={askAi}
                  disabled={!instruction.trim() || !!proposal || aiThinking}
                  aria-label={aiThinking ? "解析中" : "修正案を作成"}
                >
                  <Sparkles className="size-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10"
                onClick={() => setNlOpen(true)}
                aria-label="AI修正"
              >
                <Wand2 className="size-4 text-primary" />
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="shrink-0 border-t bg-background px-4 py-2.5">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <Input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="修正内容を入力…"
              className="h-9 flex-1"
              disabled={!!proposal || aiThinking}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) askAi()
              }}
            />
            <ToolButton
              label={aiThinking ? "解析中…" : "修正案を作成"}
              onClick={askAi}
              disabled={!instruction.trim() || !!proposal || aiThinking}
              variant="default"
            >
              <Sparkles className="size-4" />
            </ToolButton>
          </div>
        </div>
      )}
    </div>
  )
}

/** ReactFlow の overflow:hidden を避けるため、Provider 配下でキャンバス外に描画 */
function FlowMinimap({ width, height }: { width: number; height: number }) {
  return (
    <MiniMap
      position="top-left"
      className="!static !m-0 !h-full !w-full rounded-md border-2 border-border/80 bg-background shadow-md"
      style={{ width, height }}
      nodeColor={(n) => {
        const k = (n.data as FlowNode["data"]).kind
        if (k === "start") return "#34d399"
        if (k === "end") return "#fb7185"
        if (k === "decision") return "#fbbf24"
        return "var(--color-primary)"
      }}
      maskColor="rgb(0 0 0 / 0.06)"
      pannable
      zoomable
    />
  )
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
  variant = "ghost",
  className,
  iconOnly = true,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  variant?: "ghost" | "outline" | "default"
  className?: string
  iconOnly?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button
            variant={variant}
            size={iconOnly ? "icon" : "sm"}
            className={cn(iconOnly ? "size-9 shrink-0 px-0" : "h-8 gap-1 px-2 text-xs", className)}
            onClick={onClick}
            disabled={disabled}
            aria-label={iconOnly ? label : undefined}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
