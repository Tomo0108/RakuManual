import { Check } from "lucide-react"
import type { ProjectStatus, ProjectTab } from "@/lib/types"
import { cn } from "@/lib/utils"
import { TabScrollContainer } from "@/components/TabScrollContainer"

/** 作成パイプライン上の工程(概要は別扱い) */
const PROCESS_STEPS: { id: ProjectTab; label: string; statuses: ProjectStatus[] }[] = [
  { id: "hearing", label: "骨組みヒアリング", statuses: ["hearing"] },
  { id: "flow", label: "フロー図", statuses: ["flow"] },
  { id: "deepdive", label: "深掘りヒアリング", statuses: ["deepdive"] },
  { id: "manual", label: "マニュアル", statuses: ["manual"] },
  { id: "export", label: "出力・活用", statuses: ["published"] },
]

function stepIndexForStatus(status: ProjectStatus): number {
  const idx = PROCESS_STEPS.findIndex((s) => s.statuses.includes(status))
  return idx >= 0 ? idx : PROCESS_STEPS.length - 1
}

function stepPhase(
  stepIndex: number,
  currentIndex: number,
): "done" | "current" | "upcoming" {
  if (stepIndex < currentIndex) return "done"
  if (stepIndex === currentIndex) return "current"
  return "upcoming"
}

interface Props {
  tab: ProjectTab
  status: ProjectStatus
  onSelect: (tab: ProjectTab) => void
}

/**
 * ステータス駆動の工程ナビ。
 * 用語は要件どおり維持し、現在工程を強調・前後工程の視覚優先度を下げる。
 */
export function ProjectProcessNav({ tab, status, onSelect }: Props) {
  const currentIndex = stepIndexForStatus(status)

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSelect("overview")}
          className={cn(
            "shrink-0 rounded-md px-3 py-2 text-[12px] font-medium transition-colors md:text-[13px]",
            tab === "overview"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          概要
        </button>
        <div className="h-4 w-px shrink-0 bg-border" aria-hidden />
        <TabScrollContainer className="min-w-0 flex-1">
          <ol className="flex w-max min-w-full items-center gap-1 md:gap-0">
            {PROCESS_STEPS.map((step, i) => {
              const phase = stepPhase(i, currentIndex)
              const active = tab === step.id
              return (
                <li key={step.id} className="flex items-center">
                  {i > 0 && (
                    <span
                      className={cn(
                        "mx-0.5 hidden h-px w-3 shrink-0 sm:mx-1 sm:block md:w-5",
                        phase === "upcoming" ? "bg-border" : "bg-primary/40",
                      )}
                      aria-hidden
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onSelect(step.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-2 text-left text-[12px] font-medium transition-colors md:px-3 md:text-[13px]",
                      active && "bg-primary text-primary-foreground shadow-sm",
                      !active && phase === "current" && "bg-primary-subtle text-primary",
                      !active && phase === "done" && "text-foreground/80 hover:bg-accent",
                      !active && phase === "upcoming" && "text-muted-foreground/70 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tabular-nums",
                        active && "bg-primary-foreground/20 text-primary-foreground",
                        !active && phase === "current" && "bg-primary text-primary-foreground",
                        !active && phase === "done" && "bg-primary/15 text-primary",
                        !active && phase === "upcoming" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {phase === "done" && !active ? (
                        <Check className="size-2.5" strokeWidth={3} />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span className="whitespace-nowrap">{step.label}</span>
                    {phase === "current" && !active && (
                      <span className="hidden text-[10px] font-normal opacity-80 sm:inline">
                        進行中
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        </TabScrollContainer>
      </div>
    </div>
  )
}
