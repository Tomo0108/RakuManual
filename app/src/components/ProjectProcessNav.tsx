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
 * 現在工程は塗りつぶしではなく、文字色・下線・番号の差で示す。
 */
export function ProjectProcessNav({ tab, status, onSelect }: Props) {
  const currentIndex = stepIndexForStatus(status)

  return (
    <div className="mt-2">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => onSelect("overview")}
          className={cn(
            "relative shrink-0 px-3 py-2 text-[12px] font-medium transition-colors md:text-[13px]",
            tab === "overview"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          概要
          {tab === "overview" && (
            <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-foreground" aria-hidden />
          )}
        </button>

        <div className="my-1.5 w-px shrink-0 bg-border/80" aria-hidden />

        <TabScrollContainer className="min-w-0 flex-1">
          <ol className="flex w-max min-w-full items-stretch gap-0.5">
            {PROCESS_STEPS.map((step, i) => {
              const phase = stepPhase(i, currentIndex)
              const active = tab === step.id
              return (
                <li key={step.id} className="flex items-stretch">
                  {i > 0 && (
                    <span
                      className={cn(
                        "mx-0.5 hidden h-px w-4 self-center sm:mx-1 sm:block md:w-6",
                        i <= currentIndex ? "bg-foreground/25" : "bg-border",
                      )}
                      aria-hidden
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onSelect(step.id)}
                    aria-current={active ? "page" : phase === "current" ? "step" : undefined}
                    className={cn(
                      "relative flex items-center gap-1.5 px-2.5 py-2 text-left text-[12px] font-medium transition-colors md:px-3 md:text-[13px]",
                      active && "text-foreground",
                      !active && phase === "current" && "text-primary",
                      !active && phase === "done" && "text-foreground/70 hover:text-foreground",
                      !active && phase === "upcoming" && "text-muted-foreground/65 hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tabular-nums",
                        active && "bg-foreground text-background",
                        !active && phase === "current" && "border border-primary/50 text-primary",
                        !active && phase === "done" && "bg-foreground/8 text-foreground/70",
                        !active && phase === "upcoming" && "bg-transparent text-muted-foreground/70",
                      )}
                    >
                      {phase === "done" && !active ? (
                        <Check className="size-2.5" strokeWidth={3} />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span className="whitespace-nowrap">{step.label}</span>
                    {active && (
                      <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-foreground" aria-hidden />
                    )}
                    {!active && phase === "current" && (
                      <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary/50" aria-hidden />
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
