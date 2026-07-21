import type { ManualSyncStatus } from "@/lib/types"
import { MANUAL_SYNC_LABEL } from "@/lib/types"
import { REVIEW_STATUS } from "@/lib/semantic-styles"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const SYNC_STYLE: Record<ManualSyncStatus, string> = {
  ok: REVIEW_STATUS.ok,
  needs_review: REVIEW_STATUS.needs_review,
  intentional_difference: REVIEW_STATUS.intentional_difference,
  orphaned: REVIEW_STATUS.orphaned,
  unplaced: REVIEW_STATUS.unplaced,
}

export function SyncStatusBadge({
  status,
  className,
}: {
  status?: ManualSyncStatus
  className?: string
}) {
  const resolved = status ?? "ok"
  if (resolved === "ok") return null
  return (
    <Badge
      variant="outline"
      className={cn("h-5 text-[10px]", SYNC_STYLE[resolved], className)}
    >
      {MANUAL_SYNC_LABEL[resolved]}
    </Badge>
  )
}
