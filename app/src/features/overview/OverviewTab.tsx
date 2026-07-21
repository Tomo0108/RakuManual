import {
  ArrowRight,
  BookCheck,
  CalendarClock,
  Eye,
  History,
  ListChecks,
  MessagesSquare,
  Workflow,
} from "lucide-react"
import type { Project, ProjectTab } from "@/lib/types"
import { countManualReviewNeeded, buildUnplacedCandidates } from "@/lib/manual-impact"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Props {
  project: Project
  setTab: (t: ProjectTab) => void
}

export function OverviewTab({ project, setTab }: Props) {
  const answered = project.hearingAnswers.filter((a) => a.status === "answered").length
  const deepdiveDone = project.deepdive.filter((d) => d.status === "done").length
  const approved = project.sections.filter((s) => s.status === "approved").length
  const needsConfirm = project.sections.reduce(
    (acc, s) => acc + s.blocks.filter((b) => b.needsConfirm).length,
    0,
  )
  const syncReview =
    countManualReviewNeeded(project.sections) +
    buildUnplacedCandidates(project.flow, project.sections).length

  const statusToTab: Record<string, ProjectTab> = {
    hearing: "hearing",
    flow: "flow",
    deepdive: "deepdive",
    manual: "manual",
    published: "export",
  }
  const currentTab = statusToTab[project.status] ?? "overview"

  const steps: {
    tab: ProjectTab
    icon: typeof MessagesSquare
    title: string
    stat: string
    done: boolean
    current: boolean
  }[] = [
    {
      tab: "hearing",
      icon: MessagesSquare,
      title: "骨組みヒアリング",
      stat: `${answered} / 10 問回答済み`,
      done: answered >= 10 && project.status !== "hearing",
      current: currentTab === "hearing",
    },
    {
      tab: "flow",
      icon: Workflow,
      title: "フロー図の生成・編集",
      stat: project.flow.nodes.length > 0 ? `${project.flow.nodes.length} ステップ` : "未生成",
      done: project.flow.nodes.length > 0 && project.status !== "flow" && project.status !== "hearing",
      current: currentTab === "flow",
    },
    {
      tab: "deepdive",
      icon: ListChecks,
      title: "深掘りヒアリング",
      stat:
        project.deepdive.length > 0
          ? `${deepdiveDone} / ${project.deepdive.length} ステップ完了`
          : "未着手",
      done: project.deepdive.length > 0 && deepdiveDone === project.deepdive.length,
      current: currentTab === "deepdive",
    },
    {
      tab: "manual",
      icon: BookCheck,
      title: "マニュアル生成・レビュー",
      stat:
        project.sections.length > 0
          ? `${approved} / ${project.sections.length} セクション承認済み` +
            (needsConfirm > 0 ? ` ・ 要確認 ${needsConfirm} 件` : "") +
            (syncReview > 0 ? ` ・ フロー見直し ${syncReview} 件` : "")
          : "未生成",
      done: project.sections.length > 0 && approved === project.sections.length && syncReview === 0,
      current: currentTab === "manual",
    },
  ]

  const currentStep = steps.find((s) => s.current)

  return (
    <div className="scroll-touch h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8">
        <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm md:p-6">
          <p className="text-[15px] leading-relaxed text-foreground/90">{project.description}</p>
          {project.reviewDeadline && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4 text-sm">
              <CalendarClock className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">見直し期限</span>
              <Badge variant="secondary">{project.reviewDeadline}</Badge>
            </div>
          )}
        </section>

        {currentStep && project.status !== "published" && (
          <section className="mt-5 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary-subtle/40 p-4 sm:flex-row sm:items-center sm:justify-between md:mt-6 md:p-5">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-wide text-primary uppercase">
                現在の工程
              </div>
              <div className="mt-1 text-base font-semibold">{currentStep.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{currentStep.stat}</div>
            </div>
            <Button className="shrink-0 gap-1.5" onClick={() => setTab(currentStep.tab)}>
              この工程へ進む
              <ArrowRight className="size-4" />
            </Button>
          </section>
        )}

        <section className="mt-6 md:mt-8">
          <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase md:mb-4">
            作成工程
          </h2>
          <div className="flex flex-col gap-2">
            {steps.map((s) => (
              <button
                key={s.tab}
                type="button"
                onClick={() => setTab(s.tab)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-4 py-3.5 text-left transition-colors sm:gap-4 sm:px-5",
                  s.current
                    ? "border-primary/40 bg-primary-subtle/30"
                    : s.done
                      ? "border-transparent bg-muted/30 hover:border-border"
                      : "border-border/60 bg-card hover:border-primary/30",
                )}
              >
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    s.current
                      ? "bg-primary text-primary-foreground"
                      : s.done
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  <s.icon className="size-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold leading-snug">{s.title}</span>
                    {s.current && (
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        進行中
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.stat}</div>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-sm text-primary">
                  {s.done && !s.current ? (
                    <>
                      <Eye className="size-3.5" />
                      <span className="hidden sm:inline">確認</span>
                    </>
                  ) : (
                    <>
                      <span className="hidden sm:inline">{s.current ? "続ける" : "開く"}</span>
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>

        <Card className="mt-6 gap-0 py-0 sm:mt-8">
          <CardHeader className="border-b border-border/60 px-4 py-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-sm">
              <History className="size-4 text-muted-foreground" />
              更新履歴
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-4 sm:px-6 sm:py-5">
            {project.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">まだ履歴がありません</p>
            ) : (
              <ol className="relative flex flex-col gap-4 border-l border-border/80 pl-5">
                {project.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary/60 ring-2 ring-card" />
                    <div className="text-[13px] leading-relaxed">{h.action}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {h.date} ・ {h.user}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
