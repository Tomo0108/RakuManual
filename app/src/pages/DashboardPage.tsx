import { useEffect, useState } from "react"
import {
  CircleDollarSign,
  CircleGauge,
  Clock,
  LayoutDashboard,
  MessageCircleQuestion,
  Smile,
  TrendingUp,
} from "lucide-react"
import type { Project } from "@/lib/types"
import { STATUS_LABEL } from "@/lib/types"
import { STATUS_BADGE } from "@/lib/project-utils"
import { fetchDashboardMetrics, type DashboardMetrics } from "@/lib/api/metrics"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/ui/page-header"
import { DashboardHelpButton } from "@/components/DashboardHelpButton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Props {
  projects: Project[]
}

export function DashboardPage({ projects }: Props) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)

  useEffect(() => {
    void fetchDashboardMetrics()
      .then(setMetrics)
      .catch(() => setMetrics(null))
  }, [projects.length])

  const published = metrics?.publishedCount ?? projects.filter((p) => p.status === "published").length
  const tokenUsage = metrics?.llmUsagePercent ?? (
    metrics
      ? Math.round((metrics.llmCostYen / metrics.llmBudgetYen) * 100)
      : 0
  )

  const kpis = [
    { icon: Clock, label: "作成完了率", value: `${metrics?.completionRate ?? 0}%`, good: true },
    { icon: CircleGauge, label: "公開済み", value: String(published), good: published > 0 },
    { icon: MessageCircleQuestion, label: "QA質問数", value: String(metrics?.qaQuestionCount ?? 0), good: true },
    {
      icon: Smile,
      label: "CSAT平均",
      value: metrics?.csatAverage != null ? String(metrics.csatAverage) : "—",
      good: (metrics?.csatAverage ?? 0) >= 4,
    },
    {
      icon: TrendingUp,
      label: "ヒアリング離脱率",
      value: `${metrics?.hearingDropoutRate ?? 0}%`,
      good: (metrics?.hearingDropoutRate ?? 0) <= 40,
    },
  ]

  return (
    <div className="scroll-touch h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
        <PageHeader
          title="KPIダッシュボード"
          icon={<LayoutDashboard className="size-5" />}
          actions={<DashboardHelpButton />}
        />

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {kpis.map((k) => (
            <Card key={k.label} className="gap-0 py-4 transition-shadow hover:shadow-md">
              <CardContent>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle">
                    <k.icon className="size-4 text-primary" aria-hidden />
                  </span>
                  {k.good && (
                    <span className="size-1.5 shrink-0 rounded-full bg-[var(--semantic-success-fg)]" aria-label="目標達成" />
                  )}
                </div>
                <p className="mt-2 text-xs leading-snug text-muted-foreground">{k.label}</p>
                <div className="mt-1 text-2xl font-bold tracking-tight">{k.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CircleDollarSign className="size-4 text-muted-foreground" />
                LLMコスト(今月)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between gap-2">
                <span className="text-2xl font-bold">
                  ¥{(metrics?.llmCostYen ?? 0).toLocaleString()}
                </span>
                <span className="text-xs text-muted-foreground">
                  {tokenUsage}% / ¥{(metrics?.llmBudgetYen ?? 50000).toLocaleString()}
                  {metrics?.generationBlocked ? " · 生成制限中" : ""}
                </span>
              </div>
              <Progress value={Math.min(100, tokenUsage)} className="mt-3 h-2" />
              <p className="mt-2 text-[11px] text-muted-foreground">
                provider: {metrics?.llmProvider ?? "mock"} / 生成 {metrics?.generateCount ?? 0} /
                出力 {metrics?.exportCount ?? 0} / 公開 {metrics?.publishCount ?? 0}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="size-4 text-muted-foreground" />
                活用度(30日)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">QA質問</span>
                <span className="font-semibold tabular-nums">{metrics?.qaQuestionCount ?? 0}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">QA 👍</span>
                <span className="font-semibold tabular-nums">{metrics?.qaUpCount ?? 0}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">プロジェクト数</span>
                <span className="font-semibold tabular-nums">{metrics?.projectCount ?? projects.length}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">公開済み</span>
                <span className="font-semibold tabular-nums">{published}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">プロジェクト一覧</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>プロジェクト</TableHead>
                  <TableHead>オーナー</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>最終更新</TableHead>
                  <TableHead>見直し期限</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.owner}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE[p.status]}>
                        {STATUS_LABEL[p.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.updatedAt}</TableCell>
                    <TableCell className="text-muted-foreground">{p.reviewDeadline ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
