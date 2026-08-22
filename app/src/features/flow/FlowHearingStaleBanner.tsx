import { AlertTriangle, RefreshCw } from "lucide-react"
import type { Project } from "@/lib/types"
import { isFlowHearingStale } from "@/lib/manual-hearing-sync"
import { WARNING_TEXT } from "@/lib/semantic-styles"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** 骨組みヒアリング変更に伴うフロー図の見直し促し */
export function FlowHearingStaleBanner({
  project,
  onRegenerate,
  regenerating,
  isMobile,
}: {
  project: Project
  onRegenerate: () => void
  regenerating?: boolean
  isMobile?: boolean
}) {
  if (!isFlowHearingStale(project)) return null

  return (
    <div
      className="flex shrink-0 items-start gap-2 border-b border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-bg)] px-3 py-2.5 md:px-4"
      role="region"
      aria-label="骨組みヒアリング変更の通知"
    >
      <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", WARNING_TEXT)} />
      <div className={cn("min-w-0 flex-1", isMobile ? "space-y-2" : "flex items-center justify-between gap-3")}>
        <p className="text-xs leading-relaxed md:text-[13px]">
          骨組みヒアリングの回答が変わりました。フロー図が古くなっている可能性があります。
        </p>
        <Button
          size="sm"
          variant="outline"
          className={cn("shrink-0 gap-1", isMobile && "h-9 w-full")}
          onClick={onRegenerate}
          disabled={regenerating}
        >
          <RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} />
          フロー図を再生成
        </Button>
      </div>
    </div>
  )
}
