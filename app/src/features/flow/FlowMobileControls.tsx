import { Focus, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Props {
  onZoomIn: () => void
  onZoomOut: () => void
  onFitView: () => void
  className?: string
}

/** スマホ向け: 大きなタッチターゲットのズーム操作 */
export function FlowMobileControls({ onZoomIn, onZoomOut, onFitView, className }: Props) {
  return (
    <div
      className={cn(
        "pointer-events-auto absolute left-2 top-2 z-50 flex flex-col gap-1 rounded-lg border border-border/80 bg-card/95 p-1 shadow-md backdrop-blur-sm",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-10"
        onClick={onZoomIn}
        aria-label="拡大"
      >
        <Plus className="size-5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-10"
        onClick={onZoomOut}
        aria-label="縮小"
      >
        <Minus className="size-5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-10"
        onClick={onFitView}
        aria-label="全体表示"
      >
        <Focus className="size-5" />
      </Button>
    </div>
  )
}
