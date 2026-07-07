import {
  CircleDollarSign,
  Clock,
  Gauge,
  LayoutDashboard,
  Smile,
  TrendingUp,
} from "lucide-react"
import type { Project } from "@/lib/types"
import { STATUS_LABEL } from "@/lib/types"
import { STATUS_BADGE } from "@/lib/project-utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
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

const KPIS = [
  { icon: Clock, label: "作成工数の削減率", value: "58%", good: true },
  { icon: Gauge, label: "作成完了率", value: "83%", good: true },
  { icon: TrendingUp, label: "フロー初回生成精度", value: "72%", good: true },
  { icon: Smile, label: "利用者満足度", value: "4.2", good: true },
]

export function DashboardPage({ projects }: Props) {
  const published = projects.filter((p) => p.status === "published").length
  const tokenUsage = 62

  return (
    <div className="scroll-touch h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <LayoutDashboard className="size-5 text-primary" />
            KPIダッシュボード
          </h1>
          <DashboardHelpButton />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {KPIS.map((k) => (
            <Card key={k.label} className="gap-0 py-4">
              <CardContent>
                <div className="flex items-center justify-between gap-2">
                  <k.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {k.good && (
                    <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="目標達成" />
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
                <span className="text-2xl font-bold">¥31,200</span>
                <span className="text-xs text-muted-foreground">{tokenUsage}% / ¥50,000</span>
              </div>
              <Progress value={tokenUsage} className="mt-3 h-2" />
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
                <span className="text-muted-foreground">閲覧</span>
                <span className="font-semibold tabular-nums">342</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">QA質問</span>
                <span className="font-semibold tabular-nums">87</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">6ヶ月以内更新</span>
                <span className="font-semibold tabular-nums">44%</span>
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
          <CardContent>
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
