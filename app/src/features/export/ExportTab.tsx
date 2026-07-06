import { useState } from "react"
import { Check, Download, FileText, Presentation } from "lucide-react"
import type { Project } from "@/lib/types"
import { IconAction } from "@/components/ui/icon-action"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

const TEMPLATES = [
  { id: "corporate", name: "コーポレート標準", desc: "社内ブランドガイドライン準拠", color: "oklch(0.55 0.18 255)" },
  { id: "simple", name: "シンプル", desc: "配布用のモノクロ基調", color: "oklch(0.4 0.01 260)" },
  { id: "training", name: "研修資料用", desc: "新人教育向けの大きめ文字", color: "oklch(0.55 0.13 160)" },
]

interface Props {
  project: Project
}

export function ExportTab({ project }: Props) {
  const [format, setFormat] = useState<"pdf" | "pptx">("pdf")
  const [template, setTemplate] = useState("corporate")
  const [range, setRange] = useState("all")
  const [imageMode, setImageMode] = useState("expand")
  const [includeFlow, setIncludeFlow] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)

  const doExport = () => {
    setExporting(true)
    setExported(false)
    window.setTimeout(() => {
      setExporting(false)
      setExported(true)
    }, 1400)
  }

  return (
    <div className="scroll-touch h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <h2 className="text-lg font-bold tracking-tight">エクスポート設定</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          マニュアルを PDF / PowerPoint 形式で出力します。社内テンプレートの体裁が適用されます。
        </p>

        {/* 形式 */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          {(
            [
              { id: "pdf", icon: FileText, title: "PDF", desc: "閲覧・印刷用。フロー図と画像を含められます" },
              { id: "pptx", icon: Presentation, title: "PowerPoint", desc: "編集可能な pptx。セクション=スライド構成" },
            ] as const
          ).map((f) => (
            <Card
              key={f.id}
              className={cn(
                "cursor-pointer py-4 transition-colors",
                format === f.id ? "border-primary ring-2 ring-primary/15" : "hover:border-primary/40",
              )}
              onClick={() => setFormat(f.id)}
            >
              <CardContent className="flex items-center gap-3">
                <f.icon className={cn("size-6", format === f.id ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <div className="text-sm font-semibold">{f.title}</div>
                  <div className="text-xs text-muted-foreground">{f.desc}</div>
                </div>
                {format === f.id && <Check className="ml-auto size-4 text-primary" />}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* テンプレート */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-sm">デザインテンプレート</CardTitle>
            <CardDescription>社内ブランドガイドライン準拠のテンプレートから選択</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  template === t.id ? "border-primary ring-2 ring-primary/15" : "hover:border-primary/40",
                )}
              >
                <div className="h-14 rounded-md border" style={{ background: `linear-gradient(135deg, ${t.color} 0%, ${t.color} 30%, white 30%)` }} />
                <div className="mt-2 text-xs font-semibold">{t.name}</div>
                <div className="text-[10px] text-muted-foreground">{t.desc}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* オプション */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-sm">出力オプション</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <Label className="text-[13px]">出力範囲</Label>
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger size="sm" className="w-64 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">マニュアル全体({project.sections.length}セクション)</SelectItem>
                  {project.sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title} のみ
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {format === "pdf" && (
              <div className="flex items-center justify-between gap-4">
                <Label className="text-[13px]">画像の扱い</Label>
                <Select value={imageMode} onValueChange={setImageMode}>
                  <SelectTrigger size="sm" className="w-64 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expand">全画像を展開して出力</SelectItem>
                    <SelectItem value="appendix">画像は巻末にまとめる</SelectItem>
                    <SelectItem value="none">画像なし</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-[13px]">業務フロー図を含める</Label>
                <p className="text-[11px] text-muted-foreground">冒頭ページに全体フロー図を挿入します</p>
              </div>
              <Switch checked={includeFlow} onCheckedChange={setIncludeFlow} />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center gap-3">
          <IconAction
            label={exporting ? "出力中…" : `${format === "pdf" ? "PDF" : "PowerPoint"} を出力`}
            variant="default"
            className="h-9"
            disabled={exporting || project.sections.length === 0}
            onClick={doExport}
          >
            <Download className="size-4" />
          </IconAction>
          {project.sections.length === 0 && (
            <span className="text-xs text-muted-foreground">マニュアルを生成すると出力できます</span>
          )}
          {exported && (
            <span className="flex items-center gap-1 text-sm text-emerald-600">
              <Check className="size-4" />
              {project.name}.{format} を出力しました(デモのためダウンロードは行われません)
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
