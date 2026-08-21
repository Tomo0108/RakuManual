import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Check, Download, FileText, Globe, Presentation } from "lucide-react"
import type { Project, ProjectVisibility } from "@/lib/types"
import { VISIBILITY_LABEL } from "@/lib/types"
import type { UpdateProject } from "@/pages/ProjectPage"
import { exportManualPptx } from "@/lib/export-pptx"
import { exportManualPdfClient } from "@/lib/export-pdf-client"
import {
  buildLeafSectionNumberMap,
  compareSectionNumbers,
  displaySectionTitle,
  resolveSectionNumber,
} from "@/lib/manual-outline"
import { SUCCESS_TEXT, WARNING_BOX, WARNING_TEXT } from "@/lib/semantic-styles"
import { countManualReviewNeeded, buildUnplacedCandidates } from "@/lib/manual-impact"
import { publishProject } from "@/lib/api/publish"
import { downloadPdfBase64, exportProjectPdf } from "@/lib/api/export"
import { fetchTemplates, submitCsat, type DesignTemplate } from "@/lib/api/admin"
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
import { findCaptionIssues } from "@/lib/caption-quality"
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
  const [csatPrompt, setCsatPrompt] = useState(false)
  const [csatScore, setCsatScore] = useState<number | null>(null)

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

  const needsConfirm = project.sections.reduce(
    (acc, s) => acc + s.blocks.filter((b) => b.needsConfirm).length,
    0,
  )
  const captionIssues = findCaptionIssues(project.sections)
  const canPublish =
    project.sections.length > 0 &&
    needsConfirm === 0 &&
    captionIssues.length === 0 &&
    project.status !== "published"
  // 未設定の既存公開分は組織全体公開（後方互換）、未公開はメンバー限定を既定にする
  const visibility: ProjectVisibility =
    project.visibility ?? (project.status === "published" ? "org" : "members")

  const sortedSections = [...project.sections].sort((a, b) =>
    compareSectionNumbers(resolveSectionNumber(a), resolveSectionNumber(b)),
  )
  const leafNumbers = useMemo(
    () => buildLeafSectionNumberMap(project.sections),
    [project.sections],
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
          includeFlow,
          template,
        })
      } else {
        // まず API（サーバーPDF）。不通・失敗時はクライアント生成にフォールバック
        // （UIプレビューでは API が無いため、ここで PDF が必ず出せるようにする）
        try {
          const result = await exportProjectPdf(project.id, {
            template,
            includeFlow,
            imageMode: imageMode as "expand" | "appendix" | "none",
            sectionIds: range === "all" ? undefined : [range],
          })
          if (!result.pdfBase64) throw new Error("PDFデータがありません")
          downloadPdfBase64(result.pdfBase64, result.filename)
        } catch {
          await exportManualPdfClient(project, targetSections, {
            includeImages: imageMode !== "none",
            includeFlow,
            template,
          })
        }
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
      const published = await publishProject(project.id, visibility)
      const { askCsat, ...rest } = published
      updateProject(project.id, () => rest)
      if (askCsat) setCsatPrompt(true)
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "公開に失敗しました")
    } finally {
      setPublishing(false)
    }
  }

  const sendCsat = async (score: number) => {
    setCsatScore(score)
    try {
      await submitCsat({ score, source: "publish", projectId: project.id })
      setCsatPrompt(false)
    } catch {
      /* 非致命 */
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
              要確認と図の説明を整えたら公開できます。公開版は QA チャットの検索対象になります。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px]">公開範囲</Label>
              <Select
                value={visibility}
                onValueChange={(v) =>
                  updateProject(project.id, (p) => ({ ...p, visibility: v as ProjectVisibility }))
                }
              >
                <SelectTrigger size="sm" className="w-full text-xs sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="members">{VISIBILITY_LABEL.members}</SelectItem>
                  <SelectItem value="org">{VISIBILITY_LABEL.org}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {visibility === "members"
                  ? "招待したメンバーとオーナーだけが閲覧・QA検索できます。"
                  : "社内の全ユーザーが公開版を閲覧・QA検索できます。ヒアリング回答や下書きは公開されません。"}
              </p>
            </div>

            {project.status === "published" ? (
              <p className={cn("text-sm", SUCCESS_TEXT)}>
                <Check className="mr-1 inline size-4" />
                公開済み（{project.publishedAt?.slice(0, 10) ?? project.updatedAt}）
              </p>
            ) : (
              <>
                {project.sections.length === 0 && (
                  <p className="text-xs text-muted-foreground">先にマニュアルを生成してください</p>
                )}
                {needsConfirm > 0 && (
                  <p className={cn("text-xs", WARNING_TEXT)}>要確認ブロックが {needsConfirm} 件残っています</p>
                )}
                {captionIssues.length > 0 && (
                  <div className={cn("rounded-md px-3 py-2 text-xs leading-relaxed", WARNING_BOX)}>
                    <p className={cn("font-medium", WARNING_TEXT)}>
                      図の説明（キャプション）を直してから公開してください（{captionIssues.length} 件）
                    </p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
                      {captionIssues.slice(0, 5).map((issue) => (
                        <li key={`${issue.sectionId}-${issue.blockId}`}>
                          {issue.sectionTitle}: {issue.message}
                        </li>
                      ))}
                      {captionIssues.length > 5 && <li>ほか {captionIssues.length - 5} 件</li>}
                    </ul>
                  </div>
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
            {csatPrompt && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="font-medium">公開お疲れさまでした。満足度を教えてください（CSAT）</p>
                <div className="mt-2 flex gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={csatScore === s ? "default" : "outline"}
                      onClick={() => void sendCsat(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
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
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                <div className="mt-2 truncate text-[10px] font-medium" style={{ color: t.color }}>
                  1.1.1 新規申請の例
                </div>
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
                      {(leafNumbers.get(s.id) ?? resolveSectionNumber(s))
                        ? `${leafNumbers.get(s.id) ?? resolveSectionNumber(s)} `
                        : ""}
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
                <p className="text-[11px] text-muted-foreground">
                  {format === "pptx"
                    ? "表紙の次にスイムレーン形式のフロー図スライドを挿入します"
                    : "冒頭ページに全体フロー図を挿入します"}
                </p>
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
