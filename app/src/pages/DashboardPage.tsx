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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
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
  { icon: Clock, label: "作成工数の削減率", value: "58%", target: "目標 50%以上", good: true, progress: 100 },
  { icon: Gauge, label: "作成完了率", value: "83%", target: "目標 80%以上", good: true, progress: 100 },
  { icon: TrendingUp, label: "フロー図の初回生成精度", value: "72%", target: "目標 70%以上", good: true, progress: 100 },
  { icon: Smile, label: "利用者満足度(CSAT)", value: "4.2 / 5.0", target: "目標 4.0以上", good: true, progress: 84 },
]

export function DashboardPage({ projects }: Props) {
  const published = projects.filter((p) => p.status === "published").length
  const tokenUsage = 62

  return (
    <div className="scroll-touch h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <LayoutDashboard className="size-5 text-primary" />
          KPIダッシュボード
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          要件定義 2-D の指標を自動集計・可視化します(サンプル値)。
        </p>

        {/* KPIカード */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {KPIS.map((k) => (
            <Card key={k.label} className="gap-3 py-4">
              <CardContent>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <k.icon className="size-3.5" />
                  {k.label}
                </div>
                <div className="mt-2 text-2xl font-bold tracking-tight">{k.value}</div>
                <div className="mt-1 text-[11px] text-emerald-600">✓ {k.target}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {/* LLMコスト監視 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <CircleDollarSign className="size-4 text-muted-foreground" />
                LLMコスト監視(今月)
              </CardTitle>
              <CardDescription>月間上限に対する概算コストの消費状況</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold">¥31,200</span>
                <span className="text-xs text-muted-foreground">上限 ¥50,000</span>
              </div>
              <Progress value={tokenUsage} className="mt-3 h-2" />
              <p className="mt-2 text-[11px] text-muted-foreground">
                {tokenUsage}% 消費。80% 到達で管理者に通知、100% で新規生成を一時制限します(閲覧・編集は継続)。
              </p>
            </CardContent>
          </Card>

          {/* 活用度 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="size-4 text-muted-foreground" />
                活用度(直近30日)
              </CardTitle>
              <CardDescription>作って終わりにしないための指標</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">マニュアル閲覧数</span>
                <span className="font-semibold">342 回</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">QAチャット質問数</span>
                <span className="font-semibold">87 件(回答成功率 91%)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">6ヶ月以内に更新されたマニュアル</span>
                <span className="font-semibold">44%(目標 40%)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">公開済みマニュアル</span>
                <span className="font-semibold">{published} 本</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* プロジェクト状況 */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-sm">プロジェクト状況一覧</CardTitle>
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
