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
  Check,
  Diamond,
  ListChecks,
  Plus,
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { StepNode, setStepNodeContext } from "./StepNode"
import { SystemAxisPanel, TeamAxisPanel, LaneGuideOverlay, FlowCanvasHeader, type FlowViewport } from "./FlowAxisPanels"
import { FlowPanBar } from "./FlowPanBar"
import {
  autoLayout,
  generateFlowFromHearing,
  interpretInstruction,
  makeNode,
  regeneratePreservingManual,
  type NlProposal,
} from "./flow-logic"
import {
  COL_WIDTH,
  FLOW_MINIMAP_HEIGHT,
  FLOW_MINIMAP_WIDTH,
  FLOW_ORIGIN_X,
  FLOW_ORIGIN_Y,
  LANE_ROW_HEIGHT,
  NODE_DIMS,
  enrichEdges,
  gridDimensions,
  needsInitialLayout,
  normalizeColumnSystems,
  snapNodePosition,
  syncLayoutMeta,
} from "./flow-layout"
import { assignSectionNumbers } from "./flow-numbering"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const nodeTypes = { step: StepNode }

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
  const [flow, setFlow] = useState<FlowState>(() => initialFlow(project.flow))
  const [undoStack, setUndoStack] = useState<FlowState[]>([])
  const [redoStack, setRedoStack] = useState<FlowState[]>([])
  const [instruction, setInstruction] = useState("")
  const [proposal, setProposal] = useState<NlProposal | null>(null)
  const [aiThinking, setAiThinking] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false)
  const [viewport, setViewport] = useState<FlowViewport>({ x: 0, y: 0, zoom: 1 })
  const dragSnapshot = useRef<FlowState | null>(null)
  const rfRef = useRef<ReactFlowInstance<FlowNode, FlowEdge> | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [canvasWidth, setCanvasWidth] = useState(0)

  const fitCanvas = useCallback(() => {
    window.requestAnimationFrame(() => {
      rfRef.current?.fitView({ padding: 0.15, maxZoom: 1 })
      const vp = rfRef.current?.getViewport()
      if (vp) setViewport(vp)
    })
  }, [])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setCanvasWidth(el.clientWidth))
    ro.observe(el)
    setCanvasWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [flow.nodes.length])

  const flowContentWidth = gridDimensions(
    flow.lanes.length || 1,
    flow.layoutMeta?.columnCount ?? 1,
  ).width

  const panFlowX = useCallback((x: number) => {
    const inst = rfRef.current
    if (!inst) return
    const vp = inst.getViewport()
    inst.setViewport({ ...vp, x })
    setViewport({ ...vp, x })
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
    didFitRef.current = false
  // eslint-disable-next-line react-hooks/exhaustive-deps -- プロジェクト切替時のみ
  }, [project.id])

  useEffect(() => {
    if (didFitRef.current || flow.nodes.length === 0) return
    didFitRef.current = true
    fitCanvas()
  }, [flow.nodes.length, fitCanvas])

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
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [undo, redo])

  /* ノード名のその場編集(StepNodeから呼ばれる) */
  useEffect(() => {
    setStepNodeContext({
      lanes: flow.lanes,
      onRename: (id, label) => {
        commit((s) => ({
          ...s,
          nodes: s.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, label, manual: true } } : n,
          ),
        }))
      },
    })
  }, [flow.lanes, commit])

  /* React Flow のドラッグ等の変更 */
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const dragStart = changes.some((c) => c.type === "position" && c.dragging)
      if (dragStart && !dragSnapshot.current) {
        dragSnapshot.current = flow
      }
      const dragEnd = changes.some((c) => c.type === "position" && c.dragging === false)
      const hasRemove = changes.some((c) => c.type === "remove")
      if (hasRemove) {
        // Deleteキーによる削除もUndo可能にする
        setUndoStack((s) => [...s.slice(-49), flow])
        setRedoStack([])
      }
      setFlow((prev) => {
        const removedIds = new Set(
          changes.filter((c) => c.type === "remove").map((c) => c.id),
        )
        let updatedNodes = applyNodeChanges(changes, prev.nodes) as FlowState["nodes"]

        // ドラッグ終了時: 行・列スナップ + 担当チーム更新
        if (dragEnd) {
          updatedNodes = updatedNodes.map((n) => {
            const posChange = changes.find(
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
    [flow, persist],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const hasRemove = changes.some((c) => c.type === "remove")
      if (hasRemove) {
        setUndoStack((s) => [...s.slice(-49), flow])
        setRedoStack([])
      }
      setFlow((prev) => {
        const next = { ...prev, edges: applyEdgeChanges(changes, prev.edges) as FlowState["edges"] }
        if (hasRemove) persist(next)
        return next
      })
    },
    [flow, persist],
  )

  const onConnect = useCallback(
    (conn: Connection) => {
      commit((s) => polishFlow({ ...s, edges: addEdge(conn, s.edges) as FlowState["edges"] }))
    },
    [commit],
  )

  /* ツールバー操作 */
  const selectedNodes = flow.nodes.filter((n) => n.selected)
  const selectedEdges = flow.edges.filter((e) => e.selected)
  const activeLane = selectedNodes.length === 1 ? selectedNodes[0].data.lane : undefined

  const addStep = (kind: "process" | "decision") => {
    const lane = selectedNodes[0]?.data.lane ?? flow.lanes[0] ?? "担当者"
    const li = Math.max(0, flow.lanes.indexOf(lane))
    const pos = {
      x: FLOW_ORIGIN_X + (flow.layoutMeta?.columnCount ?? 1) * COL_WIDTH,
      y: FLOW_ORIGIN_Y + li * LANE_ROW_HEIGHT + (LANE_ROW_HEIGHT - NODE_DIMS.process.h) / 2,
    }
    commit((s) =>
      polishFlow({
        ...s,
        lanes: s.lanes.length > 0 ? s.lanes : [lane],
        nodes: [...s.nodes, makeNode(kind === "decision" ? "条件分岐?" : "新しいステップ", lane, kind, pos)],
      }),
    )
  }

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

  const previewFlow = useMemo(
    () => (proposal ? polishFlow(proposal.preview(flow)) : flow),
    [proposal, flow],
  )

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

  const confirmFlow = () => {
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
            <p className="mt-3 text-xs text-amber-600">
              ヒアリングの回答がまだ少ないため、生成精度が下がる可能性があります
            </p>
          )}
          <div className="mt-5 flex justify-center gap-3">
            <Button variant="outline" onClick={() => setTab("hearing")}>
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
      <div className="scrollbar-none scroll-touch flex items-center gap-1.5 overflow-x-auto border-b bg-background px-3 py-2 md:px-4">
        <ToolButton label="ステップを追加" onClick={() => addStep("process")}>
          <Plus className="size-4" />
          ステップ
        </ToolButton>
        <ToolButton label="条件分岐を追加" onClick={() => addStep("decision")}>
          <Diamond className="size-4" />
          分岐
        </ToolButton>
        <Separator orientation="vertical" className="mx-1 !h-5" />
        <ToolButton
          label="選択中の要素を削除(Delete)"
          onClick={deleteSelected}
          disabled={selectedNodes.length === 0 && selectedEdges.length === 0}
        >
          <Trash2 className="size-4" />
        </ToolButton>
        <ToolButton label="元に戻す(⌘Z)" onClick={undo} disabled={undoStack.length === 0}>
          <Undo2 className="size-4" />
        </ToolButton>
        <ToolButton label="やり直す(⇧⌘Z)" onClick={redo} disabled={redoStack.length === 0}>
          <Redo2 className="size-4" />
        </ToolButton>
        <Separator orientation="vertical" className="mx-1 !h-5" />
        <ToolButton label="レイアウトを自動整列" onClick={doAutoLayout}>
          <AlignCenterVertical className="size-4" />
          自動整列
        </ToolButton>
        <ToolButton label="ヒアリング回答からフロー図を再生成(手動修正は保護)" onClick={() => setRegenConfirmOpen(true)}>
          <Sparkles className="size-4" />
          再生成
        </ToolButton>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="hidden text-[11px] text-muted-foreground lg:inline">編集内容は自動保存されます</span>
          <Button size="sm" className="gap-1.5 whitespace-nowrap" onClick={confirmFlow}>
            <ListChecks className="size-4" />
            フロー図を確定して深掘りへ
          </Button>
        </div>
      </div>

      {/* キャンバス: 担当チーム(左) + フロー(中央) + 利用システム(下) */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <TeamAxisPanel lanes={flow.lanes} viewport={viewport} activeLane={activeLane} />
          <div className="flex min-w-0 flex-1 flex-col min-h-0">
            <FlowCanvasHeader />
            <div ref={canvasRef} className="relative min-h-0 flex-1">
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
                    <LaneGuideOverlay lanes={flow.lanes} layoutMeta={flow.layoutMeta} />
                  </div>
                </div>
                <ReactFlow
                  className="z-[1] h-full"
                  nodes={previewFlow.nodes}
                  edges={previewFlow.edges}
                  onInit={(inst) => {
                    rfRef.current = inst
                    setViewport(inst.getViewport())
                  }}
                  onMove={(_, vp) => setViewport(vp)}
                  onMoveEnd={(_, vp) => setViewport(vp)}
                  onNodesChange={proposal ? undefined : onNodesChange}
                  onEdgesChange={proposal ? undefined : onEdgesChange}
                  onConnect={proposal ? undefined : onConnect}
                  nodeTypes={nodeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
                  deleteKeyCode={proposal ? null : ["Backspace", "Delete"]}
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
                  <Controls
                    position="top-left"
                    showInteractive={false}
                    className="!m-3 !shadow-sm [&>button]:!size-7"
                  />
                </ReactFlow>
                {/* ReactFlow は overflow:hidden のため MiniMap はキャンバス内に重ねて配置 */}
                <div
                  className="pointer-events-auto absolute right-3 bottom-3 z-50"
                  style={{ width: FLOW_MINIMAP_WIDTH, height: FLOW_MINIMAP_HEIGHT }}
                >
                  <FlowMinimap />
                </div>
              </ReactFlowProvider>

              {!proposal && (
                <div className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-10rem)] rounded-md border bg-background/90 px-2.5 py-1 text-[10px] text-muted-foreground shadow-xs backdrop-blur">
                  左→右に進行 / ダブルクリックで編集 / 下部バーで左右移動
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
              contentWidth={flowContentWidth}
              viewWidth={canvasWidth}
              onPanX={panFlowX}
            />
          </div>
        </div>
        <SystemAxisPanel
          columnSystems={columnSystems}
          viewport={viewport}
          onUpdateColumn={proposal ? undefined : updateColumnSystem}
          readOnly={!!proposal}
        />
      </div>

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

      {/* 自然言語修正の入力(F-3) */}
      <div className="border-t bg-background px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Wand2 className="size-4" />
          </div>
          <Input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='ことばで修正を指示できます。例:「経費精算システムに入力」と「領収書画像を添付して申請」の間に「上長への事前相談」を追加'
            className="flex-1"
            disabled={!!proposal || aiThinking}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) askAi()
            }}
          />
          <Button onClick={askAi} disabled={!instruction.trim() || !!proposal || aiThinking} className="gap-1.5">
            <Sparkles className="size-4" />
            {aiThinking ? "解析中…" : "修正案を作成"}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** ReactFlow の overflow:hidden を避けるため、Provider 配下でキャンバス外に描画 */
function FlowMinimap() {
  return (
    <MiniMap
      position="top-left"
      className="!static !m-0 !h-full !w-full rounded-md border bg-background shadow-md"
      style={{ width: FLOW_MINIMAP_WIDTH, height: FLOW_MINIMAP_HEIGHT }}
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
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={onClick} disabled={disabled}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
