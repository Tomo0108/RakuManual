import { AlertTriangle } from "lucide-react"
import type { Project } from "@/lib/types"
import { countHearingStaleSections } from "@/lib/manual-hearing-sync"
import { WARNING_TEXT } from "@/lib/semantic-styles"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** 骨組みヒアリング変更に伴うマニュアル要確認 */
export function HearingStaleBanner({
  project,
  onShowStaleSections,
  isMobile,
}: {
  project: Project
  onShowStaleSections: () => void
  isMobile?: boolean
}) {
  const count = countHearingStaleSections(project)
  if (count === 0) return null

  return (
    <div
      className="mt-3 rounded-lg border border-border/80 bg-background/90 px-3 py-3 shadow-sm md:px-4"
      role="region"
      aria-label="骨組みヒアリング変更の通知"
    >
      <div className={cn("flex gap-3", isMobile ? "flex-col" : "items-start justify-between")}>
        <div className="flex min-w-0 items-start gap-2">
          <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", WARNING_TEXT)} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">骨組みヒアリングの変更が {count} 件あります</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              フロー図の見直しと、該当セクションの確認が必要です。内容が問題なければ「骨組みを反映済み」でそのまま残せます。
            </p>
          </div>
        </div>
        <Button
          size={isMobile ? "default" : "sm"}
          variant="outline"
          className={cn("shrink-0", isMobile && "h-10 w-full")}
          onClick={onShowStaleSections}
        >
          要確認セクションを表示
        </Button>
      </div>
    </div>
  )
}
