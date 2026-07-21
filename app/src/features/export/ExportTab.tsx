import { useState } from "react"
import { AlertTriangle, Check, Download, FileText, Presentation } from "lucide-react"
import type { Project } from "@/lib/types"
import { exportManualPptx } from "@/lib/export-pptx"
import { compareSectionNumbers, displaySectionTitle, resolveSectionNumber } from "@/lib/manual-outline"
import { SUCCESS_TEXT, WARNING_BOX, WARNING_TEXT } from "@/lib/semantic-styles"
import { countManualReviewNeeded, buildUnplacedCandidates } from "@/lib/manual-impact"
import { Button } from "@/components/ui/button"
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

  const [exportError, setExportError] = useState<string | null>(null)

  const sortedSections = [...project.sections].sort((a, b) =>
    compareSectionNumbers(resolveSectionNumber(a), resolveSectionNumber(b)),
  )

  const targetSections =
    range === "all" ? sortedSections : sortedSections.filter((s) => s.id === range)

  const syncReviewCount =
    countManualReviewNeeded(project.sections) +
    buildUnplacedCandidates(project.flow, project.sections).length

  const doExport = async () => {
    setExporting(true)
    setExported(false)
    setExportError(null)
    try {
      if (format === "pptx") {
        await exportManualPptx(project, targetSections, {
          includeImages: imageMode !== "none",
        })
      } else {
        await new Promise((r) => window.setTimeout(r, 800))
      }
      setExported(true)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "出力に失敗しました")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="scroll-touch h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <h2 className="text-lg font-bold tracking-tight">エクスポート設定</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          マニュアルを PDF / PowerPoint 形式で出力します。社内テンプレートの体裁が適用されます。
        </p>

        {syncReviewCount > 0 && (
          <div className={cn("mt-4 flex items-start gap-2 px-3 py-2.5 text-xs leading-relaxed", WARNING_BOX)}>
            <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", WARNING_TEXT)} />
            フローとの見直し候補が {syncReviewCount} 件残っています。出力前にマニュアルタブで確認することを推奨します。
          </div>
        )}

        {/* 形式 */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          {(
            [
              { id: "pdf", icon: FileText, title: "PDF", desc: "閲覧・印刷用。フロー図と画像を含められます" },
              { id: "pptx", icon: Presentation, title: "PowerPoint", desc: "1セクション = 1スライドで出力" },
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
                  {sortedSections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {resolveSectionNumber(s) ? `${resolveSectionNumber(s)} ` : ""}
                      {displaySectionTitle(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {format === "pptx" && (
              <div className="flex items-center justify-between gap-4">
                <Label className="text-[13px]">画像の扱い</Label>
                <Select value={imageMode} onValueChange={setImageMode}>
                  <SelectTrigger size="sm" className="w-64 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expand">スライド内に画像を含める</SelectItem>
                    <SelectItem value="none">画像なし</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
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

        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <Button
            size="lg"
            className="min-w-[14rem] gap-1.5"
            onClick={doExport}
            disabled={exporting || project.sections.length === 0}
          >
            <Download className="size-4" />
            {exporting ? "出力中…" : `${format === "pdf" ? "PDF" : "PowerPoint"} を出力`}
          </Button>
          {project.sections.length === 0 && (
            <span className="text-xs text-muted-foreground">マニュアルを生成すると出力できます</span>
          )}
          {exported && format === "pptx" && (
            <span className={cn("flex items-center justify-center gap-1 text-sm", SUCCESS_TEXT)}>
              <Check className="size-4" />
              {targetSections.length} スライドの {project.name}.pptx をダウンロードしました
            </span>
          )}
          {exported && format === "pdf" && (
            <span className={cn("flex items-center justify-center gap-1 text-sm", SUCCESS_TEXT)}>
              <Check className="size-4" />
              {project.name}.pdf を出力しました(デモのためダウンロードは行われません)
            </span>
          )}
          {exportError && (
            <span className="text-sm text-destructive">{exportError}</span>
          )}
        </div>
      </div>
    </div>
  )
}
