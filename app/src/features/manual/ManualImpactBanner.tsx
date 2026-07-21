import { useState } from "react"
import { AlertTriangle, ChevronDown, GitCompareArrows, ListFilter } from "lucide-react"
import type { ManualSection, ManualSyncStatus } from "@/lib/types"
import {
  buildUnplacedCandidates,
  computeManualImpact,
  countManualReviewNeeded,
} from "@/lib/manual-impact"
import type { FlowState } from "@/lib/types"
import { WARNING_TEXT } from "@/lib/semantic-styles"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ImpactFilter = "all" | "needs_review" | "orphaned" | "unplaced"

export function ManualImpactBanner({
  sections,
  flow,
  filter,
  onFilterChange,
  onOpenRegen,
  isMobile,
}: {
  sections: ManualSection[]
  flow: FlowState
  filter: ImpactFilter
  onFilterChange: (f: ImpactFilter) => void
  onOpenRegen: () => void
  isMobile?: boolean
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const impact = computeManualImpact(flow, sections)
  const unplaced = buildUnplacedCandidates(flow, sections)
  const reviewCount = countManualReviewNeeded(sections) + unplaced.length
  if (reviewCount === 0 && impact.reviewCount === 0) return null

  const total =
    sections.filter((s) => {
      const st = s.syncStatus ?? "ok"
      return st === "needs_review" || st === "orphaned" || st === "unplaced"
    }).length + unplaced.length

  if (total === 0 && impact.addedStepIds.length === 0) return null

  const displayTotal = Math.max(total, impact.reviewCount)

  const filters: { id: ImpactFilter; label: string }[] = [
    { id: "all", label: "すべて" },
    { id: "needs_review", label: "要確認" },
    { id: "orphaned", label: "廃止候補" },
    { id: "unplaced", label: "未配置" },
  ]

  const filterActive = filter !== "all"

  return (
    <div
      className="rounded-lg border border-border/80 bg-background/90 px-3 py-3 shadow-sm md:px-4"
      role="region"
      aria-label="フロー連携の操作"
    >
      <div className={cn("flex gap-3", isMobile ? "flex-col" : "items-start justify-between")}>
        <div className="flex min-w-0 items-start gap-2">
          <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", WARNING_TEXT)} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              フロー変更の見直し候補が {displayTotal} 件あります
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              マニュアル本文は保護されています。下へスクロールすると本文を広く確認できます。
              {impact.addedStepIds.length > 0 && (
                <> 未配置の新規ステップ: {impact.addedStepIds.length} 件。</>
              )}
              {impact.removedStepIds.length > 0 && (
                <> 廃止候補: {impact.removedStepIds.length} 件。</>
              )}
            </p>
          </div>
        </div>
        <div className={cn("flex shrink-0 gap-2", isMobile && "w-full flex-col")}>
          <Button
            size={isMobile ? "default" : "sm"}
            className={cn("gap-1.5", isMobile && "h-10 w-full")}
            onClick={onOpenRegen}
          >
            <GitCompareArrows className="size-4" />
            フロー変更を反映…
          </Button>
          <Button
            type="button"
            variant="outline"
            size={isMobile ? "default" : "sm"}
            className={cn("gap-1.5", isMobile && "h-10 w-full")}
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            <ListFilter className="size-3.5" />
            絞り込み
            {filterActive && (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                適用中
              </span>
            )}
            <ChevronDown className={cn("size-3.5 transition-transform", filtersOpen && "rotate-180")} />
          </Button>
        </div>
      </div>

      {(filtersOpen || filterActive) && (
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto border-t border-border/60 pt-3 pb-0.5">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange(f.id)}
              className={cn(
                "shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
                filter === f.id
                  ? "border-primary/50 bg-primary-subtle text-foreground"
                  : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function sectionMatchesImpactFilter(
  section: ManualSection,
  filter: ImpactFilter,
): boolean {
  if (filter === "all") return true
  const st = (section.syncStatus ?? "ok") as ManualSyncStatus
  return st === filter
}
