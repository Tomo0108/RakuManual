import { useRef, useState } from "react"
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ChevronDown,
  Image as ImageIcon,
  ImagePlus,
  ListTree,
  Pencil,
  RefreshCw,
  Sparkles,
  StickyNote,
  Trash2,
  Wrench,
  Workflow,
  X,
} from "lucide-react"
import type { ManualBlock, ManualSection, Project, ProjectTab } from "@/lib/types"
import { SECTION_LABEL } from "@/lib/types"
import type { UpdateProject } from "@/pages/ProjectPage"
import { now, today, uid } from "@/lib/project-utils"
import {
  buildManualOutline,
  displaySectionTitle,
  resolveSectionNumber,
} from "@/lib/manual-outline"
import {
  buildUnplacedCandidates,
  clearManualReview,
  markIntentionalDifference,
  partitionSectionsBySync,
} from "@/lib/manual-impact"
import { placeUnplacedSection } from "@/lib/manual-regen"
import { appendRevision, snapshotSection } from "@/lib/manual-version"
import { readImageFile, validateImageFile } from "@/lib/manual-image"
import { REVIEW_STATUS, WARNING_TEXT, WARNING_BOX, WARNING_SUBTLE, SEMANTIC } from "@/lib/semantic-styles"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { SyncStatusBadge } from "@/features/manual/SyncStatusBadge"
import {
  ManualImpactBanner,
  sectionMatchesImpactFilter,
  type ImpactFilter,
} from "@/features/manual/ManualImpactBanner"
import { ManualRegenWizard } from "@/features/manual/ManualRegenWizard"
import { SectionHistoryButton } from "@/features/manual/SectionHistoryPanel"

const SECTION_STYLE = {
  draft: REVIEW_STATUS.draft,
  review: REVIEW_STATUS.review,
  approved: REVIEW_STATUS.approved,
} as const

function resolveMajorTitle(project: Project): string {
  const businessName = project.hearingAnswers.find((a) => a.questionId === "q1" && a.value.trim())?.value.trim()
  return businessName || project.name
}

function sectionAnchorId(sectionId: string) {
  return `manual-section-${sectionId}`
}

function mediumAnchorId(mediumKey: string) {
  return `manual-medium-${mediumKey}`
}

/** sticky 目次バー分を見込んだスクロール余白 */
const SCROLL_MARGIN_CLASS = "scroll-mt-16 md:scroll-mt-6"

interface Props {
  project: Project
  updateProject: UpdateProject
  setTab: (t: ProjectTab) => void
}

export function ManualTab({ project, updateProject, setTab }: Props) {
  const isMobile = useIsMobile()
  const sections = project.sections
  const majorTitle = resolveMajorTitle(project)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(sections[0]?.id ?? null)
  const [generating, setGenerating] = useState(false)
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>("all")
  const [regenOpen, setRegenOpen] = useState(false)
  const documentRef = useRef<HTMLDivElement>(null)

  const scrollToSection = (id: string) => {
    setActiveSectionId(id)
    document.getElementById(sectionAnchorId(id))?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const scrollToMedium = (mediumKey: string, sectionId?: string) => {
    if (sectionId) setActiveSectionId(sectionId)
    document.getElementById(mediumAnchorId(mediumKey))?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const updateSection = (sectionId: string, updater: (s: ManualSection) => ManualSection) => {
    updateProject(project.id, (p) => ({
      ...p,
      sections: p.sections.map((s) => (s.id === sectionId ? updater(s) : s)),
    }))
  }

  const replaceProject = (next: Project) => {
    updateProject(project.id, () => next)
  }

  /* セクション生成(モック): 深掘り回答からセクションを作る */
  const generateSections = () => {
    setGenerating(true)
    window.setTimeout(() => {
      updateProject(project.id, (p) => {
        const nodeMap = new Map(p.flow.nodes.map((n) => [n.id, n]))
        const businessName = p.hearingAnswers.find((a) => a.questionId === "q1" && a.value.trim())?.value.trim()
        const generated: ManualSection[] = p.deepdive.map((d) => {
          const sectionNum = d.sectionNumber ?? nodeMap.get(d.stepId)?.data.sectionNumber
          const majorNum = sectionNum?.split(".")[0]
          const node = nodeMap.get(d.stepId)
          return {
            id: uid("s"),
            title: d.stepLabel,
            sectionNumber: sectionNum,
            majorTitle: d.majorTitle ?? (majorNum === "1" ? businessName : undefined),
            mediumTitle: d.mediumTitle,
            stepId: d.stepId,
            status: "draft" as const,
            version: 1,
            updatedAt: today(),
            syncStatus: "ok" as const,
            sourceSnapshot: {
              label: d.stepLabel,
              kind: node?.data.kind,
              sectionNumber: sectionNum,
            },
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
                      text: `項番 ${sectionNum ?? "—"} のセクションです。深掘りヒアリングが未完了のため、プレースホルダ表示です。`,
                    },
                  ],
          }
        })
        let next: Project = {
          ...p,
          status: p.status === "deepdive" ? "manual" : p.status,
          sections: generated,
          history: [
            { id: `h-${Date.now()}`, date: now(), user: "山田 太郎", action: `マニュアルを生成(全${generated.length}セクション)` },
            ...p.history,
          ],
        }
        for (const section of generated) {
          next = appendRevision(
            next,
            snapshotSection(section, { reason: "generate", user: "山田 太郎" }),
          )
        }
        return next
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
            <Button className="mt-4 gap-1.5" onClick={() => setTab("flow")}>
              <Workflow className="size-4" />
              フロー図へ進む
            </Button>
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
            <p className={cn("mt-3 text-xs", WARNING_TEXT)}>
              深掘りヒアリングが未回答のため、生成してもプレースホルダが多くなります
            </p>
          )}
          <Button className="mt-5 gap-1.5" onClick={generateSections} disabled={generating}>
            <Sparkles className="size-4" />
            {generating ? "生成中…" : "マニュアルを生成する"}
          </Button>
        </div>
      </div>
    )
  }

  const logAction = (action: string) => {
    updateProject(project.id, (p) => ({
      ...p,
      history: [{ id: `h-${Date.now()}`, date: now(), user: "山田 太郎", action }, ...p.history],
    }))
  }

  const { placed, orphaned } = partitionSectionsBySync(sections)
  const unplacedCandidates = buildUnplacedCandidates(project.flow, sections)
  const filteredPlaced =
    impactFilter === "all" || impactFilter === "unplaced"
      ? placed
      : placed.filter((s) => sectionMatchesImpactFilter(s, impactFilter))
  const outline = buildManualOutline(
    impactFilter === "orphaned" ? [] : filteredPlaced,
    { defaultMajorTitle: majorTitle },
  )
  const showOrphans = impactFilter === "all" || impactFilter === "orphaned"
  const showUnplaced = impactFilter === "all" || impactFilter === "unplaced"
  const hasUnplacedTools = showUnplaced && unplacedCandidates.length > 0
  const hasImpactSignal = sections.some((s) => {
    const st = s.syncStatus ?? "ok"
    return st === "needs_review" || st === "orphaned" || st === "unplaced"
  }) || unplacedCandidates.length > 0
  const showWorkspaceChrome = hasImpactSignal || hasUnplacedTools

  return (
    <div className="flex h-full">
      {!isMobile && (
        <SectionTocPanel
          outline={outline}
          sections={sections}
          orphaned={orphaned}
          activeSectionId={activeSectionId}
          onNavigateSection={scrollToSection}
          onNavigateMedium={scrollToMedium}
        />
      )}
      {/* スクロール一体: 下へ進むと操作帯が退避し、上へ戻すと再表示 */}
      <div
        ref={documentRef}
        className="scroll-touch min-w-0 flex-1 overflow-y-auto bg-muted/45"
      >
        <div className="mx-auto w-full max-w-[46rem] px-4 py-5 md:px-6 md:py-8">
          {isMobile && (
            <SectionTocBar
              outline={outline}
              activeSectionId={activeSectionId}
              onNavigateMedium={scrollToMedium}
            />
          )}

          {/* アプリ操作帯（スクロールで自然に退避） */}
          {showWorkspaceChrome && (
            <div className="mb-5 rounded-xl border border-border/70 bg-secondary/80 px-3 py-3 shadow-sm md:px-4">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                <Wrench className="size-3" aria-hidden />
                アプリ操作
              </div>
              <ManualImpactBanner
                sections={sections}
                flow={project.flow}
                filter={impactFilter}
                onFilterChange={setImpactFilter}
                onOpenRegen={() => setRegenOpen(true)}
                isMobile={isMobile}
              />
              {hasUnplacedTools && (
                <div
                  className={cn(
                    "rounded-lg border border-dashed border-[var(--semantic-warning-border)] bg-card/90 p-3 md:p-4",
                    "mt-3",
                  )}
                >
                  <h3 className="text-sm font-semibold">未配置の新規ステップ</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    フローに追加されたステップです。目次の末尾に空セクションとして追加できます。
                  </p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {unplacedCandidates.map((c) => (
                      <li
                        key={c.stepId}
                        className={cn(
                          "flex gap-2 rounded-md border bg-card px-3 py-2",
                          isMobile ? "flex-col" : "items-center justify-between",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {c.sectionNumber && (
                              <span className="font-mono text-[10px] font-bold text-primary">
                                {c.sectionNumber}
                              </span>
                            )}
                            <span className="text-sm font-medium">{c.label}</span>
                            <SyncStatusBadge status="unplaced" />
                          </div>
                        </div>
                        <Button
                          size={isMobile ? "default" : "sm"}
                          className={cn(isMobile && "h-10 w-full")}
                          onClick={() => {
                            updateProject(project.id, (p) => ({
                              ...p,
                              sections: placeUnplacedSection(
                                p.sections,
                                c,
                                p.flow,
                                p.sections[p.sections.length - 1]?.id ?? null,
                              ),
                              history: [
                                {
                                  id: `h-${Date.now()}`,
                                  date: now(),
                                  user: "山田 太郎",
                                  action: `未配置ステップ「${c.label}」をマニュアルに追加`,
                                },
                                ...p.history,
                              ],
                            }))
                          }}
                        >
                          末尾に追加
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 読み面: Notion / GitBook 系のドキュメント紙面 */}
          <div className="rounded-2xl border border-border/40 bg-card px-5 py-8 shadow-sm md:px-12 md:py-12">
            {outline.map((major) => (
              <section key={major.key} className="mb-14 last:mb-0">
                <header className="mb-10">
                  <p className="font-mono text-[13px] font-semibold tracking-wide text-primary">
                    {major.number}
                  </p>
                  <h1 className="mt-1.5 text-[1.75rem] font-bold leading-tight tracking-tight text-foreground md:text-[2rem]">
                    {major.title ?? majorTitle}
                  </h1>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {sections.filter((s) => s.status === "approved").length} / {sections.length}{" "}
                    セクション承認済み
                  </p>
                </header>
                {major.mediums.map((medium) => (
                  <div key={medium.key} className="mb-12 flex flex-col gap-6 last:mb-0">
                    <div
                      id={mediumAnchorId(medium.key)}
                      className={cn("group/medium", SCROLL_MARGIN_CLASS)}
                    >
                      <h2 className="text-xl font-semibold leading-snug tracking-tight text-foreground md:text-[1.35rem]">
                        <span className="mr-2.5 font-mono text-[0.95em] font-semibold text-muted-foreground">
                          {medium.number}
                        </span>
                        {medium.title ?? "—"}
                      </h2>
                      <div className="mt-3 h-px bg-border/70" />
                    </div>
                    <div className="flex flex-col gap-10">
                      {medium.sections.map((section) => (
                        <article key={section.id} className="min-w-0">
                          <SectionEditor
                            section={section}
                            project={project}
                            embedded
                            isMobile={isMobile}
                            onUpdate={(updater) => updateSection(section.id, updater)}
                            onReplaceProject={replaceProject}
                            onLog={logAction}
                          />
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}

            {showOrphans && orphaned.length > 0 && (
              <section className="mt-12 border-t border-[var(--semantic-danger-border)]/70 pt-8">
                <p className="text-xs font-medium text-muted-foreground">廃止候補</p>
                <h3 className="mt-1 text-base font-semibold">フローから削除されたステップ</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  本文は残しています。フローと不一致のまま残すか、反映ウィザードで廃止できます。
                </p>
                <div className="mt-5 flex flex-col gap-8">
                  {orphaned.map((section) => (
                    <article
                      key={section.id}
                      className="rounded-xl border border-[var(--semantic-danger-border)]/50 bg-[color-mix(in_oklch,var(--semantic-danger-bg)_20%,transparent)] px-4 py-4 md:px-5"
                    >
                      <SectionEditor
                        section={section}
                        project={project}
                        embedded
                        isMobile={isMobile}
                        onUpdate={(updater) => updateSection(section.id, updater)}
                        onReplaceProject={replaceProject}
                        onLog={logAction}
                      />
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <ManualRegenWizard
        project={project}
        open={regenOpen}
        onOpenChange={setRegenOpen}
        isMobile={isMobile}
        onApply={(next) => {
          replaceProject({
            ...next,
            history: [
              {
                id: `h-${Date.now()}`,
                date: now(),
                user: "山田 太郎",
                action: "フロー変更をマニュアルに選択反映",
              },
              ...next.history,
            ],
          })
        }}
      />
    </div>
  )
}

/* ================= 目次（サイドバー） ================= */

function SectionTocPanel({
  outline,
  sections,
  orphaned,
  activeSectionId,
  onNavigateSection,
  onNavigateMedium,
}: {
  outline: ReturnType<typeof buildManualOutline>
  sections: ManualSection[]
  orphaned: ManualSection[]
  activeSectionId: string | null
  onNavigateSection: (id: string) => void
  onNavigateMedium: (mediumKey: string, sectionId?: string) => void
}) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r bg-muted/25">
      <div className="page-header border-b px-4 py-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <ListTree className="size-4 text-muted-foreground" />
          目次
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          ナビ · {sections.filter((s) => s.status === "approved").length} / {sections.length} 承認済み
        </div>
      </div>
      <div className="scroll-touch min-h-0 flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-3">
          {outline.map((major) => (
            <div key={major.key} className="overflow-hidden rounded-lg border bg-card/80">
              <div className="border-b bg-muted/50 px-3 py-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs font-bold tabular-nums text-primary">{major.number}</span>
                  <span className="min-w-0 text-[11px] font-semibold leading-snug">{major.title}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1 p-2">
                {major.mediums.map((medium) => (
                  <div key={medium.key} className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => onNavigateMedium(medium.key, medium.sections[0]?.id)}
                      className={cn(
                        "w-full rounded-md border px-1.5 py-1.5 text-left transition-colors",
                        medium.sections.some((s) => s.id === activeSectionId)
                          ? "border-primary/50 bg-primary-subtle/30"
                          : "border-transparent hover:bg-muted/40",
                      )}
                    >
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-[10px] font-semibold tabular-nums text-muted-foreground">
                          {medium.number}
                        </span>
                        <span className="text-[10px] font-medium leading-snug text-foreground/80">
                          {medium.title}
                        </span>
                      </div>
                    </button>
                    {medium.sections.length > 1 &&
                      medium.sections.map((s) => (
                        <TocItem
                          key={s.id}
                          section={s}
                          active={activeSectionId === s.id}
                          onNavigate={() => onNavigateSection(s.id)}
                        />
                      ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {orphaned.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-[var(--semantic-danger-border)] bg-card/80">
              <div className="border-b bg-[color-mix(in_oklch,var(--semantic-danger-bg)_60%,transparent)] px-3 py-2">
                <span className="text-[11px] font-semibold">廃止候補</span>
              </div>
              <div className="flex flex-col gap-1 p-2">
                {orphaned.map((s) => (
                  <TocItem
                    key={s.id}
                    section={s}
                    active={activeSectionId === s.id}
                    onNavigate={() => onNavigateSection(s.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

function SectionTocBar({
  outline,
  activeSectionId,
  onNavigateMedium,
}: {
  outline: ReturnType<typeof buildManualOutline>
  activeSectionId: string | null
  onNavigateMedium: (mediumKey: string, sectionId?: string) => void
}) {
  const items = outline.flatMap((major) =>
    major.mediums.map((medium) => ({
      key: medium.key,
      sectionId: medium.sections[0]?.id,
      number: medium.number,
      title: medium.title,
    })),
  )

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-border/60 bg-muted/90 px-4 py-2 backdrop-blur-sm md:-mx-8 md:px-8">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onNavigateMedium(item.key, item.sectionId)}
            title={item.title}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold tabular-nums transition-colors",
              item.sectionId && activeSectionId === item.sectionId
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted/50 text-muted-foreground",
            )}
          >
            {item.number}
          </button>
        ))}
      </div>
    </div>
  )
}

function TocItem({
  section,
  active,
  onNavigate,
}: {
  section: ManualSection
  active: boolean
  onNavigate: () => void
}) {
  const num = resolveSectionNumber(section)
  const confirms = section.blocks.filter((b) => b.needsConfirm).length

  return (
    <button
      type="button"
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
        active
          ? "border-primary/60 bg-primary-subtle/40 ring-2 ring-primary/15"
          : "border-transparent bg-background hover:border-primary/25 hover:bg-muted/30",
      )}
    >
      <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-primary">{num || "—"}</span>
      {(section.syncStatus ?? "ok") !== "ok" && <SyncStatusBadge status={section.syncStatus} />}
      <Badge variant="outline" className={cn("ml-auto h-5 shrink-0 text-[9px]", SECTION_STYLE[section.status])}>
        {SECTION_LABEL[section.status]}
      </Badge>
      {confirms > 0 && (
        <AlertTriangle className={cn("size-3 shrink-0", WARNING_TEXT)} />
      )}
    </button>
  )
}

/* ================= セクションエディタ ================= */

function SectionEditor({
  section,
  project,
  onUpdate,
  onReplaceProject,
  onLog,
  isMobile,
  embedded,
}: {
  section: ManualSection
  project: Project
  onUpdate: (updater: (s: ManualSection) => ManualSection) => void
  onReplaceProject: (next: Project) => void
  onLog: (action: string) => void
  isMobile?: boolean
  embedded?: boolean
}) {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [blockDraft, setBlockDraft] = useState("")
  const [regenerating, setRegenerating] = useState(false)

  const confirms = section.blocks.filter((b) => b.needsConfirm).length
  const canApprove = confirms === 0 && section.status !== "approved"
  const sync = section.syncStatus ?? "ok"

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
    onReplaceProject(
      appendRevision(
        {
          ...project,
          sections: project.sections.map((s) =>
            s.id === section.id
              ? { ...s, status: "approved", version: s.version + 1, updatedAt: today() }
              : s,
          ),
        },
        snapshotSection(
          { ...section, status: "approved", version: section.version + 1, updatedAt: today() },
          { reason: "approve", user: "山田 太郎" },
        ),
      ),
    )
    onLog(`セクション「${section.title}」を承認(v${section.version + 1})`)
  }

  const regenerate = () => {
    setRegenerating(true)
    window.setTimeout(() => {
      const withSnapshot = appendRevision(
        project,
        snapshotSection(section, { reason: "regenerate", user: "山田 太郎" }),
      )
      onReplaceProject({
        ...withSnapshot,
        sections: withSnapshot.sections.map((s) =>
          s.id === section.id
            ? {
                ...s,
                status: "draft",
                version: s.version + 1,
                updatedAt: today(),
                blocks: s.blocks.map((b) => ({ ...b })),
              }
            : s,
        ),
      })
      onLog(`セクション「${section.title}」をAIで部分再生成(他セクションへの影響なし)`)
      setRegenerating(false)
    }, 900)
  }

  let stepNo = 0
  const sectionNum = resolveSectionNumber(section)
  const sectionTitle = displaySectionTitle(section)

  const syncActions =
    sync === "needs_review" || sync === "orphaned" ? (
      <details className="rounded-lg border border-border/60 bg-muted/30 open:bg-muted/40">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Workflow className="size-3.5 text-muted-foreground" />
              フロー同期
              <SyncStatusBadge status={section.syncStatus} />
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </span>
        </summary>
        <div className={cn("flex gap-2 border-t border-border/50 px-3 py-3", isMobile && "flex-col")}>
          {sync === "needs_review" && (
            <Button
              variant="outline"
              size={isMobile ? "default" : "sm"}
              className={cn(isMobile && "h-10 w-full")}
              onClick={() => {
                onUpdate((s) => clearManualReview(s, project.flow))
                onLog(`セクション「${section.title}」の要確認を解除`)
              }}
            >
              要確認を解除
            </Button>
          )}
          <Button
            variant="outline"
            size={isMobile ? "default" : "sm"}
            className={cn(isMobile && "h-10 w-full")}
            onClick={() => {
              onUpdate((s) => markIntentionalDifference(s))
              onLog(`セクション「${section.title}」をフローと不一致のまま残す`)
            }}
          >
            フローと不一致のまま残す
          </Button>
        </div>
      </details>
    ) : null

  const actionToolbar = (
    <div
      className={cn(
        "flex gap-1.5",
        isMobile ? "flex-wrap" : "flex-wrap items-center justify-end",
      )}
      role="toolbar"
      aria-label="セクション操作"
    >
      <SectionHistoryButton
        project={project}
        sectionId={section.id}
        isMobile={isMobile}
        onRestore={(next) => {
          onReplaceProject(next)
          onLog(`セクション「${section.title}」を過去版から復元`)
        }}
      />
      {isMobile ? (
        <>
          <Button
            variant="ghost"
            size="default"
            className="h-10 flex-1 gap-1"
            onClick={regenerate}
            disabled={regenerating}
          >
            <RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} />
            {regenerating ? "再生成中…" : "AI再生成"}
          </Button>
          <Button
            size="default"
            className="h-10 flex-1 gap-1"
            disabled={!canApprove}
            onClick={approve}
          >
            <BadgeCheck className="size-4" />
            {section.status === "approved" ? "承認済み" : "承認する"}
          </Button>
        </>
      ) : (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={regenerate} disabled={regenerating}>
                <RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} />
                {regenerating ? "再生成中…" : "AI再生成"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>このセクションのみ再生成します。他セクションには影響しません</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button size="sm" variant={canApprove ? "default" : "ghost"} className="gap-1" disabled={!canApprove} onClick={approve}>
                  <BadgeCheck className="size-4" />
                  {section.status === "approved" ? "承認済み" : "承認する"}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {confirms > 0
                ? `「要確認」が ${confirms} 件残っているため承認できません`
                : "内容を確認して承認済みにします"}
            </TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  )

  return (
    <div className={cn(!embedded && "flex h-full flex-col scroll-touch overflow-y-auto")}>
      <div
        className={cn(
          !embedded && "mx-auto w-full max-w-3xl flex-1 px-4 py-4 md:px-8 md:py-8",
          embedded && "pb-1",
          isMobile && !embedded && "scroll-touch overflow-y-auto pb-4",
        )}
      >
        {/* ドキュメント見出し + 操作（読み物レイアウト優先） */}
        <div
          id={sectionAnchorId(section.id)}
          className={cn("min-w-0", SCROLL_MARGIN_CLASS)}
        >
          <div className={cn("flex gap-3", isMobile ? "flex-col" : "items-start justify-between")}>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2.5">
                {sectionNum && !embedded && (
                  <span className="mt-1 shrink-0 font-mono text-sm font-semibold tabular-nums text-muted-foreground">
                    {sectionNum}
                  </span>
                )}
                <div className="min-w-0">
                  {embedded ? (
                    <h3 className="text-[1.05rem] font-semibold leading-snug tracking-tight text-foreground md:text-lg">
                      {sectionTitle}
                    </h3>
                  ) : (
                    <h2 className="text-xl font-bold tracking-tight md:text-2xl">{sectionTitle}</h2>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <Badge variant="outline" className={cn("h-5 text-[10px]", SECTION_STYLE[section.status])}>
                      {SECTION_LABEL[section.status]}
                    </Badge>
                    {sync !== "ok" && <SyncStatusBadge status={section.syncStatus} />}
                    <span>v{section.version}</span>
                    <span>·</span>
                    <span>{section.updatedAt}</span>
                  </div>
                </div>
              </div>
            </div>
            {!isMobile && <div className="shrink-0 pt-0.5">{actionToolbar}</div>}
            {isMobile && embedded && <div className="w-full">{actionToolbar}</div>}
          </div>
        </div>

        {isMobile && !embedded
          ? syncActions
            ? <div className="mt-3">{syncActions}</div>
            : null
          : syncActions
            ? <div className="mt-3">{syncActions}</div>
            : null}

        {confirms > 0 && (
          <div className={cn("mt-3 flex items-start gap-2 px-3 py-2.5 text-[12px] leading-relaxed md:text-[13px]", WARNING_BOX)}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            AIが推測で補完した「要確認」箇所が {confirms} 件あります。内容を確認し、すべて解消すると承認できます。
          </div>
        )}

        {sync === "needs_review" && (
          <div className={cn("mt-3 flex items-start gap-2 px-3 py-2.5 text-[12px] leading-relaxed md:text-[13px]", WARNING_BOX)}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            対応するフローステップが変更されています。本文は保護中です。内容を見直すか、フローと不一致のまま残してください。
          </div>
        )}

        {sync === "orphaned" && (
          <div className={cn("mt-3 flex items-start gap-2 px-3 py-2.5 text-[12px] leading-relaxed md:text-[13px]", WARNING_BOX)}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            フロー上のステップが削除されています。このセクションは廃止候補です。
          </div>
        )}

        {/* マニュアル本文面 */}
        <div className={cn("mt-5", !embedded && "mt-6")}>
          <div className="flex flex-col gap-1">
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
                  onAttachImage={async (file) => {
                    const image = await readImageFile(file)
                    updateBlock(block.id, (b) => ({ ...b, image }))
                  }}
                  onRemoveImage={() => updateBlock(block.id, (b) => ({ ...b, image: undefined }))}
                  onUpdateImageCaption={(caption) =>
                    updateBlock(block.id, (b) =>
                      b.image ? { ...b, image: { ...b.image, caption } } : b,
                    )
                  }
                />
              )
            })}
          </div>
        </div>
      </div>

      {isMobile && !embedded && (
        <div className="shrink-0 border-t bg-muted/40 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
          {actionToolbar}
          {confirms > 0 && (
            <p className={cn("mt-2 text-center text-[10px]", WARNING_TEXT)}>
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
  onAttachImage,
  onRemoveImage,
  onUpdateImageCaption,
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
  onAttachImage: (file: File) => Promise<void>
  onRemoveImage: () => void
  onUpdateImageCaption: (caption: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [imageOpen, setImageOpen] = useState(Boolean(block.image?.url))
  const [imageError, setImageError] = useState<string | null>(null)
  const [captionDraft, setCaptionDraft] = useState(block.image?.caption ?? "")
  const [uploading, setUploading] = useState(false)

  const pickImage = () => {
    setImageError(null)
    fileRef.current?.click()
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    const validationError = validateImageFile(file)
    if (validationError) {
      setImageError(validationError)
      return
    }

    setUploading(true)
    setImageError(null)
    try {
      await onAttachImage(file)
      setImageOpen(true)
      setCaptionDraft(file.name.replace(/\.[^.]+$/, ""))
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "画像の添付に失敗しました")
    } finally {
      setUploading(false)
    }
  }

  const saveCaption = () => {
    onUpdateImageCaption(captionDraft.trim() || "画像")
  }

  return (
    <div
      className={cn(
        "group relative -mx-2 rounded-md px-2 py-2.5 transition-colors",
        block.needsConfirm && WARNING_SUBTLE,
        !block.needsConfirm && "hover:bg-muted/35",
        block.type === "note" && !block.needsConfirm && "border-l-2 border-[var(--semantic-warning-border)] bg-[color-mix(in_oklch,var(--semantic-warning-bg)_35%,transparent)] pl-3",
      )}
    >
      {editing ? (
        <div>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-24 text-[15px] leading-relaxed" autoFocus />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <X className="size-3.5" />
              キャンセル
            </Button>
            <Button size="sm" onClick={onSave} disabled={!draft.trim()}>
              <Check className="size-3.5" />
              保存
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            {stepNo !== undefined && (
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border/80 bg-background text-[12px] font-semibold tabular-nums text-muted-foreground">
                {stepNo}
              </span>
            )}
            {block.type === "note" && (
              <StickyNote className={cn("mt-1 size-4 shrink-0", WARNING_TEXT)} />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-[15px] leading-[1.8] text-foreground/95",
                  block.type === "note" && cn("text-[13.5px] leading-relaxed", WARNING_TEXT),
                )}
              >
                {block.text}
              </p>

              {block.needsConfirm && (
                <div className="mt-3 rounded-lg border border-[var(--semantic-warning-border)]/80 bg-card/80 px-3 py-2.5">
                  <Badge variant="outline" className={cn("h-auto w-fit gap-1 px-2 py-1 text-[10px] leading-snug", SEMANTIC.warning)}>
                    <AlertTriangle className="size-2.5 shrink-0" />
                    要確認: AIが推測で補完した内容です
                  </Badge>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 px-3 text-[11px]"
                      onClick={onResolveConfirm}
                    >
                      <Check className="size-3.5" />
                      内容OK
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1 px-3 text-[11px]" onClick={onStartEdit}>
                      <Pencil className="size-3.5" />
                      修正する
                    </Button>
                  </div>
                </div>
              )}

              <BlockImageSection
                block={block}
                imageOpen={imageOpen}
                setImageOpen={setImageOpen}
                captionDraft={captionDraft}
                setCaptionDraft={setCaptionDraft}
                imageError={imageError}
                uploading={uploading}
                fileRef={fileRef}
                onFileChange={onFileChange}
                onPickImage={pickImage}
                onRemoveImage={onRemoveImage}
                onSaveCaption={saveCaption}
              />
            </div>

            {!block.needsConfirm && (
              <button
                className={cn(
                  "mt-0.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground",
                  isMobile ? "opacity-100" : "opacity-0 transition-opacity group-hover:opacity-100",
                )}
                onClick={onStartEdit}
                aria-label="このブロックを編集"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function BlockImageSection({
  block,
  imageOpen,
  setImageOpen,
  captionDraft,
  setCaptionDraft,
  imageError,
  uploading,
  fileRef,
  onFileChange,
  onPickImage,
  onRemoveImage,
  onSaveCaption,
}: {
  block: ManualBlock
  imageOpen: boolean
  setImageOpen: (open: boolean) => void
  captionDraft: string
  setCaptionDraft: (v: string) => void
  imageError: string | null
  uploading: boolean
  fileRef: React.RefObject<HTMLInputElement | null>
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPickImage: () => void
  onRemoveImage: () => void
  onSaveCaption: () => void
}) {
  const image = block.image

  return (
    <div className="mt-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={onFileChange}
      />

      {image ? (
        <>
          <div className="mt-1.5 flex flex-wrap items-center gap-1 rounded-md border border-dashed border-border/70 bg-muted/30 px-2 py-1.5">
            <button
              type="button"
              onClick={() => setImageOpen(!imageOpen)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-background/80"
            >
              <ImageIcon className="size-3" />
              {image.url ? "画像を見る" : "プレースホルダ"}
              <ChevronDown className={cn("size-3 transition-transform", imageOpen && "rotate-180")} />
            </button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={onPickImage}
              disabled={uploading}
            >
              <ImagePlus className="size-3" />
              {uploading ? "読込中…" : image.url ? "変更" : "画像を添付"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
              onClick={onRemoveImage}
            >
              <Trash2 className="size-3" />
              削除
            </Button>
          </div>
          {imageOpen && (
            <figure className="mt-2 overflow-hidden rounded-lg border">
              {image.url ? (
                <img
                  src={image.url}
                  alt={image.caption}
                  className="max-h-80 w-full bg-muted/30 object-contain"
                />
              ) : (
                <div
                  className="flex h-40 items-center justify-center px-3 text-center text-xs leading-relaxed text-muted-foreground"
                  style={{ background: image.color ?? "var(--muted)" }}
                >
                  <span className="max-w-full rounded bg-white/80 px-3 py-2 break-words dark:bg-black/40">
                    画像未添付（「画像を添付」から追加）
                  </span>
                </div>
              )}
              <figcaption className="border-t bg-muted/30 px-3 py-2">
                <Textarea
                  value={captionDraft}
                  onChange={(e) => setCaptionDraft(e.target.value)}
                  onBlur={onSaveCaption}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      onSaveCaption()
                      ;(e.target as HTMLTextAreaElement).blur()
                    }
                  }}
                  placeholder="キャプション（画像の説明）"
                  rows={2}
                  className="min-h-[2.5rem] resize-y border-0 bg-transparent px-0 py-0 text-[12px] leading-relaxed shadow-none focus-visible:ring-0"
                />
              </figcaption>
            </figure>
          )}
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-1.5 h-8 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={onPickImage}
          disabled={uploading}
        >
          <ImagePlus className="size-3.5" />
          {uploading ? "読込中…" : "画像を添付"}
        </Button>
      )}

      {imageError && (
        <p className="mt-1.5 text-[11px] text-destructive">{imageError}</p>
      )}
    </div>
  )
}
