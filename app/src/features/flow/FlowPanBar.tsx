import { useCallback, useRef } from "react"
import { MoveHorizontal } from "lucide-react"
import type { FlowViewport } from "./FlowAxisPanels"

interface Props {
  viewport: FlowViewport
  contentWidth: number
  viewWidth: number
  panMinX: number
  panMaxX: number
  onPanX: (x: number) => void
}

/** フロー図の水平パン用バー */
export function FlowPanBar({ viewport, contentWidth, viewWidth, panMinX, panMaxX, onPanX }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startVpX: number } | null>(null)

  const zoom = viewport.zoom
  const scaledW = contentWidth * zoom
  const trackW = Math.max(1, viewWidth - 48)
  const thumbW = Math.max(48, Math.min(trackW, (viewWidth / scaledW) * trackW))
  const panRange = panMaxX - panMinX
  const thumbLeft =
    panRange <= 0 ? (trackW - thumbW) / 2 : ((viewport.x - panMinX) / panRange) * (trackW - thumbW)

  const panFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track || panRange <= 0) return
      const rect = track.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left - thumbW / 2) / (rect.width - thumbW)))
      onPanX(panMinX + ratio * panRange)
    },
    [onPanX, panMinX, panRange, thumbW],
  )

  const onThumbDown = (e: React.PointerEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startVpX: viewport.x }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onThumbMove = (e: React.PointerEvent) => {
    if (!dragRef.current || panRange <= 0) return
    const dx = e.clientX - dragRef.current.startX
    const track = trackRef.current
    if (!track) return
    const ratio = dx / (track.clientWidth - thumbW)
    const nextX = dragRef.current.startVpX + ratio * panRange
    onPanX(Math.max(panMinX, Math.min(panMaxX, nextX)))
  }

  const onThumbUp = (e: React.PointerEvent) => {
    dragRef.current = null
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
  }

  const onTrackDown = (e: React.PointerEvent) => {
    if (e.target !== trackRef.current) return
    panFromClientX(e.clientX)
  }

  if (viewWidth < 80 || panRange <= 0) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-t bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground md:py-1.5">
        <MoveHorizontal className="size-3.5 shrink-0" />
        <span>全体が表示されています</span>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-t bg-muted/40 px-3 py-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] md:py-2">
      <MoveHorizontal className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div
        ref={trackRef}
        className="relative h-4 min-w-0 flex-1 cursor-pointer rounded-full bg-muted touch-none md:h-2"
        onPointerDown={onTrackDown}
        role="scrollbar"
        aria-label="フロー図を移動"
        aria-valuemin={0}
        aria-valuemax={panRange}
        aria-valuenow={viewport.x - panMinX}
      >
        <div
          className="absolute top-1/2 h-7 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-primary/40 bg-primary/30 active:cursor-grabbing md:h-full md:translate-y-0 md:border md:border-primary/30 md:bg-primary/25"
          style={{ width: thumbW, left: thumbLeft }}
          onPointerDown={onThumbDown}
          onPointerMove={onThumbMove}
          onPointerUp={onThumbUp}
          onPointerCancel={onThumbUp}
        />
      </div>
    </div>
  )
}
