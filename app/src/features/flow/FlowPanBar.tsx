import { useCallback, useRef } from "react"
import { MoveHorizontal } from "lucide-react"
import type { FlowViewport } from "./FlowAxisPanels"

interface Props {
  viewport: FlowViewport
  contentWidth: number
  viewWidth: number
  onPanX: (x: number) => void
}

/** フロー図の水平パン用バー */
export function FlowPanBar({ viewport, contentWidth, viewWidth, onPanX }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startVpX: number } | null>(null)

  const zoom = viewport.zoom
  const scaledW = contentWidth * zoom
  const trackW = Math.max(1, viewWidth - 48)
  const thumbW = Math.max(48, Math.min(trackW, (viewWidth / scaledW) * trackW))
  const maxPan = Math.max(0, scaledW - viewWidth)
  const thumbLeft =
    maxPan <= 0 ? (trackW - thumbW) / 2 : ((-viewport.x / maxPan) * (trackW - thumbW))

  const panFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track || maxPan <= 0) return
      const rect = track.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left - thumbW / 2) / (rect.width - thumbW)))
      onPanX(-ratio * maxPan)
    },
    [maxPan, onPanX, thumbW],
  )

  const onThumbDown = (e: React.PointerEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startVpX: viewport.x }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onThumbMove = (e: React.PointerEvent) => {
    if (!dragRef.current || maxPan <= 0) return
    const dx = e.clientX - dragRef.current.startX
    const track = trackRef.current
    if (!track) return
    const ratio = dx / (track.clientWidth - thumbW)
    onPanX(dragRef.current.startVpX - ratio * maxPan)
  }

  const onThumbUp = (e: React.PointerEvent) => {
    dragRef.current = null
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
  }

  const onTrackDown = (e: React.PointerEvent) => {
    if (e.target !== trackRef.current) return
    panFromClientX(e.clientX)
  }

  if (viewWidth < 80 || scaledW <= viewWidth) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-t bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
        <MoveHorizontal className="size-3.5 shrink-0" />
        <span>全体が表示されています</span>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-t bg-muted/30 px-3 py-2">
      <MoveHorizontal className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div
        ref={trackRef}
        className="relative h-2 min-w-0 flex-1 cursor-pointer rounded-full bg-muted"
        onPointerDown={onTrackDown}
        role="scrollbar"
        aria-label="フロー図を左右に移動"
        aria-valuemin={0}
        aria-valuemax={maxPan}
        aria-valuenow={Math.abs(viewport.x)}
      >
        <div
          className="absolute top-0 h-full cursor-grab rounded-full border border-primary/30 bg-primary/25 active:cursor-grabbing"
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
