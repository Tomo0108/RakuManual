import { useState } from "react"
import { Check, ExternalLink, Pencil } from "lucide-react"
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
} from "./flow-layout"
import type { ColumnSystemEntry, FlowLayoutMeta } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface FlowViewport {
  x: number
  y: number
  zoom: number
}

/** 左パネル: 担当チーム行(フロー座標に追従) */
export function TeamAxisPanel({
  lanes,
  viewport,
  activeLane,
}: {
  lanes: string[]
  viewport: FlowViewport
  activeLane?: string
}) {
  return (
    <aside
      className="relative flex shrink-0 flex-col overflow-hidden border-r bg-card"
      style={{ width: TEAM_LABEL_WIDTH }}
    >
      <AxisHeader label="担当チーム" />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {lanes.map((lane, i) => {
          const rowTop = FLOW_ORIGIN_Y + i * LANE_ROW_HEIGHT
          const screen = flowToScreen(0, rowTop, viewport)
          const rowH = LANE_ROW_HEIGHT * viewport.zoom
          const isActive = activeLane === lane
          return (
            <div
              key={`${lane}-${i}`}
              className="absolute left-0 flex w-full items-center justify-center border-b px-1 text-center text-[11px] font-semibold leading-tight transition-colors"
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
            >
              <span className={`line-clamp-3 px-0.5 ${isActive ? "text-primary" : ""}`}>{lane}</span>
            </div>
          )
        })}
      </div>
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
  return (
    <footer className="flex shrink-0 border-t bg-card" style={{ height: totalH }}>
      <div
        className="flex shrink-0 items-center justify-center border-r bg-muted/50 text-[10px] font-semibold text-muted-foreground"
        style={{ width: TEAM_LABEL_WIDTH, height: totalH }}
      >
        利用システム
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden">
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
  layoutMeta,
}: {
  lanes: string[]
  layoutMeta?: FlowLayoutMeta
}) {
  const columnCount = layoutMeta?.columnCount ?? 1
  const { width } = gridDimensions(lanes.length, columnCount)
  const guideW = width - FLOW_ORIGIN_X

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      style={{
        width: guideW + FLOW_ORIGIN_X,
        height: FLOW_ORIGIN_Y + lanes.length * LANE_ROW_HEIGHT + 8,
        overflow: "visible",
      }}
    >
      <g transform={`translate(${FLOW_ORIGIN_X}, ${FLOW_ORIGIN_Y})`}>
        {lanes.map((_, i) => (
          <rect
            key={`row-${i}`}
            x={0}
            y={i * LANE_ROW_HEIGHT}
            width={guideW}
            height={LANE_ROW_HEIGHT}
            fill={i % 2 === 0 ? "var(--muted)" : "transparent"}
            fillOpacity={i % 2 === 0 ? 0.35 : 0}
          />
        ))}
        {Array.from({ length: columnCount + 1 }, (_, col) => (
          <line
            key={`col-${col}`}
            x1={col * COL_WIDTH}
            y1={0}
            x2={col * COL_WIDTH}
            y2={lanes.length * LANE_ROW_HEIGHT}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="4 6"
            opacity={0.45}
          />
        ))}
        {lanes.map((_, i) => (
          <line
            key={`hline-${i}`}
            x1={0}
            y1={i * LANE_ROW_HEIGHT}
            x2={guideW}
            y2={i * LANE_ROW_HEIGHT}
            stroke="var(--border)"
            strokeWidth={1}
            opacity={0.55}
          />
        ))}
      </g>
    </svg>
  )
}
