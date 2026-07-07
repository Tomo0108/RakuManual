import { memo, useEffect, useRef, useState } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { CircleDot, Flag, Hand, Info, Plus } from "lucide-react"
import type { FlowNode, StepKind } from "@/lib/types"
import { NODE_DIMS } from "./flow-layout"
import { getFlowInteractionContext } from "./flow-interaction-context"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const KIND_LABEL: Record<StepKind, string> = {
  start: "開始",
  end: "終了",
  process: "処理",
  decision: "分岐",
}

export interface StepNodeContext {
  lanes: string[]
  onRename: (id: string, label: string) => void
  locked?: boolean
}

let ctx: StepNodeContext = { lanes: [], onRename: () => {} }
export function setStepNodeContext(next: StepNodeContext) {
  ctx = next
}

const handleClass =
  "!size-2.5 !border-2 !border-background !bg-primary hover:!scale-110 hover:!bg-primary"

/** 上下左右の入出力ハンドル */
function FourWayHandles({
  targets = true,
  sources = true,
  hideTargetSides = [],
  hideSourceSides = [],
  rightSources,
}: {
  targets?: boolean
  sources?: boolean
  hideTargetSides?: Position[]
  hideSourceSides?: Position[]
  rightSources?: { id: string; top: string }[]
}) {
  const sides: { position: Position; targetId: string; sourceId: string }[] = [
    { position: Position.Top, targetId: "top-in", sourceId: "top-out" },
    { position: Position.Right, targetId: "right-in", sourceId: "right-out" },
    { position: Position.Bottom, targetId: "bottom-in", sourceId: "bottom-out" },
    { position: Position.Left, targetId: "left", sourceId: "left-out" },
  ]

  return (
    <>
      {sides.map(({ position, targetId, sourceId }) => (
        <span key={position}>
          {targets && !hideTargetSides.includes(position) && (
            <Handle type="target" position={position} id={targetId} className={handleClass} />
          )}
          {sources &&
            !hideSourceSides.includes(position) &&
            position === Position.Right &&
            rightSources?.map((h) => (
              <Handle
                key={h.id}
                type="source"
                position={Position.Right}
                id={h.id}
                className={handleClass}
                style={{ top: h.top }}
              />
            ))}
          {sources &&
            !hideSourceSides.includes(position) &&
            !(position === Position.Right && rightSources) && (
              <Handle type="source" position={position} id={sourceId} className={handleClass} />
            )}
        </span>
      ))}
    </>
  )
}

export const StepNode = memo(function StepNode({ id, data, selected }: NodeProps<FlowNode>) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.label)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const kind = data.kind
  const dims = NODE_DIMS[kind === "start" || kind === "end" || kind === "decision" ? kind : "process"]

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commit = () => {
    setEditing(false)
    if (draft.trim() && draft !== data.label) ctx.onRename(id, draft.trim())
    else setDraft(data.label)
  }

  const startEdit = (e: React.MouseEvent) => {
    if (ctx.locked) return
    e.stopPropagation()
    setDraft(data.label)
    setEditing(true)
  }

  const diffClass =
    data.diff === "add"
      ? "!border-emerald-400 !bg-emerald-50 border-dashed"
      : data.diff === "remove"
        ? "!border-red-300 !bg-red-50 opacity-60 line-through"
        : data.diff === "change"
          ? "!border-amber-400 !bg-amber-50 border-dashed"
          : ""

  const addAfterButton =
    !ctx.locked && kind !== "end" ? (
      <button
        type="button"
        className={cn(
          "nodrag nopan absolute top-1/2 -right-3 z-30 flex size-5 -translate-y-1/2 items-center justify-center",
          "rounded-full border-2 border-primary bg-background text-primary shadow-sm",
          "opacity-0 transition-all group-hover/step:opacity-100 hover:scale-110 hover:bg-primary hover:text-primary-foreground",
          selected && "opacity-100",
        )}
        aria-label="この後にコネクタを追加"
        onClick={(e) => {
          e.stopPropagation()
          getFlowInteractionContext().onRequestInsert(
            { mode: "after", nodeId: id, targetKind: kind },
            { x: e.clientX, y: e.clientY },
          )
        }}
      >
        <Plus className="size-3" strokeWidth={2.5} />
      </button>
    ) : null

  const labelBlock = editing ? (
    <textarea
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault()
          commit()
        }
        if (e.key === "Escape") {
          setDraft(data.label)
          setEditing(false)
        }
      }}
      className="nodrag w-full resize-none rounded border border-primary/40 bg-background px-1 py-0.5 text-xs leading-snug outline-none"
      rows={2}
    />
  ) : (
    <div className="text-xs leading-snug font-medium">{data.label}</div>
  )

  const sourceHint = data.source && !editing && (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="mt-0.5 flex cursor-help items-center gap-0.5 text-[9px] text-muted-foreground">
          <Info className="size-2 shrink-0" />
          <span className="truncate">{data.source.split(":")[0]}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-52 text-xs">
        ヒアリング回答「{data.source}」から生成
      </TooltipContent>
    </Tooltip>
  )

  if (kind === "start") {
    return (
      <div className="group/step relative" style={{ width: dims.w }} onDoubleClick={startEdit}>
        <FourWayHandles targets={false} />
        {addAfterButton}
        <div
          className={cn(
            "flex flex-col items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-50 px-2 py-1.5 shadow-sm",
            selected && "ring-2 ring-primary ring-offset-1",
            diffClass,
          )}
          style={{ minHeight: dims.h }}
        >
          <KindBadge kind={kind} />
          {labelBlock}
        </div>
      </div>
    )
  }

  if (kind === "end") {
    return (
      <div className="relative" style={{ width: dims.w }} onDoubleClick={startEdit}>
        <FourWayHandles sources={false} />
        <div
          className={cn(
            "flex flex-col items-center justify-center rounded-full border-2 border-rose-400 bg-rose-50 px-2 py-1.5 shadow-sm",
            selected && "ring-2 ring-primary ring-offset-1",
            diffClass,
          )}
          style={{ minHeight: dims.h }}
        >
          <KindBadge kind={kind} />
          {labelBlock}
        </div>
      </div>
    )
  }

  if (kind === "decision") {
    return (
      <div
        className="group/step relative flex items-center justify-center"
        style={{ width: dims.w, height: dims.h }}
        onDoubleClick={startEdit}
      >
        {addAfterButton}
        <FourWayHandles sources={false} />
        <Handle
          type="source"
          position={Position.Right}
          id="yes"
          className={handleClass}
          style={{ top: "50%", zIndex: 40 }}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="no"
          className={handleClass}
          style={{ left: "50%", zIndex: 40 }}
        />
        <span className="pointer-events-none absolute -right-10 top-1/2 z-30 -translate-y-1/2 rounded border border-primary/40 bg-background/95 px-1.5 py-0.5 text-[9px] font-semibold text-primary shadow-xs">
          はい
        </span>
        <span className="pointer-events-none absolute bottom-[-1.35rem] left-1/2 z-30 -translate-x-1/2 rounded border border-rose-300 bg-background/95 px-1.5 py-0.5 text-[9px] font-semibold text-rose-600 shadow-xs">
          いいえ
        </span>
        <svg
          className="absolute inset-0 overflow-visible"
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          aria-hidden
        >
          <polygon
            points={`${dims.w / 2},1 ${dims.w - 1},${dims.h / 2} ${dims.w / 2},${dims.h - 1} 1,${dims.h / 2}`}
            className={cn(
              "fill-amber-50/90 stroke-amber-500",
              selected && "stroke-primary",
              diffClass.includes("emerald") && "fill-emerald-50 stroke-emerald-400",
              diffClass.includes("red") && "fill-red-50 stroke-red-300",
              diffClass.includes("amber") && "fill-amber-50 stroke-amber-400",
            )}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="relative z-10 max-w-[90px] px-1 text-center">
          {data.sectionNumber && (
            <div className="mb-0.5 text-[9px] font-bold tabular-nums text-primary">{data.sectionNumber}</div>
          )}
          <KindBadge kind={kind} />
          {labelBlock}
        </div>
      </div>
    )
  }

  return (
    <div className="group/step relative" style={{ width: dims.w }} onDoubleClick={startEdit}>
      <FourWayHandles />
      {addAfterButton}
      <div
        className={cn(
          "rounded-md border-2 border-slate-300 bg-card px-2.5 py-1.5 shadow-sm",
          selected && "border-primary shadow-md ring-2 ring-primary/20",
          diffClass,
        )}
        style={{ minHeight: dims.h }}
      >
        <div className="mb-0.5 flex flex-wrap items-center gap-1">
          {data.sectionNumber && (
            <span className="rounded bg-primary/15 px-1 py-px text-[9px] font-bold tabular-nums text-primary">
              {data.sectionNumber}
            </span>
          )}
          <KindBadge kind={kind} />
          {data.manual && <ManualBadge />}
        </div>
        {labelBlock}
        {sourceHint}
      </div>
    </div>
  )
})

function KindBadge({ kind }: { kind: StepKind }) {
  const styles: Record<StepKind, string> = {
    start: "text-emerald-700 bg-emerald-100/80",
    end: "text-rose-700 bg-rose-100/80",
    process: "text-slate-600 bg-slate-100/80",
    decision: "text-amber-800 bg-amber-100/80",
  }
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded px-1 py-px text-[8px] font-bold uppercase tracking-wide", styles[kind])}>
      {kind === "start" && <Flag className="size-2" />}
      {kind === "end" && <CircleDot className="size-2" />}
      {KIND_LABEL[kind]}
    </span>
  )
}

function ManualBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-px text-[8px] font-medium text-primary">
          <Hand className="size-2" />
          手動
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">手動修正済み(再生成で保護)</TooltipContent>
    </Tooltip>
  )
}
