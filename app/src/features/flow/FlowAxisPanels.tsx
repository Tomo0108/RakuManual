import { useState } from "react"
import { Check, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react"
import {
  COL_WIDTH,
  FLOW_ORIGIN_X,
  FLOW_ORIGIN_Y,
  LANE_ROW_HEIGHT,
  SYSTEM_ROW_HEIGHT,
  TEAM_LABEL_WIDTH,
  AXIS_HEADER_HEIGHT,
  flowToScreen,
  gridDimensions,
  computeLaneRowMetrics,
} from "./flow-layout"
import type { ColumnSystemEntry, FlowLayoutMeta, FlowNode } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface FlowViewport {
  x: number
  y: number
  zoom: number
}

/** 左パネル: 担当チーム行(フロー座標に追従・縦並びコネクタ時は行を伸長) */
export function TeamAxisPanel({
  lanes,
  nodes,
  viewport,
  activeLane,
  editable = false,
  onRenameLane,
  onAddLane,
  onDeleteLane,
}: {
  lanes: string[]
  nodes: FlowNode[]
  viewport: FlowViewport
  activeLane?: string
  editable?: boolean
  onRenameLane?: (index: number, name: string) => void
  onAddLane?: (name: string) => void
  onDeleteLane?: (index: number, moveToLane?: string) => void
}) {
  const rowMetrics = computeLaneRowMetrics(nodes, lanes)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState("")
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const [moveTo, setMoveTo] = useState("")

  const startRename = (index: number, current: string) => {
    if (!editable) return
    setEditingIndex(index)
    setDraft(current)
  }

  const commitRename = () => {
    if (editingIndex === null) return
    const name = draft.trim()
    if (name && name !== lanes[editingIndex]) onRenameLane?.(editingIndex, name)
    setEditingIndex(null)
  }

  const openDelete = (index: number) => {
    const others = lanes.filter((_, i) => i !== index)
    setMoveTo(others[0] ?? "")
    setDeleteIndex(index)
  }

  const confirmDelete = () => {
    if (deleteIndex === null) return
    const count = nodes.filter((n) => n.data.lane === lanes[deleteIndex]).length
    onDeleteLane?.(deleteIndex, count > 0 ? moveTo || undefined : undefined)
    setDeleteIndex(null)
  }

  const nodeCountInLane = (lane: string) => nodes.filter((n) => n.data.lane === lane).length

  return (
    <aside
      className="relative flex shrink-0 flex-col overflow-hidden border-r bg-card"
      style={{ width: TEAM_LABEL_WIDTH }}
    >
      <AxisHeader label="担当チーム" />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {lanes.map((lane, i) => {
          const metric = rowMetrics[i] ?? { top: FLOW_ORIGIN_Y + i * LANE_ROW_HEIGHT, height: LANE_ROW_HEIGHT }
          const screen = flowToScreen(0, metric.top, viewport)
          const rowH = metric.height * viewport.zoom
          const isActive = activeLane === lane
          const isEditing = editingIndex === i
          return (
            <div
              key={`${lane}-${i}`}
              className="group/lane absolute left-0 flex w-full items-center justify-center border-b px-1 text-center text-[11px] font-semibold leading-tight transition-colors"
              style={{
                top: screen.y,
                height: rowH,
                background: isActive
                  ? "color-mix(in oklch, var(--primary) 18%, var(--background))"
                  : i % 2 === 0
                    ? "var(--muted)"
                    : "var(--background)",
                opacity: isActive ? 1 : i % 2 === 0 ? 0.45 : 0.25,
                boxShadow: isActive ? "inset 3px 0 0 var(--primary)" : undefined,
              }}
              onDoubleClick={() => startRename(i, lane)}
            >
              {isEditing ? (
                <Input
                  value={draft}
                  autoFocus
                  className="h-7 px-1 text-[11px]"
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename()
                    if (e.key === "Escape") setEditingIndex(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="flex w-full flex-col items-center gap-0.5 px-0.5">
                  <span className={`line-clamp-3 ${isActive ? "text-primary" : ""}`}>{lane}</span>
                  {editable && (
                    <div className="flex gap-0.5 opacity-0 transition-opacity group-hover/lane:opacity-100">
                      <button
                        type="button"
                        className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                        aria-label={`${lane}を改名`}
                        onClick={(e) => {
                          e.stopPropagation()
                          startRename(i, lane)
                        }}
                      >
                        <Pencil className="size-2.5" />
                      </button>
                      {lanes.length > 1 && (
                        <button
                          type="button"
                          className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
                          aria-label={`${lane}を削除`}
                          onClick={(e) => {
                            e.stopPropagation()
                            openDelete(i)
                          }}
                        >
                          <Trash2 className="size-2.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {editable && (
        <div className="shrink-0 border-t p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-full gap-1 px-1 text-[10px]"
            onClick={() => {
              let n = 1
              let name = `担当チーム${n}`
              while (lanes.includes(name)) {
                n += 1
                name = `担当チーム${n}`
              }
              onAddLane?.(name)
            }}
          >
            <Plus className="size-3" />
            レーン追加
          </Button>
        </div>
      )}

      <Dialog open={deleteIndex !== null} onOpenChange={(open) => !open && setDeleteIndex(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>レーンを削除</DialogTitle>
            <DialogDescription>
              {deleteIndex !== null && nodeCountInLane(lanes[deleteIndex]) > 0
                ? `「${lanes[deleteIndex]}」には ${nodeCountInLane(lanes[deleteIndex])} 件のステップがあります。移動先レーンを選んでください。`
                : deleteIndex !== null
                  ? `「${lanes[deleteIndex]}」を削除します。`
                  : ""}
            </DialogDescription>
          </DialogHeader>
          {deleteIndex !== null && nodeCountInLane(lanes[deleteIndex]) > 0 && (
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="移動先レーン" />
              </SelectTrigger>
              <SelectContent>
                {lanes
                  .filter((_, i) => i !== deleteIndex)
                  .map((lane) => (
                    <SelectItem key={lane} value={lane}>
                      {lane}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteIndex(null)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={
                deleteIndex !== null &&
                nodeCountInLane(lanes[deleteIndex]) > 0 &&
                !moveTo
              }
            >
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}

/** フロー側ヘッダー(担当チームヘッダーと高さを揃える) */
export function FlowCanvasHeader({ className = "border-b" }: { className?: string }) {
  return <AxisHeader label="業務フロー" className={className} />
}

function AxisHeader({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-muted/50 text-[10px] font-semibold text-muted-foreground ${className}`}
      style={{ height: AXIS_HEADER_HEIGHT }}
    >
      {label}
    </div>
  )
}

/** 下パネル: 利用システム(列位置をフロー座標から算出・リンク編集可) */
export function SystemAxisPanel({
  columnSystems,
  viewport,
  onUpdateColumn,
  readOnly = false,
}: {
  columnSystems: ColumnSystemEntry[]
  viewport: FlowViewport
  onUpdateColumn?: (col: number, entry: ColumnSystemEntry) => void
  readOnly?: boolean
}) {
  const totalH = SYSTEM_ROW_HEIGHT + AXIS_HEADER_HEIGHT
  const columnCount = columnSystems.length
  return (
    <footer className="flex shrink-0 border-t bg-card" style={{ height: totalH }}>
      <div
        className="flex shrink-0 items-center justify-center border-r bg-muted/50 text-[10px] font-semibold text-muted-foreground"
        style={{ width: TEAM_LABEL_WIDTH, height: totalH }}
      >
        利用システム
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <ColumnBoundaryOverlay columnCount={columnCount} viewport={viewport} height={totalH} />
        {columnSystems.map((entry, col) => {
          const colLeft = FLOW_ORIGIN_X + col * COL_WIDTH
          const screen = flowToScreen(colLeft, 0, viewport)
          const colW = COL_WIDTH * viewport.zoom
          return (
            <SystemCell
              key={col}
              col={col}
              entry={entry}
              left={screen.x}
              width={colW}
              readOnly={readOnly}
              onSave={(next) => onUpdateColumn?.(col, next)}
            />
          )
        })}
      </div>
    </footer>
  )
}

/** スマホ向け: 利用システムをビューポートと同期し列を点線で区切る */
export function MobileSystemAxisPanel({
  columnSystems,
  viewport,
}: {
  columnSystems: ColumnSystemEntry[]
  viewport: FlowViewport
}) {
  const columnCount = columnSystems.length
  if (columnCount === 0) return null

  const totalH = SYSTEM_ROW_HEIGHT + AXIS_HEADER_HEIGHT

  return (
    <footer className="shrink-0 border-t bg-card" style={{ height: totalH }}>
      <AxisHeader label="利用システム" className="border-b" />
      <div className="relative overflow-hidden" style={{ height: SYSTEM_ROW_HEIGHT }}>
        <ColumnBoundaryOverlay columnCount={columnCount} viewport={viewport} height={SYSTEM_ROW_HEIGHT} />
        {columnSystems.map((entry, col) => {
          const colLeft = FLOW_ORIGIN_X + col * COL_WIDTH
          const screen = flowToScreen(colLeft, 0, viewport)
          const colW = COL_WIDTH * viewport.zoom
          return (
            <MobileSystemCell key={col} col={col} entry={entry} left={screen.x} width={colW} />
          )
        })}
      </div>
    </footer>
  )
}

/** 列境界の点線ガイド（ピンチズーム時もフロー列と同期） */
function ColumnBoundaryOverlay({
  columnCount,
  viewport,
  height,
}: {
  columnCount: number
  viewport: FlowViewport
  height: number
}) {
  if (columnCount === 0) return null

  return (
    <>
      {Array.from({ length: columnCount }, (_, col) => {
        const colLeft = FLOW_ORIGIN_X + col * COL_WIDTH
        const screen = flowToScreen(colLeft, 0, viewport)
        const colW = COL_WIDTH * viewport.zoom
        return (
          <div
            key={`col-zone-${col}`}
            className="pointer-events-none absolute top-0 border-x border-dashed border-primary/25 bg-primary/[0.03]"
            style={{ left: screen.x, width: colW, height }}
            aria-hidden
          />
        )
      })}
      {Array.from({ length: columnCount + 1 }, (_, col) => {
        const colLeft = FLOW_ORIGIN_X + col * COL_WIDTH
        const screen = flowToScreen(colLeft, 0, viewport)
        return (
          <div
            key={`col-line-${col}`}
            className="pointer-events-none absolute top-0 w-px border-l border-dashed border-primary/40"
            style={{ left: screen.x, height }}
            aria-hidden
          />
        )
      })}
    </>
  )
}

function MobileSystemCell({
  entry,
  left,
  width,
}: {
  col: number
  entry: ColumnSystemEntry
  left: number
  width: number
}) {
  const href = entry.url?.trim()
  const display = entry.label || "—"

  return (
    <div
      className="absolute top-0 flex items-center justify-center px-1 text-center text-[10px] leading-snug"
      style={{ left, width, height: SYSTEM_ROW_HEIGHT }}
    >
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-0.5 text-primary underline-offset-2 hover:underline"
          title={href}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="size-2.5 shrink-0" />
          <span className="line-clamp-2">{display}</span>
        </a>
      ) : (
        <span className="line-clamp-2 text-foreground" title={display}>
          {display}
        </span>
      )}
    </div>
  )
}

/** スマホ向け: 担当チーム行ラベル（右端・ビューポート同期） */
export function MobileTeamAxis({
  lanes,
  nodes,
  viewport,
  activeLane,
  visible,
}: {
  lanes: string[]
  nodes: FlowNode[]
  viewport: FlowViewport
  activeLane?: string
  visible: boolean
}) {
  const rowMetrics = computeLaneRowMetrics(nodes, lanes)
  const labelWidth = Math.max(48, ...lanes.map((lane) => lane.length * 10 + 20))

  return (
    <div
      className={`pointer-events-none absolute inset-y-0 right-0 z-30 overflow-hidden transition-opacity duration-500 ease-in-out ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ width: labelWidth }}
      aria-hidden={!visible}
    >
      {lanes.map((lane, i) => {
        const metric = rowMetrics[i] ?? { top: FLOW_ORIGIN_Y + i * LANE_ROW_HEIGHT, height: LANE_ROW_HEIGHT }
        const screen = flowToScreen(0, metric.top, viewport)
        const rowH = metric.height * viewport.zoom
        const isActive = activeLane === lane
        if (rowH < 14) return null
        return (
          <div
            key={`${lane}-${i}`}
            className={`absolute right-1 flex items-center justify-end rounded-l-md border-y border-l px-1.5 py-0.5 text-right text-[9px] font-semibold leading-tight shadow-xs ${
              isActive
                ? "border-primary/50 bg-primary-subtle/95 text-primary"
                : "border-border/60 bg-background/85 text-muted-foreground"
            }`}
            style={{ top: screen.y, height: rowH, minHeight: 20, width: labelWidth - 4 }}
          >
            <span className="line-clamp-3 whitespace-nowrap">{lane}</span>
          </div>
        )
      })}
    </div>
  )
}

function SystemCell({
  col,
  entry,
  left,
  width,
  readOnly,
  onSave,
}: {
  col: number
  entry: ColumnSystemEntry
  left: number
  width: number
  readOnly: boolean
  onSave: (entry: ColumnSystemEntry) => void
}) {
  const [open, setOpen] = useState(false)
  const [draftLabel, setDraftLabel] = useState(entry.label)
  const [draftUrl, setDraftUrl] = useState(entry.url ?? "")

  const openEdit = () => {
    if (readOnly) return
    setDraftLabel(entry.label)
    setDraftUrl(entry.url ?? "")
    setOpen(true)
  }

  const save = () => {
    onSave({
      label: draftLabel.trim() || "—",
      url: draftUrl.trim() || undefined,
    })
    setOpen(false)
  }

  const href = entry.url?.trim()
  const display = entry.label || "—"

  return (
    <div
      className="group absolute top-0 flex items-center justify-center border-r bg-muted/25 px-1.5 text-center text-[10px] leading-snug"
      style={{
        left,
        width,
        height: SYSTEM_ROW_HEIGHT,
        marginTop: (SYSTEM_ROW_HEIGHT + AXIS_HEADER_HEIGHT - SYSTEM_ROW_HEIGHT) / 2,
      }}
    >
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-0.5 text-primary underline-offset-2 hover:underline"
          title={href}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="size-2.5 shrink-0" />
          <span className="line-clamp-2">{display}</span>
        </a>
      ) : (
        <span className="line-clamp-2 text-foreground" title={display}>
          {display}
        </span>
      )}

      {!readOnly && (
        <>
          <button
            type="button"
            className="absolute right-0.5 top-0.5 rounded p-0.5 opacity-0 transition-opacity hover:bg-background group-hover:opacity-100"
            aria-label={`列${col + 1}の利用システムを編集`}
            onClick={openEdit}
          >
            <Pencil className="size-2.5 text-muted-foreground" />
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-sm">利用システム(列 {col + 1})</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Input
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  placeholder="システム名"
                  className="h-9 text-sm"
                />
                <Input
                  value={draftUrl}
                  onChange={(e) => setDraftUrl(e.target.value)}
                  placeholder="https://… (リンクURL・任意)"
                  className="h-9 text-sm"
                />
              </div>
              <DialogFooter>
                <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                  キャンセル
                </Button>
                <Button size="sm" className="gap-1" onClick={save}>
                  <Check className="size-3.5" />
                  保存
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}

/** フローキャンバス内: 行・列ガイド */
export function LaneGuideOverlay({
  lanes,
  nodes,
  layoutMeta,
}: {
  lanes: string[]
  nodes: FlowNode[]
  layoutMeta?: FlowLayoutMeta
}) {
  const columnCount = layoutMeta?.columnCount ?? 1
  const { width } = gridDimensions(lanes.length, columnCount)
  const guideW = width - FLOW_ORIGIN_X
  const rowMetrics = computeLaneRowMetrics(nodes, lanes)
  const guideH =
    rowMetrics.length > 0
      ? Math.max(...rowMetrics.map((m) => m.top + m.height)) - FLOW_ORIGIN_Y + 8
      : lanes.length * LANE_ROW_HEIGHT + 8

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      style={{
        width: guideW + FLOW_ORIGIN_X,
        height: FLOW_ORIGIN_Y + guideH,
        overflow: "visible",
      }}
    >
      <g transform={`translate(${FLOW_ORIGIN_X}, ${FLOW_ORIGIN_Y})`}>
        {rowMetrics.map((metric, i) => (
          <rect
            key={`row-${i}`}
            x={0}
            y={metric.top - FLOW_ORIGIN_Y}
            width={guideW}
            height={metric.height}
            fill={i % 2 === 0 ? "var(--muted)" : "transparent"}
            fillOpacity={i % 2 === 0 ? 0.35 : 0}
          />
        ))}
        {Array.from({ length: columnCount }, (_, col) => (
          <rect
            key={`col-zone-${col}`}
            x={col * COL_WIDTH}
            y={0}
            width={COL_WIDTH}
            height={guideH}
            fill="var(--primary)"
            fillOpacity={0.04}
            stroke="var(--primary)"
            strokeWidth={1}
            strokeDasharray="6 5"
            strokeOpacity={0.28}
          />
        ))}
        {Array.from({ length: columnCount + 1 }, (_, col) => (
          <line
            key={`col-${col}`}
            x1={col * COL_WIDTH}
            y1={0}
            x2={col * COL_WIDTH}
            y2={guideH}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="4 6"
            opacity={0.45}
          />
        ))}
        {rowMetrics.map((metric, i) => (
          <line
            key={`hline-${i}`}
            x1={0}
            y1={metric.top - FLOW_ORIGIN_Y}
            x2={guideW}
            y2={metric.top - FLOW_ORIGIN_Y}
            stroke="var(--border)"
            strokeWidth={1}
            opacity={0.55}
          />
        ))}
      </g>
    </svg>
  )
}
