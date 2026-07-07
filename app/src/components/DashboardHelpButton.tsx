import { useState } from "react"
import { CircleHelp } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const SECTIONS = [
  {
    title: "このダッシュボードについて",
    items: [
      "要件定義 2-D の指標を自動集計・可視化します。",
      "表示中の数値はデモ用のサンプルです。",
    ],
  },
  {
    title: "KPI指標の目標",
    items: [
      "作成工数の削減率: 50%以上",
      "作成完了率: 80%以上",
      "フロー図の初回生成精度: 70%以上",
      "利用者満足度(CSAT): 4.0以上",
    ],
  },
  {
    title: "LLMコスト監視",
    items: [
      "月間上限に対する概算コストの消費状況を表示します。",
      "80% 到達で管理者に通知、100% で新規生成を一時制限します。",
      "閲覧・編集は制限後も継続できます。",
    ],
  },
  {
    title: "活用度",
    items: [
      "マニュアル閲覧数・QAチャット利用・更新頻度など、作って終わりにしないための指標です。",
      "6ヶ月以内の更新率の目標は 40% です。",
    ],
  },
] as const

/** KPIダッシュボードの説明 */
export function DashboardHelpButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => setOpen(true)}
            aria-label="ダッシュボードの説明"
          >
            <CircleHelp className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">説明</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">KPIダッシュボード</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-[13px] leading-relaxed text-muted-foreground">
            {SECTIONS.map((section) => (
              <section key={section.title}>
                <h3 className="mb-1.5 text-xs font-semibold text-foreground">{section.title}</h3>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
