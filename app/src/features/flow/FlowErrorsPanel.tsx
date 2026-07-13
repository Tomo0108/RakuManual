import { AlertTriangle, CircleAlert, X } from "lucide-react"
import type { FlowIssue } from "./flow-validation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Props {
  issues: FlowIssue[]
  onFocusIssue: (issue: FlowIssue) => void
  onClose?: () => void
  className?: string
}

export function FlowErrorsPanel({ issues, onFocusIssue, onClose, className }: Props) {
  if (issues.length === 0) return null

  const errors = issues.filter((i) => i.severity === "error")
  const warnings = issues.filter((i) => i.severity === "warning")

  return (
    <div
      className={cn(
        "flex max-h-56 w-72 flex-col overflow-hidden rounded-lg border border-destructive/30 bg-background shadow-lg",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b bg-destructive/5 px-3 py-2">
        <CircleAlert className="size-3.5 shrink-0 text-destructive" />
        <span className="flex-1 text-xs font-semibold">
          フローの問題
          <span className="ml-1.5 font-normal text-muted-foreground">
            エラー {errors.length} / 警告 {warnings.length}
          </span>
        </span>
        {onClose && (
          <Button variant="ghost" size="icon" className="size-6" onClick={onClose} aria-label="閉じる">
            <X className="size-3.5" />
          </Button>
        )}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {issues.map((issue) => (
          <li key={issue.id}>
            <button
              type="button"
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[11px] leading-snug transition-colors hover:bg-muted",
                issue.severity === "error" ? "text-destructive" : "text-amber-700",
              )}
              onClick={() => onFocusIssue(issue)}
            >
              {issue.severity === "error" ? (
                <CircleAlert className="mt-0.5 size-3 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              )}
              <span>{issue.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
