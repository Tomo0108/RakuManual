import { useEffect, useState } from "react"
import { AlertTriangle, Check, Download, FileText, Globe, Presentation } from "lucide-react"
import type { Project } from "@/lib/types"
import type { UpdateProject } from "@/pages/ProjectPage"
import { exportManualPptx } from "@/lib/export-pptx"
import { compareSectionNumbers, displaySectionTitle, resolveSectionNumber } from "@/lib/manual-outline"
import { SUCCESS_TEXT, WARNING_BOX, WARNING_TEXT } from "@/lib/semantic-styles"
import { countManualReviewNeeded, buildUnplacedCandidates } from "@/lib/manual-impact"
import { publishProject } from "@/lib/api/publish"
import { downloadPdfBase64, exportProjectPdf } from "@/lib/api/export"
import { fetchTemplates, type DesignTemplate } from "@/lib/api/admin"
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

const FALLBACK_TEMPLATES: DesignTemplate[] = [
  {
    id: "corporate",
    name: "コーポレート標準",
    theme: "corporate",
    description: "社内ブランドガイドライン準拠",
    color: "#2563eb",
    updatedAt: 0,
  },
  {
    id: "simple",
    name: "シンプル",
    theme: "simple",
    description: "配布用のモノクロ基調",
    color: "#333333",
    updatedAt: 0,
  },
  {
    id: "training",
    name: "研修資料用",
    theme: "training",
    description: "新人教育向けの大きめ文字",
    color: "#0d9488",
    updatedAt: 0,
  },
]

interface Props {
  project: Project
  updateProject: UpdateProject
}

export function ExportTab({ project, updateProject }: Props) {
  const [format, setFormat] = useState<"pdf" | "pptx">("pdf")
  const [templates, setTemplates] = useState<DesignTemplate[]>(FALLBACK_TEMPLATES)
  const [template, setTemplate] = useState("corporate")
  const [range, setRange] = useState("all")
  const [imageMode, setImageMode] = useState("expand")
  const [includeFlow, setIncludeFlow] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)

  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    void fetchTemplates()
      .then((tpls) => {
        if (tpls.length > 0) {
          setTemplates(tpls)
          setTemplate((prev) => (tpls.some((t) => t.id === prev) ? prev : tpls[0].id))
        }
      })
      .catch(() => {
        /* フォールバック維持 */
      })
  }, [])

  const approved = project.sections.filter((s) => s.status === "approved").length
  const allApproved = project.sections.length > 0 && approved === project.sections.length
  const needsConfirm = project.sections.reduce(
    (acc, s) => acc + s.blocks.filter((b) => b.needsConfirm).length,
    0,
  )
  const canPublish = allApproved && needsConfirm === 0 && project.status !== "published"

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
          template,
        })
      } else {
        const { pdfBase64, filename } = await exportProjectPdf(project.id, {
          template,
          includeFlow,
          imageMode: imageMode as "expand" | "appendix" | "none",
          sectionIds: range === "all" ? undefined : [range],
        })
        downloadPdfBase64(pdfBase64, filename)
      }
      setExported(true)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "出力に失敗しました")
    } finally {
      setExporting(false)
    }
  }

  const doPublish = async () => {
    setPublishing(true)
    setPublishError(null)
    try {
      const published = await publishProject(project.id)
      updateProject(project.id, () => published)
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "公開に失敗しました")
    } finally {
      setPublishing(false)
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

        {/* 公開 */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Globe className="size-4 text-muted-foreground" />
              マニュアル公開
            </CardTitle>
            <CardDescription>
              全セクション承認後に公開できます。公開版は QA チャットの検索対象になります。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {project.status === "published" ? (
              <p className={cn("text-sm", SUCCESS_TEXT)}>
                <Check className="mr-1 inline size-4" />
                公開済み（{project.publishedAt?.slice(0, 10) ?? project.updatedAt}）
              </p>
            ) : (
              <>
                {!allApproved && (
                  <p className="text-xs text-muted-foreground">
                    承認済み {approved} / {project.sections.length} セクション
                  </p>
                )}
                {needsConfirm > 0 && (
                  <p className={cn("text-xs", WARNING_TEXT)}>要確認ブロックが {needsConfirm} 件残っています</p>
                )}
                <Button
                  className="w-fit gap-1.5"
                  disabled={!canPublish || publishing}
                  onClick={() => void doPublish()}
                >
                  <Globe className="size-4" />
                  {publishing ? "公開中…" : "マニュアルを公開する"}
                </Button>
                {publishError && <p className="text-sm text-destructive">{publishError}</p>}
              </>
            )}
          </CardContent>
        </Card>

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
            {templates.map((t) => (
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
                <div className="text-[10px] text-muted-foreground">{t.description}</div>
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
              {project.name}.pdf をダウンロードしました
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
