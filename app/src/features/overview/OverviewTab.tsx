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

  const steps: {
    tab: ProjectTab
    icon: typeof MessagesSquare
    title: string
    stat: string
    done: boolean
  }[] = [
    {
      tab: "hearing",
      icon: MessagesSquare,
      title: "骨組みヒアリング",
      stat: `${answered} / 10 問回答済み`,
      done: answered >= 10,
    },
    {
      tab: "flow",
      icon: Workflow,
      title: "フロー図の生成・編集",
      stat: project.flow.nodes.length > 0 ? `${project.flow.nodes.length} ステップ` : "未生成",
      done: project.flow.nodes.length > 0 && project.status !== "flow",
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
    },
    {
      tab: "manual",
      icon: BookCheck,
      title: "マニュアル生成・レビュー",
      stat:
        project.sections.length > 0
          ? `${approved} / ${project.sections.length} セクション承認済み` +
            (needsConfirm > 0 ? ` ・ 要確認 ${needsConfirm} 件` : "")
          : "未生成",
      done: project.sections.length > 0 && approved === project.sections.length,
    },
  ]

  return (
    <div className="scroll-touch h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
        <p className="text-sm text-muted-foreground">{project.description}</p>
        {project.reviewDeadline && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <CalendarClock className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">見直し期限:</span>
            <Badge variant="secondary">{project.reviewDeadline}</Badge>
          </div>
        )}

        <div className="mt-6 grid gap-3">
          {steps.map((s) => (
            <Card
              key={s.tab}
              className={cn(
                "cursor-pointer py-4 transition-colors hover:border-primary/40",
                s.done && "bg-muted/40",
              )}
              onClick={() => setTab(s.tab)}
            >
              <CardContent className="flex items-center gap-4">
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    s.done ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                  )}
                >
                  <s.icon className="size-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{s.title}</div>
                  <div className="text-xs text-muted-foreground">{s.stat}</div>
                </div>
                <Button variant="ghost" size="sm" className="gap-1 text-primary">
                  {s.done ? (
                    <>
                      <Eye className="size-3.5" />
                      確認
                    </>
                  ) : (
                    <>
                      進む
                      <ArrowRight className="size-3.5" />
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 更新履歴 (F-6) */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <History className="size-4 text-muted-foreground" />
              更新履歴
            </CardTitle>
          </CardHeader>
          <CardContent>
            {project.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">まだ履歴がありません</p>
            ) : (
              <ol className="relative flex flex-col gap-4 border-l pl-5">
                {project.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute top-1.5 -left-[26px] size-2 rounded-full bg-primary/60" />
                    <div className="text-[13px]">{h.action}</div>
                    <div className="text-xs text-muted-foreground">
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
