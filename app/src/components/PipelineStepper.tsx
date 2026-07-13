import { Check, MessagesSquare, Workflow, ListChecks, BookCheck, Share2 } from "lucide-react"
import type { Project, ProjectStatus, ProjectTab } from "@/lib/types"
import { cn } from "@/lib/utils"

const STEPS: { tab: ProjectTab; label: string; shortLabel: string; icon: typeof MessagesSquare; status: ProjectStatus }[] = [
  { tab: "hearing", label: "骨組み", shortLabel: "骨組み", icon: MessagesSquare, status: "hearing" },
  { tab: "flow", label: "フロー図", shortLabel: "フロー", icon: Workflow, status: "flow" },
  { tab: "deepdive", label: "深掘り", shortLabel: "深掘り", icon: ListChecks, status: "deepdive" },
  { tab: "manual", label: "マニュアル", shortLabel: "マニュアル", icon: BookCheck, status: "manual" },
  { tab: "export", label: "出力", shortLabel: "出力", icon: Share2, status: "published" },
]

const STATUS_ORDER: ProjectStatus[] = ["hearing", "flow", "deepdive", "manual", "published"]

function stepState(project: Project, status: ProjectStatus): "done" | "current" | "upcoming" {
  const currentIdx = STATUS_ORDER.indexOf(project.status)
  const stepIdx = STATUS_ORDER.indexOf(status)
  if (stepIdx < currentIdx) return "done"
  if (stepIdx === currentIdx) return "current"
  return "upcoming"
}

interface Props {
  project: Project
  activeTab: ProjectTab
  onSelect: (tab: ProjectTab) => void
  compact?: boolean
}

export function PipelineStepper({ project, activeTab, onSelect, compact }: Props) {
  return (
    <nav aria-label="作成パイプライン" className="w-full">
      <ol className="flex items-center">
        {STEPS.map((step, i) => {
          const state = stepState(project, step.status)
          const isActive = activeTab === step.tab
          const Icon = step.icon
          const prevDone = i > 0 && stepState(project, STEPS[i - 1].status) === "done"
          return (
            <li key={step.tab} className="flex min-w-0 flex-1 items-center">
              {i > 0 && (
                <div
                  className={cn(
                    "mx-0.5 h-0.5 min-w-2 flex-1 rounded-full md:mx-1",
                    prevDone || state === "done" || state === "current" ? "bg-primary/45" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
              <button
                type="button"
                onClick={() => onSelect(step.tab)}
                className={cn(
                  "group flex min-w-0 flex-col items-center gap-1.5 rounded-lg px-1 py-2 transition-colors",
                  "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive && "bg-primary-subtle",
                )}
                aria-current={isActive ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors md:size-8",
                    state === "done" && "border-primary bg-primary text-primary-foreground",
                    state === "current" && "border-primary bg-primary-subtle text-primary",
                    state === "upcoming" && "border-border bg-background text-muted-foreground",
                    isActive && state !== "done" && "ring-2 ring-primary/25",
                  )}
                >
                  {state === "done" ? (
                    <Check className="size-3.5 md:size-4" aria-hidden />
                  ) : (
                    <Icon className="size-3.5 md:size-4" aria-hidden />
                  )}
                </span>
                <span
                  className={cn(
                    "w-full truncate text-center text-[10px] font-medium leading-tight md:text-[11px]",
                    isActive ? "text-primary" : state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {compact ? step.shortLabel : step.label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
