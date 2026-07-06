import { useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Check,
  Image as ImageIcon,
  ListTree,
  Pencil,
  RefreshCw,
  Sparkles,
  StickyNote,
  X,
  Workflow,
} from "lucide-react"
import type { ManualBlock, ManualSection, Project, ProjectTab } from "@/lib/types"
import { SECTION_LABEL } from "@/lib/types"
import type { UpdateProject } from "@/pages/ProjectPage"
import { now, today, uid } from "@/lib/project-utils"
import { Badge } from "@/components/ui/badge"
import { IconAction } from "@/components/ui/icon-action"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

const SECTION_STYLE = {
  draft: "bg-muted text-muted-foreground border-transparent",
  review: "bg-sky-50 text-sky-700 border-sky-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
} as const

interface Props {
  project: Project
  updateProject: UpdateProject
  setTab: (t: ProjectTab) => void
}

export function ManualTab({ project, updateProject, setTab }: Props) {
  const isMobile = useIsMobile()
  const sections = project.sections
  const [selectedId, setSelectedId] = useState<string | null>(sections[0]?.id ?? null)
  const [mobileView, setMobileView] = useState<"list" | "detail">("list")
  const [generating, setGenerating] = useState(false)

  const selected = sections.find((s) => s.id === selectedId) ?? null

  const selectSection = (id: string) => {
    setSelectedId(id)
    if (isMobile) setMobileView("detail")
  }

  const updateSection = (sectionId: string, updater: (s: ManualSection) => ManualSection) => {
    updateProject(project.id, (p) => ({
      ...p,
      sections: p.sections.map((s) => (s.id === sectionId ? updater(s) : s)),
    }))
  }

  /* セクション生成(モック): 深掘り回答からセクションを作る */
  const generateSections = () => {
    setGenerating(true)
    window.setTimeout(() => {
      updateProject(project.id, (p) => {
        const nodeMap = new Map(p.flow.nodes.map((n) => [n.id, n]))
        const generated: ManualSection[] = p.deepdive.map((d) => {
          const num = d.sectionNumber ?? nodeMap.get(d.stepId)?.data.sectionNumber
          return {
            id: uid("s"),
            title: num ? `${num} ${d.stepLabel}` : d.stepLabel,
            sectionNumber: num,
            stepId: d.stepId,
            status: "draft",
            version: 1,
            updatedAt: today(),
            blocks:
              d.status === "done" || d.answers.length > 0
                ? d.answers.map((qa, j) => ({
                    id: uid("b"),
                    type: (j === 0 ? "paragraph" : "step") as ManualBlock["type"],
                    text: qa.answer,
                    needsConfirm: j === d.answers.length - 1 && d.status !== "done",
                  }))
                : [
                    {
                      id: uid("b"),
                      type: "paragraph" as const,
                      text: `項番 ${num ?? "—"} のセクションです。深掘りヒアリングが未完了のため、プレースホルダ表示です。`,
                    },
                  ],
          }
        })
        return {
          ...p,
          status: p.status === "deepdive" ? "manual" : p.status,
          sections: generated,
          history: [
            { id: `h-${Date.now()}`, date: now(), user: "山田 太郎", action: `マニュアルを生成(全${generated.length}セクション)` },
            ...p.history,
          ],
        }
      })
      setGenerating(false)
    }, 1100)
  }

  if (sections.length === 0) {
    // フロー未確定(深掘り対象なし)の場合は生成できない
    if (project.deepdive.length === 0) {
      return (
        <div className="flex h-full items-center justify-center px-4">
          <div className="max-w-md text-center">
            <h2 className="text-lg font-bold">まだマニュアルを生成できません</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              マニュアルはフロー図のセクション単位で生成されます。先にフロー図を作成・確定してください。
            </p>
            <IconAction label="フロー図へ進む" variant="default" className="mt-4 h-9" onClick={() => setTab("flow")}>
              <Workflow className="size-4" />
            </IconAction>
          </div>
        </div>
      )
    }
    const ready = project.deepdive.some((d) => d.answers.length > 0)
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-subtle text-primary">
            <Sparkles className="size-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold">マニュアルをセクション単位で生成</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            フロー図のセクションごとにマニュアルを生成します。AIが推測で補った箇所には「要確認」マークが付き、あなたの承認なしに確定されることはありません。
          </p>
          {!ready && (
            <p className="mt-3 text-xs text-amber-600">
              深掘りヒアリングが未回答のため、生成してもプレースホルダが多くなります
            </p>
          )}
          <IconAction
            label={generating ? "生成中…" : "マニュアルを生成する"}
            variant="default"
            className="mt-5 h-9"
            disabled={generating}
            onClick={generateSections}
          >
            <Sparkles className="size-4" />
          </IconAction>
        </div>
      </div>
    )
  }

  if (isMobile && mobileView === "list") {
    return (
      <SectionListPanel
        sections={sections}
        selectedId={selectedId}
        onSelect={selectSection}
        className="h-full w-full border-r-0"
      />
    )
  }

  if (isMobile && mobileView === "detail" && selected) {
    return (
      <div className="flex h-full flex-col">
        <SectionEditor
          key={selected.id}
          section={selected}
          isMobile
          onBack={() => setMobileView("list")}
          onUpdate={(updater) => updateSection(selected.id, updater)}
          onLog={(action) =>
            updateProject(project.id, (p) => ({
              ...p,
              history: [{ id: `h-${Date.now()}`, date: now(), user: "山田 太郎", action }, ...p.history],
            }))
          }
        />
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <SectionListPanel sections={sections} selectedId={selectedId} onSelect={selectSection} />
      <div className="scroll-touch min-w-0 flex-1 overflow-y-auto">
        {selected && (
          <SectionEditor
            key={selected.id}
            section={selected}
            onUpdate={(updater) => updateSection(selected.id, updater)}
            onLog={(action) =>
              updateProject(project.id, (p) => ({
                ...p,
                history: [{ id: `h-${Date.now()}`, date: now(), user: "山田 太郎", action }, ...p.history],
              }))
            }
          />
        )}
      </div>
    </div>
  )
}

/* ================= セクション一覧 ================= */

function SectionListPanel({
  sections,
  selectedId,
  onSelect,
  className,
}: {
  sections: ManualSection[]
  selectedId: string | null
  onSelect: (id: string) => void
  className?: string
}) {
  return (
    <aside className={cn("flex w-72 shrink-0 flex-col border-r bg-muted/20", className)}>
      <div className="page-header border-b px-4 py-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <ListTree className="size-4 text-muted-foreground" />
          セクション
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {sections.filter((s) => s.status === "approved").length} / {sections.length} 承認済み
        </div>
      </div>
      <div className="scroll-touch min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-1.5">
          {sections.map((s) => {
            const confirms = s.blocks.filter((b) => b.needsConfirm).length
            return (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={cn(
                  "min-h-14 rounded-md border bg-background px-3 py-3 text-left transition-colors md:min-h-0 md:py-2.5",
                  selectedId === s.id
                    ? "border-primary/60 ring-2 ring-primary/15"
                    : "hover:border-primary/30 active:bg-muted/50",
                )}
              >
                <div className="text-[13px] leading-snug font-medium">{s.title}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={cn("h-5 text-[10px]", SECTION_STYLE[s.status])}>
                    {SECTION_LABEL[s.status]}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">v{s.version}</span>
                  {confirms > 0 && (
                    <span className="ml-auto flex items-center gap-0.5 text-[10px] font-medium text-amber-600">
                      <AlertTriangle className="size-3" />
                      要確認 {confirms}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

/* ================= セクションエディタ ================= */

function SectionEditor({
  section,
  onUpdate,
  onLog,
  isMobile,
  onBack,
}: {
  section: ManualSection
  onUpdate: (updater: (s: ManualSection) => ManualSection) => void
  onLog: (action: string) => void
  isMobile?: boolean
  onBack?: () => void
}) {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [blockDraft, setBlockDraft] = useState("")
  const [regenerating, setRegenerating] = useState(false)

  const confirms = section.blocks.filter((b) => b.needsConfirm).length
  const canApprove = confirms === 0 && section.status !== "approved"

  const updateBlock = (blockId: string, updater: (b: ManualBlock) => ManualBlock) => {
    onUpdate((s) => ({
      ...s,
      // 承認済みセクションを編集したらレビュー中に戻す(公開版とドラフトの分離)
      status: s.status === "approved" ? "review" : s.status,
      updatedAt: today(),
      blocks: s.blocks.map((b) => (b.id === blockId ? updater(b) : b)),
    }))
  }

  const approve = () => {
    onUpdate((s) => ({ ...s, status: "approved", version: s.version + 1, updatedAt: today() }))
    onLog(`セクション「${section.title}」を承認(v${section.version + 1})`)
  }

  const regenerate = () => {
    setRegenerating(true)
    window.setTimeout(() => {
      onUpdate((s) => ({
        ...s,
        status: "draft",
        version: s.version + 1,
        updatedAt: today(),
        blocks: s.blocks.map((b) => ({ ...b })),
      }))
      onLog(`セクション「${section.title}」をAIで部分再生成(他セクションへの影響なし)`)
      setRegenerating(false)
    }, 900)
  }

  let stepNo = 0

  const actionButtons = (
    <>
      <IconAction
        label={regenerating ? "再生成中…" : "AI再生成"}
        variant="outline"
        className={cn("h-10", isMobile && "flex-1")}
        disabled={regenerating}
        onClick={regenerate}
      >
        <RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} />
      </IconAction>
      <IconAction
        label={section.status === "approved" ? "承認済み" : "承認する"}
        variant="default"
        className={cn("h-10", isMobile && "flex-1")}
        disabled={!canApprove}
        onClick={approve}
      >
        <BadgeCheck className="size-4" />
      </IconAction>
    </>
  )

  const desktopActions = (
    <div className="flex shrink-0 gap-2">
      <IconAction
        label={regenerating ? "再生成中…" : "AI再生成"}
        variant="outline"
        size="sm"
        className="h-8"
        disabled={regenerating}
        onClick={regenerate}
      >
        <RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} />
      </IconAction>
      <IconAction
        label={
          confirms > 0
            ? `「要確認」が ${confirms} 件残っているため承認できません`
            : section.status === "approved"
              ? "承認済み"
              : "承認する"
        }
        variant="default"
        size="sm"
        className="h-8"
        disabled={!canApprove}
        onClick={approve}
      >
        <BadgeCheck className="size-4" />
      </IconAction>
    </div>
  )

  return (
    <div className={cn("flex h-full flex-col", !isMobile && "scroll-touch overflow-y-auto")}>
      <div className={cn("mx-auto w-full max-w-3xl flex-1 px-4 py-4 md:px-8 md:py-8", isMobile && "scroll-touch overflow-y-auto pb-4")}>
        {isMobile && onBack && (
          <IconAction label="セクション一覧" variant="ghost" size="sm" className="-ml-2 mb-2 h-9" onClick={onBack}>
            <ArrowLeft className="size-4" />
          </IconAction>
        )}

        <div className={cn("flex gap-4", isMobile ? "flex-col" : "items-start justify-between")}>
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight md:text-xl">{section.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className={cn("h-5 text-[10px]", SECTION_STYLE[section.status])}>
                {SECTION_LABEL[section.status]}
              </Badge>
              <span>v{section.version}</span>
              <span>最終更新 {section.updatedAt}</span>
            </div>
          </div>
          {!isMobile && desktopActions}
        </div>

        {confirms > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-800 md:px-4 md:text-[13px]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            AIが推測で補完した「要確認」箇所が {confirms} 件あります。内容を確認し、すべて解消すると承認できます。
          </div>
        )}

        <div className="mt-5 flex flex-col gap-1 md:mt-6">
          {section.blocks.map((block) => {
            if (block.type === "step") stepNo += 1
            return (
              <BlockView
                key={block.id}
                block={block}
                stepNo={block.type === "step" ? stepNo : undefined}
                isMobile={isMobile}
                editing={editingBlockId === block.id}
                draft={blockDraft}
                setDraft={setBlockDraft}
                onStartEdit={() => {
                  setEditingBlockId(block.id)
                  setBlockDraft(block.text)
                }}
                onSave={() => {
                  updateBlock(block.id, (b) => ({ ...b, text: blockDraft }))
                  setEditingBlockId(null)
                }}
                onCancel={() => setEditingBlockId(null)}
                onResolveConfirm={() => updateBlock(block.id, (b) => ({ ...b, needsConfirm: false }))}
              />
            )
          })}
        </div>
      </div>

      {isMobile && (
        <div className="shrink-0 border-t bg-card/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
          <div className="flex gap-2">{actionButtons}</div>
          {confirms > 0 && (
            <p className="mt-2 text-center text-[10px] text-amber-700">
              要確認をすべて解消すると承認できます
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ================= ブロック表示 ================= */

function BlockView({
  block,
  stepNo,
  isMobile,
  editing,
  draft,
  setDraft,
  onStartEdit,
  onSave,
  onCancel,
  onResolveConfirm,
}: {
  block: ManualBlock
  stepNo?: number
  isMobile?: boolean
  editing: boolean
  draft: string
  setDraft: (v: string) => void
  onStartEdit: () => void
  onSave: () => void
  onCancel: () => void
  onResolveConfirm: () => void
}) {
  const [imageOpen, setImageOpen] = useState(false)

  return (
    <div
      className={cn(
        "group relative rounded-lg px-3 py-2 transition-colors",
        block.needsConfirm && "bg-amber-50/70 ring-1 ring-amber-200",
        !block.needsConfirm && "hover:bg-muted/40",
      )}
    >
      {editing ? (
        <div>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-20 text-sm" autoFocus />
          <div className="mt-2 flex justify-end gap-2">
            <IconAction label="キャンセル" variant="ghost" size="sm" className="h-8" onClick={onCancel}>
              <X className="size-3.5" />
            </IconAction>
            <IconAction label="保存" variant="default" size="sm" className="h-8" disabled={!draft.trim()} onClick={onSave}>
              <Check className="size-3.5" />
            </IconAction>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            {stepNo !== undefined && (
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {stepNo}
              </span>
            )}
            {block.type === "note" && (
              <StickyNote className="mt-1 size-4 shrink-0 text-amber-500" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm leading-relaxed",
                  block.type === "note" && "text-[13px] text-amber-800",
                )}
              >
                {block.text}
              </p>

              {/* 要確認マーク(F-5: ハルシネーション対策) */}
              {block.needsConfirm && (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <Badge variant="outline" className="h-auto w-fit gap-1 border-amber-300 bg-amber-100/60 px-2 py-1 text-[10px] leading-snug text-amber-700">
                    <AlertTriangle className="size-2.5 shrink-0" />
                    要確認: AIが推測で補完した内容です
                  </Badge>
                  <div className="flex flex-wrap gap-2">
                    <IconAction
                      label="内容OK"
                      variant="outline"
                      size="sm"
                      className="h-9 border-amber-300 bg-white"
                      onClick={onResolveConfirm}
                    >
                      <Check className="size-3.5" />
                    </IconAction>
                    <IconAction label="修正する" variant="outline" size="sm" className="h-9 bg-white" onClick={onStartEdit}>
                      <Pencil className="size-3.5" />
                    </IconAction>
                  </div>
                </div>
              )}

              {/* 画像(ヘルプボタン方式 F-5): 本文レイアウトを崩さず展開 */}
              {block.image && (
                <div className="mt-2">
                    <IconAction
                      label="画像を見る"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full px-2.5"
                      onClick={() => setImageOpen((v) => !v)}
                    >
                      <ImageIcon className="size-3" />
                    </IconAction>
                  {imageOpen && (
                    <figure className="mt-2 overflow-hidden rounded-lg border">
                      <div
                        className="flex h-40 items-center justify-center text-xs text-muted-foreground"
                        style={{ background: block.image.color }}
                      >
                        <span className="rounded bg-white/70 px-3 py-1.5">スクリーンショット(サンプル画像)</span>
                      </div>
                      <figcaption className="border-t bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
                        {block.image.caption}
                      </figcaption>
                    </figure>
                  )}
                </div>
              )}
            </div>

            {/* ホバーで編集ボタン */}
            {!block.needsConfirm && (
              <button
                className={cn(
                  "mt-0.5 rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:p-1",
                  isMobile ? "opacity-100" : "opacity-0 transition-opacity group-hover:opacity-100",
                )}
                onClick={onStartEdit}
                aria-label="このブロックを編集"
              >
                <Pencil className="size-4 md:size-3.5" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
