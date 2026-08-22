import { useEffect, useRef, useState } from "react"
import {
  ClipboardList,
  AlertTriangle,
  Check,
  ChevronDown,
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
import { now, today } from "@/lib/project-utils"
import { useAppSession } from "@/lib/api/use-app-session"
import { actorName } from "@/lib/actor"
import {
  buildManualOutline,
  displaySectionTitle,
  resolveLeafSectionNumber,
  resolveSectionNumber,
  shouldShowLeafNumber,
} from "@/lib/manual-outline"
import {
  buildUnplacedCandidates,
  clearManualReview,
  markIntentionalDifference,
  partitionSectionsBySync,
} from "@/lib/manual-impact"
import { placeUnplacedSection } from "@/lib/manual-regen"
import {
  acknowledgeDeepdiveReview,
  deepdiveItemForStep,
  sectionNeedsDeepdiveReview,
  sectionNeedsFlowReview,
  stampAllSectionsDeepdive,
  stampDeepdiveOnSection,
} from "@/lib/manual-deepdive-sync"
import {
  acknowledgeHearingReview,
  sectionNeedsHearingReview,
  stampAllSectionsHearing,
  stampHearingOnSection,
} from "@/lib/manual-hearing-sync"
import { appendRevision, snapshotSection } from "@/lib/manual-version"
import { readImageFile, validateImageFile } from "@/lib/manual-image"
import { isFilenameLikeCaption } from "@/lib/caption-quality"
import { resolveMediaFetchUrl } from "@/lib/resolve-export-image"
import { REVIEW_STATUS, WARNING_TEXT, WARNING_BOX, WARNING_SUBTLE } from "@/lib/semantic-styles"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GenerationProgress } from "@/components/GenerationProgress"
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
import { DeepdiveStaleBanner } from "@/features/manual/DeepdiveStaleBanner"
import { HearingStaleBanner } from "@/features/manual/HearingStaleBanner"
import { SectionHistoryButton } from "@/features/manual/SectionHistoryPanel"
import { aiGenerateManualSections, aiRegenerateSection } from "@/lib/api/ai"
import { describeAiError } from "@/lib/api/errors"
import { fetchProject } from "@/lib/api/projects"

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

/** アプリUI（操作・メタ）— マニュアル本文と区別するクローム */
const APP_CHROME =
  "rounded-lg border border-border/70 bg-muted/40 text-muted-foreground shadow-none"
const APP_CHROME_LABEL =
  "inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"

interface Props {
  project: Project
  updateProject: UpdateProject
  setTab: (t: ProjectTab) => void
}

export function ManualTab({ project, updateProject, setTab }: Props) {
  const isMobile = useIsMobile()
  const { user } = useAppSession()
  const actor = actorName(user)
  const sections = project.sections
  const majorTitle = resolveMajorTitle(project)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(sections[0]?.id ?? null)
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState(0)
  const [genError, setGenError] = useState<string | null>(null)
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
  const generateSections = async () => {
    setGenerating(true)
    setGenProgress(0)
    setGenError(null)
    try {
      const { sections: generated } = await aiGenerateManualSections(project.id, (p) =>
        setGenProgress(p),
      )
      // ジョブ実行中にサーバー側が更新されている可能性があるため最新を取り直して合成する
      const latest = await fetchProject(project.id).catch(() => null)

      updateProject(project.id, (p) => {
        const base = latest ?? p
        let next: Project = {
          ...base,
          status: base.status === "deepdive" ? "manual" : base.status,
          sections: stampAllSectionsHearing(
            stampAllSectionsDeepdive(generated, base.deepdive),
            base.hearingAnswers,
          ),
          history: [
            { id: `h-${Date.now()}`, date: now(), user: actor, action: `マニュアルを生成(全${generated.length}セクション)` },
            ...base.history,
          ],
        }
        for (const section of generated) {
          next = appendRevision(next, snapshotSection(section, { reason: "generate", user: actor }))
        }
        return next
      })
    } catch (err) {
      setGenError(describeAiError(err, "マニュアルの生成に失敗しました"))
    } finally {
      setGenerating(false)
    }
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
            フロー図のセクションごとにマニュアルを生成します。AIが推測で補った箇所には「要確認」が付くので、内容を直しながら完成させてください。
          </p>
          {!ready && (
            <p className={cn("mt-3 text-xs", WARNING_TEXT)}>
              深掘りヒアリングが未回答のため、生成してもプレースホルダが多くなります
            </p>
          )}
          {generating ? (
            <GenerationProgress
              className="mt-5"
              value={genProgress}
              label="マニュアルを生成しています"
              description="深掘りヒアリングの回答をもとに、セクションごとの手順を組み立てています。"
            />
          ) : (
            <Button className="mt-5 gap-1.5" onClick={generateSections}>
              <Sparkles className="size-4" />
              マニュアルを生成する
            </Button>
          )}
          {genError && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-left text-xs leading-relaxed text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-medium">生成に失敗しました: </span>
                {genError}
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  const logAction = (action: string) => {
    updateProject(project.id, (p) => ({
      ...p,
      history: [{ id: `h-${Date.now()}`, date: now(), user: actor, action }, ...p.history],
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
  const hasImpactSignal =
    sections.some((s) => {
      const st = s.syncStatus ?? "ok"
      return st === "needs_review" || st === "orphaned" || st === "unplaced"
    }) ||
    unplacedCandidates.length > 0 ||
    project.sections.some((s) => sectionNeedsDeepdiveReview(s, project)) ||
    project.sections.some((s) => sectionNeedsHearingReview(s, project))
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
              <DeepdiveStaleBanner
                project={project}
                isMobile={isMobile}
                onShowStaleSections={() => setImpactFilter("needs_review")}
              />
              <HearingStaleBanner
                project={project}
                isMobile={isMobile}
                onShowStaleSections={() => setImpactFilter("needs_review")}
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
                                  user: actor,
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

          {/* 読み面: マニュアル本文のみを紙面に。アプリUIは帯で分離 */}
          <div className="overflow-hidden rounded-2xl border border-border/40 bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/45 px-4 py-2.5 text-muted-foreground md:px-8">
              <span className={APP_CHROME_LABEL}>
                <Wrench className="size-3" aria-hidden />
                編集画面
              </span>
              <span className="text-[11px]">
                {(() => {
                  const confirms = sections.reduce(
                    (acc, s) => acc + s.blocks.filter((b) => b.needsConfirm).length,
                    0,
                  )
                  return confirms > 0
                    ? `要確認 ${confirms} 件 · ${sections.length} セクション`
                    : `${sections.length} セクション`
                })()}
              </span>
            </div>

            <div className="px-5 py-8 md:px-12 md:py-12">
              {outline.map((major) => (
                <section key={major.key} className="mb-14 last:mb-0">
                  <header className="mb-10">
                    <p className="font-mono text-[13px] font-semibold tracking-wide text-primary">
                      {major.number}
                    </p>
                    <h1 className="mt-1.5 text-[1.75rem] font-bold leading-tight tracking-tight text-foreground md:text-[2rem]">
                      {major.title ?? majorTitle}
                    </h1>
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
                        {medium.sections.map((section, si) => {
                          const leaf = resolveLeafSectionNumber(
                            section,
                            medium.number,
                            si,
                            medium.sections.length,
                          )
                          return (
                          <article key={section.id} className="min-w-0">
                            <SectionEditor
                              section={section}
                              leafNumber={
                                shouldShowLeafNumber(leaf, medium.number, medium.sections.length)
                                  ? leaf
                                  : ""
                              }
                              project={project}
                              embedded
                              isMobile={isMobile}
                              onUpdate={(updater) => updateSection(section.id, updater)}
                              onReplaceProject={replaceProject}
                              onLog={logAction}
                            />
                          </article>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </section>
              ))}

              {showOrphans && orphaned.length > 0 && (
                <section className="mt-12 border-t border-border/60 pt-8">
                  <div className={cn("mb-4 px-3 py-2.5", APP_CHROME)}>
                    <p className={APP_CHROME_LABEL}>
                      <Wrench className="size-3" aria-hidden />
                      アプリ操作 · 廃止候補
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-foreground">
                      フローから削除されたステップ
                    </h3>
                    <p className="mt-0.5 text-xs">
                      本文は残しています。フローと不一致のまま残すか、反映ウィザードで廃止できます。
                    </p>
                  </div>
                  <div className="flex flex-col gap-8">
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
                user: actor,
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
          {(() => {
            const confirms = sections.reduce(
              (acc, s) => acc + s.blocks.filter((b) => b.needsConfirm).length,
              0,
            )
            return confirms > 0
              ? `ナビ · 要確認 ${confirms} 件 · ${sections.length} セクション`
              : `ナビ · ${sections.length} セクション`
          })()}
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
                      medium.sections.map((s, si) => (
                        <TocItem
                          key={s.id}
                          section={s}
                          leafNumber={resolveLeafSectionNumber(
                            s,
                            medium.number,
                            si,
                            medium.sections.length,
                          )}
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
              "flex max-w-[10rem] shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors",
              item.sectionId && activeSectionId === item.sectionId
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted/50 text-muted-foreground",
            )}
          >
            <span className="font-mono tabular-nums">{item.number}</span>
            {item.title && <span className="truncate font-medium">{item.title}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

function TocItem({
  section,
  leafNumber,
  active,
  onNavigate,
}: {
  section: ManualSection
  leafNumber?: string
  active: boolean
  onNavigate: () => void
}) {
  const num = leafNumber !== undefined ? leafNumber : resolveSectionNumber(section)
  const confirms = section.blocks.filter((b) => b.needsConfirm).length

  const title = displaySectionTitle(section)

  return (
    <button
      type="button"
      onClick={onNavigate}
      title={title}
      className={cn(
        "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
        active
          ? "border-primary/60 bg-primary-subtle/40 ring-2 ring-primary/15"
          : "border-transparent bg-background hover:border-primary/25 hover:bg-muted/30",
      )}
    >
      <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-primary">{num || "—"}</span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-snug text-foreground">
        {title}
      </span>
      {(section.syncStatus ?? "ok") !== "ok" && <SyncStatusBadge status={section.syncStatus} />}
      <Badge variant="outline" className={cn("h-5 shrink-0 text-[9px]", SECTION_STYLE[section.status])}>
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
  leafNumber,
  project,
  onUpdate,
  onReplaceProject,
  onLog,
  isMobile,
  embedded,
}: {
  section: ManualSection
  /** 中項目配下の小項目項番（例: 1.1.1）。未指定時は sectionNumber をそのまま使う */
  leafNumber?: string
  project: Project
  onUpdate: (updater: (s: ManualSection) => ManualSection) => void
  onReplaceProject: (next: Project) => void
  onLog: (action: string) => void
  isMobile?: boolean
  embedded?: boolean
}) {
  const { user } = useAppSession()
  const actor = actorName(user)
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [blockDraft, setBlockDraft] = useState("")
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState<string | null>(null)

  const confirms = section.blocks.filter((b) => b.needsConfirm).length
  const sync = section.syncStatus ?? "ok"
  const deepdiveReview = sectionNeedsDeepdiveReview(section, project)
  const hearingReview = sectionNeedsHearingReview(section, project)
  const flowReview = sectionNeedsFlowReview(section, project)

  const updateBlock = (blockId: string, updater: (b: ManualBlock) => ManualBlock) => {
    onUpdate((s) => ({
      ...s,
      // 公開スナップショットとの差分を残すため、旧承認ステータスは編集時に review へ
      status: s.status === "approved" ? "review" : s.status,
      updatedAt: today(),
      blocks: s.blocks.map((b) => (b.id === blockId ? updater(b) : b)),
    }))
  }

  const regenerate = async () => {
    if (
      !window.confirm(
        `「${section.title}」をAIで再生成します。現在の本文は版履歴に残りますが、表示内容は置き換わります。よろしいですか？`,
      )
    ) {
      return
    }
    setRegenerating(true)
    setRegenError(null)
    try {
      const { section: regenerated } = await aiRegenerateSection(project.id, section.id)
      const withSnapshot = appendRevision(
        project,
        snapshotSection(section, { reason: "regenerate", user: actor }),
      )
      const item = deepdiveItemForStep(withSnapshot, section.stepId ?? "")
      const merged = stampHearingOnSection(
        stampDeepdiveOnSection(regenerated, item),
        project.hearingAnswers,
      )
      onReplaceProject({
        ...withSnapshot,
        sections: withSnapshot.sections.map((s) => (s.id === section.id ? merged : s)),
      })
      onLog(`セクション「${section.title}」をAIで部分再生成(他セクションへの影響なし)`)
    } catch (err) {
      setRegenError(describeAiError(err, "セクションの再生成に失敗しました"))
    } finally {
      setRegenerating(false)
    }
  }

  let stepNo = 0
  const sectionNum = leafNumber !== undefined ? leafNumber : resolveSectionNumber(section)
  const sectionTitle = displaySectionTitle(section)
  // 要確認が消え、フロー同期も問題なければ操作帯を畳んで読み面を優先
  const chromeCollapsed = confirms === 0 && sync === "ok"

  const syncActions =
    sync === "orphaned" ? (
      <details className={cn(APP_CHROME, "open:bg-muted/55")}>
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Workflow className="size-3.5 text-muted-foreground" />
              <span className={APP_CHROME_LABEL}>アプリ操作</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-foreground">廃止候補</span>
              <SyncStatusBadge status={section.syncStatus} />
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </span>
        </summary>
        <div className={cn("flex gap-2 border-t border-border/50 px-3 py-3", isMobile && "flex-col")}>
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
    ) : hearingReview ? (
      <details className={cn(APP_CHROME, "open:bg-muted/55")} open>
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <ClipboardList className="size-3.5 text-muted-foreground" />
              <span className={APP_CHROME_LABEL}>アプリ操作</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-foreground">骨組みヒアリングの更新</span>
              <SyncStatusBadge status="needs_review" />
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </span>
        </summary>
        <div className={cn("space-y-2 border-t border-border/50 px-3 py-3 text-xs text-muted-foreground", isMobile && "space-y-3")}>
          <p>
            骨組みヒアリングの回答が変わりました。フロー図タブで見直しのうえ、必要なら「AI再生成」で本文を更新してください。手修正で足りる場合は「骨組みを反映済み」を選んでください。
          </p>
          <div className={cn("flex gap-2", isMobile && "flex-col")}>
            <Button
              variant="outline"
              size={isMobile ? "default" : "sm"}
              className={cn("gap-1", isMobile && "h-10 w-full")}
              onClick={regenerate}
              disabled={regenerating}
            >
              <RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} />
              AI再生成
            </Button>
            <Button
              variant="outline"
              size={isMobile ? "default" : "sm"}
              className={cn(isMobile && "h-10 w-full")}
              onClick={() => {
                onUpdate((s) => acknowledgeHearingReview(s, project.hearingAnswers))
                onLog(`セクション「${section.title}」を骨組み反映済みとして確認`)
              }}
            >
              骨組みを反映済み
            </Button>
          </div>
        </div>
      </details>
    ) : deepdiveReview ? (
      <details className={cn(APP_CHROME, "open:bg-muted/55")} open>
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <StickyNote className="size-3.5 text-muted-foreground" />
              <span className={APP_CHROME_LABEL}>アプリ操作</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-foreground">深掘り回答の更新</span>
              <SyncStatusBadge status="needs_review" />
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </span>
        </summary>
        <div className={cn("space-y-2 border-t border-border/50 px-3 py-3 text-xs text-muted-foreground", isMobile && "space-y-3")}>
          <p>
            深掘りヒアリングの内容が変わりました。上の「AI再生成」で本文を更新するか、手で直したうえで「深掘りを反映済み」を選んでください。
          </p>
          <div className={cn("flex gap-2", isMobile && "flex-col")}>
            <Button
              variant="outline"
              size={isMobile ? "default" : "sm"}
              className={cn("gap-1", isMobile && "h-10 w-full")}
              onClick={regenerate}
              disabled={regenerating}
            >
              <RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} />
              AI再生成
            </Button>
            <Button
              variant="outline"
              size={isMobile ? "default" : "sm"}
              className={cn(isMobile && "h-10 w-full")}
              onClick={() => {
                const item = deepdiveItemForStep(project, section.stepId ?? "")
                onUpdate((s) => acknowledgeDeepdiveReview(s, item))
                onLog(`セクション「${section.title}」を深掘り反映済みとして確認`)
              }}
            >
              深掘りを反映済み
            </Button>
          </div>
        </div>
      </details>
    ) : flowReview ? (
      <details className={cn(APP_CHROME, "open:bg-muted/55")}>
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Workflow className="size-3.5 text-muted-foreground" />
              <span className={APP_CHROME_LABEL}>アプリ操作</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-foreground">フロー同期</span>
              <SyncStatusBadge status={section.syncStatus} />
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </span>
        </summary>
        <div className={cn("flex gap-2 border-t border-border/50 px-3 py-3", isMobile && "flex-col")}>
          <Button
            variant="outline"
            size={isMobile ? "default" : "sm"}
            className={cn(isMobile && "h-10 w-full")}
            onClick={() => {
              onUpdate((s) => clearManualReview(s, project.flow))
              onLog(`セクション「${section.title}」のフロー要確認を解除`)
            }}
          >
            フローと一致している
          </Button>
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
      className={cn("flex gap-1.5", isMobile ? "flex-wrap" : "flex-wrap items-center")}
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
        <Button
          variant="outline"
          size="default"
          className="h-10 flex-1 gap-1"
          onClick={regenerate}
          disabled={regenerating}
        >
          <RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} />
          {regenerating ? "再生成中…" : "AI再生成"}
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1" onClick={regenerate} disabled={regenerating}>
              <RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} />
              {regenerating ? "再生成中…" : "AI再生成"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>このセクションのみ再生成します。他セクションには影響しません</TooltipContent>
        </Tooltip>
      )}
      {section.status !== "approved" ? (
        <Button
          variant="default"
          size={isMobile ? "default" : "sm"}
          className={cn("gap-1", isMobile && "h-10 flex-1")}
          onClick={() => {
            onUpdate((s) => ({ ...s, status: "approved", updatedAt: today() }))
            onLog(`セクション「${section.title}」を確定`)
          }}
        >
          <Check className="size-3.5" />
          確定
        </Button>
      ) : (
        <Button
          variant="outline"
          size={isMobile ? "default" : "sm"}
          className={cn("gap-1", isMobile && "h-10 flex-1")}
          onClick={() => {
            onUpdate((s) => ({ ...s, status: "review", updatedAt: today() }))
            onLog(`セクション「${section.title}」を編集中に戻した`)
          }}
        >
          <Pencil className="size-3.5" />
          編集中に戻す
        </Button>
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
        {/* ① マニュアル本文の見出し */}
        <div
          id={sectionAnchorId(section.id)}
          className={cn("min-w-0", SCROLL_MARGIN_CLASS)}
        >
          <div className="flex items-start gap-2.5">
            {sectionNum && (
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
            </div>
          </div>
        </div>

        {/* ② アプリUI（メタ・操作）— 要確認解消後は畳んで読み面を優先 */}
        {!(isMobile && !embedded) && (
          chromeCollapsed ? (
            <details className={cn("mt-3", APP_CHROME, "open:bg-muted/55")}>
              <summary className="cursor-pointer list-none px-3 py-2 text-xs marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className={APP_CHROME_LABEL}>
                      <Wrench className="size-3" aria-hidden />
                      アプリ操作
                    </span>
                    <Badge variant="outline" className={cn("h-5 text-[10px]", SECTION_STYLE[section.status])}>
                      {SECTION_LABEL[section.status]}
                    </Badge>
                    <span className="text-muted-foreground">v{section.version}</span>
                  </span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </span>
              </summary>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-3 py-2.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{section.updatedAt}</span>
                </div>
                {actionToolbar}
              </div>
            </details>
          ) : (
            <div className={cn("mt-3 px-3 py-2.5", APP_CHROME)}>
              <div className={cn("flex gap-2", isMobile ? "flex-col" : "items-center justify-between")}>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                  <span className={APP_CHROME_LABEL}>
                    <Wrench className="size-3" aria-hidden />
                    アプリ操作
                  </span>
                  <Badge variant="outline" className={cn("h-5 text-[10px]", SECTION_STYLE[section.status])}>
                    {SECTION_LABEL[section.status]}
                  </Badge>
                  {sync !== "ok" && <SyncStatusBadge status={section.syncStatus} />}
                  <span>v{section.version}</span>
                  <span>·</span>
                  <span>{section.updatedAt}</span>
                </div>
                {actionToolbar}
              </div>
            </div>
          )
        )}

        {regenError && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] leading-relaxed text-destructive md:text-[13px]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="font-medium">AI再生成に失敗しました: </span>
              {regenError}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 px-2 text-destructive"
              onClick={() => setRegenError(null)}
            >
              閉じる
            </Button>
          </div>
        )}

        {syncActions ? <div className="mt-2">{syncActions}</div> : null}

        {confirms > 0 && (
          <div className={cn("mt-2 flex items-start gap-2 px-3 py-2.5 text-[12px] leading-relaxed md:text-[13px]", WARNING_BOX)}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">アプリからの案内: </span>
              AIが推測で補完した「要確認」箇所が {confirms} 件あります。内容を確認し、「内容OK」または本文修正で解消してください。
            </span>
          </div>
        )}

        {hearingReview && (
          <div className={cn("mt-2 flex items-start gap-2 px-3 py-2.5 text-[12px] leading-relaxed md:text-[13px]", WARNING_BOX)}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">アプリからの案内: </span>
              骨組みヒアリングが更新されています。フロー図の見直しと、必要なら「AI再生成」を行ってください。
            </span>
          </div>
        )}

        {deepdiveReview && (
          <div className={cn("mt-2 flex items-start gap-2 px-3 py-2.5 text-[12px] leading-relaxed md:text-[13px]", WARNING_BOX)}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">アプリからの案内: </span>
              深掘り回答が更新されています。「AI再生成」するか手で直し、「深掘りを反映済み」で確認してください。
            </span>
          </div>
        )}

        {flowReview && (
          <div className={cn("mt-2 flex items-start gap-2 px-3 py-2.5 text-[12px] leading-relaxed md:text-[13px]", WARNING_BOX)}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">アプリからの案内: </span>
              対応するフローステップが変更されています。本文は保護中です。内容を見直すか、フローと不一致のまま残してください。
            </span>
          </div>
        )}

        {sync === "orphaned" && (
          <div className={cn("mt-2 flex items-start gap-2 px-3 py-2.5 text-[12px] leading-relaxed md:text-[13px]", WARNING_BOX)}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">アプリからの案内: </span>
              フロー上のステップが削除されています。このセクションは廃止候補です。
            </span>
          </div>
        )}

        {/* ③ マニュアル本文 */}
        <div className="mt-4 border-t border-border/30 pt-4">
          <div className="flex flex-col gap-1">
            {section.blocks.map((block) => {
              if (block.type === "step") stepNo += 1
              return (
                <BlockView
                  key={block.id}
                  block={block}
                  stepNo={block.type === "step" ? stepNo : undefined}
                  isMobile={isMobile}
                  chromeCollapsed={chromeCollapsed}
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
                    const image = await readImageFile(file, project.id)
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
              要確認をすべて解消してから公開できます
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
  chromeCollapsed,
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
  chromeCollapsed?: boolean
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
  const [imageError, setImageError] = useState<string | null>(null)
  const [captionDraft, setCaptionDraft] = useState(block.image?.caption ?? "")
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    setCaptionDraft(block.image?.caption ?? "")
  }, [block.image?.caption, block.image?.url])

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
      setCaptionDraft("")
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "画像の添付に失敗しました")
    } finally {
      setUploading(false)
    }
  }

  const saveCaption = () => {
    onUpdateImageCaption(captionDraft.trim())
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
                <div className={cn("mt-3 px-3 py-2.5", APP_CHROME, "border-[var(--semantic-warning-border)] bg-[color-mix(in_oklch,var(--semantic-warning-bg)_45%,var(--card))]")}>
                  <p className={APP_CHROME_LABEL}>
                    <Wrench className="size-3" aria-hidden />
                    アプリ操作 · 要確認
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-foreground">
                    AIが推測で補完した内容です。マニュアル本文に含めてよいか確認してください。
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 border bg-background px-3 text-[11px]"
                      onClick={onResolveConfirm}
                    >
                      <Check className="size-3.5" />
                      内容OK
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 border bg-background px-3 text-[11px]"
                      onClick={onStartEdit}
                    >
                      <Pencil className="size-3.5" />
                      修正する
                    </Button>
                  </div>
                </div>
              )}
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

          {/* 画像は手順番号のインデント外・ブロック全幅に配置 */}
          <BlockImageSection
            block={block}
            chromeCollapsed={chromeCollapsed}
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
        </>
      )}
    </div>
  )
}

function BlockImageSection({
  block,
  chromeCollapsed,
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
  chromeCollapsed?: boolean
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
  const hasRealImage = Boolean(image?.url)

  const imageOps = (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        !chromeCollapsed && cn("rounded-md border border-border/60 px-2.5 py-2", APP_CHROME),
      )}
    >
      {!chromeCollapsed && <span className={cn(APP_CHROME_LABEL, "mr-1")}>画像操作</span>}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1 border bg-background px-2 text-[11px]"
        onClick={onPickImage}
        disabled={uploading}
      >
        <ImagePlus className="size-3" />
        {uploading ? "読込中…" : hasRealImage ? "変更" : "画像を添付"}
      </Button>
      {hasRealImage && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 border bg-background px-2 text-[11px] text-muted-foreground"
          onClick={() => {
            if (window.confirm("この画像を削除しますか？")) onRemoveImage()
          }}
        >
          <Trash2 className="size-3" />
          削除
        </Button>
      )}
    </div>
  )

  return (
    <div className="mt-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={onFileChange}
      />

      {hasRealImage && image ? (
        <div className="space-y-2">
          {chromeCollapsed ? (
            <details className={cn(APP_CHROME)}>
              <summary className="cursor-pointer list-none px-2.5 py-1.5 text-[11px] marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-2">
                  <span className={APP_CHROME_LABEL}>画像操作</span>
                  <ChevronDown className="size-3 text-muted-foreground" />
                </span>
              </summary>
              <div className="border-t border-border/50 px-2.5 py-2">{imageOps}</div>
            </details>
          ) : (
            imageOps
          )}
          <figure className="manual-figure overflow-hidden rounded-lg border border-border bg-card">
            <img
              src={resolveMediaFetchUrl(image.url ?? "")}
              alt={image.caption || "手順の参考画像"}
              className="manual-figure-img"
            />
            <figcaption className="border-t border-border bg-card px-3 py-3">
              <label className="mb-1 block text-xs font-semibold text-foreground">
                図の説明
              </label>
              <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
                この画面で何をするかを書いてください（例: 右上の「新規申請」を押す）
              </p>
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
                placeholder="操作内容が分かる一文を入力"
                rows={2}
                className="min-h-[2.75rem] resize-y border border-input bg-background px-2.5 py-2 text-[13px] leading-relaxed text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              {!captionDraft.trim() ? (
                <p className="mt-1.5 text-[11px] text-[var(--semantic-warning-fg)]">
                  未入力のまま公開すると図の意図が伝わりにくくなります
                </p>
              ) : isFilenameLikeCaption(captionDraft, image.name) ? (
                <p className="mt-1.5 text-[11px] text-[var(--semantic-warning-fg)]">
                  ファイル名のような説明です。画面上の操作内容が分かる一文に書き換えてください
                </p>
              ) : null}
            </figcaption>
          </figure>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border border-dashed bg-background px-2.5 text-[11px] text-muted-foreground hover:border-solid hover:text-foreground"
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
