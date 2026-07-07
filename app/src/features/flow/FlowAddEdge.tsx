import { memo } from "react"
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react"
import { Plus } from "lucide-react"
import type { FlowEdge } from "@/lib/types"
import { getFlowInteractionContext } from "./flow-interaction-context"
import { cn } from "@/lib/utils"

type FlowAddEdgeData = {
  pathOptions?: { offset?: number; borderRadius?: number }
  showAdd?: boolean
}

export const FlowAddEdge = memo(function FlowAddEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  data,
}: EdgeProps<FlowEdge>) {
  const edgeData = (data ?? {}) as FlowAddEdgeData
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: edgeData.pathOptions?.borderRadius ?? 12,
    offset: edgeData.pathOptions?.offset,
  })

  const { locked, onRequestInsert } = getFlowInteractionContext()
  const showAdd = edgeData.showAdd !== false && !locked

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
        label={label}
        labelStyle={labelStyle}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
      />
      {showAdd && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <button
              type="button"
              className={cn(
                "flex size-6 items-center justify-center rounded-full border-2 border-primary bg-background text-primary shadow-sm",
                "opacity-50 transition-all hover:scale-110 hover:bg-primary hover:text-primary-foreground hover:opacity-100",
              )}
              aria-label="この位置にコネクタを追加"
              onClick={(e) => {
                e.stopPropagation()
                onRequestInsert(
                  { mode: "between", sourceId: source, targetId: target },
                  { x: e.clientX, y: e.clientY },
                )
              }}
            >
              <Plus className="size-3.5" strokeWidth={2.5} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
