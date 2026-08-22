import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Check, History, Loader2, RotateCcw } from "lucide-react"
import type { ManualRegenChoice, Project } from "@/lib/types"
import { MANUAL_SYNC_LABEL, SECTION_LABEL } from "@/lib/types"
import {
  applyRegenChoices,
  buildRegenPlan,
  collectChangingSectionIds,
} from "@/lib/manual-regen"
import { stampAllSectionsDeepdive } from "@/lib/manual-deepdive-sync"
import { appendRevisions, snapshotSection } from "@/lib/manual-version"
import { aiApplyManualRegen } from "@/lib/api/ai"
import { describeAiError } from "@/lib/api/errors"
import { useAppSession } from "@/lib/api/use-app-session"
import { actorName } from "@/lib/actor"
import { today } from "@/lib/project-utils"
import { WARNING_TEXT } from "@/lib/semantic-styles"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { SyncStatusBadge } from "@/features/manual/SyncStatusBadge"

const CHOICE_LABEL: Record<ManualRegenChoice, string> = {
  keep: "残す",
  regenerate: "再生成",
  archive: "廃止",
}

export function ManualRegenWizard({
  project,
  open,
  onOpenChange,
  onApply,
  isMobile,
}: {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (next: Project) => void
  isMobile?: boolean
}) {
  const { user } = useAppSession()
  const actor = actorName(user)
  const plan = useMemo(() => buildRegenPlan(project), [project])
  const [choices, setChoices] = useState<Record<string, ManualRegenChoice>>(() =>
    Object.fromEntries(plan.map((item) => [item.key, item.defaultChoice])),
  )
  const [confirmApproved, setConfirmApproved] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  const planKey = plan.map((p) => `${p.key}:${p.defaultChoice}`).join("|")
  useEffect(() => {
    setChoices(Object.fromEntries(plan.map((item) => [item.key, item.defaultChoice])))
    setConfirmApproved(false)
    setApplyError(null)
  }, [planKey, plan])

  const summary = useMemo(() => {
    let keep = 0
    let regenerate = 0
    let archive = 0
    for (const item of plan) {
      const c = choices[item.key] ?? item.defaultChoice
      if (c === "keep") keep += 1
      else if (c === "regenerate") regenerate += 1
      else archive += 1
    }
    return { keep, regenerate, archive }
  }, [choices, plan])

  const regeneratingApproved = plan.some((item) => {
    const c = choices[item.key] ?? item.defaultChoice
    return c === "regenerate" && item.status === "approved"
  })

  const apply = async () => {
    if (regeneratingApproved && !confirmApproved) {
      setConfirmApproved(true)
      return
    }
    setApplying(true)
    setApplyError(null)
    try {
      const changingIds = collectChangingSectionIds(project, choices)
      let base = project
      if (changingIds.length) {
        const snapshots = changingIds
          .map((id) => project.sections.find((s) => s.id === id))
          .filter((s): s is NonNullable<typeof s> => !!s)
          .map((s) => snapshotSection(s, { reason: "flow_sync", user: actor }))
        if (snapshots.length) base = appendRevisions(project, snapshots)
      }

      let next: Project
      if (summary.regenerate > 0) {
        const { sections } = await aiApplyManualRegen(project.id, choices)
        next = {
          ...base,
          sections: stampAllSectionsDeepdive(sections, base.deepdive),
          updatedAt: today(),
        }
      } else {
        next = applyRegenChoices({ project: base, choices })
        next = { ...next, sections: stampAllSectionsDeepdive(next.sections, next.deepdive) }
      }
      onApply(next)
      onOpenChange(false)
    } catch (err) {
      setApplyError(describeAiError(err, "マニュアル反映に失敗しました"))
    } finally {
      setApplying(false)
    }
  }

  const availableChoices = (item: (typeof plan)[number]): ManualRegenChoice[] => {
    if (item.kind === "unplaced") return ["keep", "regenerate"]
    if (item.kind === "orphan") return ["keep", "archive"]
    return ["keep", "regenerate"]
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0",
          isMobile ? "w-[calc(100%-1rem)] max-w-lg" : "sm:max-w-xl",
        )}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3 md:px-5">
          <DialogTitle className="text-base">フロー変更をマニュアルに反映</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            残したいセクションを選んでください。再生成対象は適用前に版履歴へ保存されます（各セクションの「履歴」から復元できます）。
          </DialogDescription>
        </DialogHeader>

        <div className="scroll-touch min-h-0 flex-1 overflow-y-auto px-4 py-3 md:px-5">
          <div className="mb-3 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            残す {summary.keep} / 再生成 {summary.regenerate} / 廃止 {summary.archive}
          </div>

          {applyError && (
            <div className={cn("mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs", WARNING_TEXT)}>
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {applyError}
            </div>
          )}

          {confirmApproved && (
            <div className={cn("mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs", WARNING_TEXT)}>
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              既存のセクションを再生成します。内容が下書き扱いに戻ります。もう一度「適用」で確定してください。
            </div>
          )}

          <ul className="flex flex-col gap-2">
            {plan.map((item) => {
              const choice = choices[item.key] ?? item.defaultChoice
              const opts = availableChoices(item)
              return (
                <li
                  key={item.key}
                  className="rounded-lg border bg-card px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.sectionNumber && (
                      <span className="font-mono text-[10px] font-bold tabular-nums text-primary">
                        {item.sectionNumber}
                      </span>
                    )}
                    <span className="min-w-0 text-sm font-medium leading-snug">{item.title}</span>
                    {item.kind === "unplaced" && (
                      <span className="text-[10px] text-muted-foreground">（新規）</span>
                    )}
                    <SyncStatusBadge status={item.syncStatus} />
                    {item.status && (
                      <span className="text-[10px] text-muted-foreground">
                        {SECTION_LABEL[item.status]}
                      </span>
                    )}
                  </div>
                  <div className={cn("mt-2 flex gap-1.5", isMobile && "flex-wrap")}>
                    {opts.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        disabled={applying}
                        onClick={() => {
                          setConfirmApproved(false)
                          setApplyError(null)
                          setChoices((prev) => ({ ...prev, [item.key]: opt }))
                        }}
                        className={cn(
                          "min-h-9 flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                          isMobile && "min-w-[30%]",
                          choice === opt
                            ? "border-primary bg-primary-subtle text-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-muted/40",
                          applying && "pointer-events-none opacity-60",
                        )}
                      >
                        {item.kind === "unplaced" && opt === "keep"
                          ? "追加しない"
                          : item.kind === "unplaced" && opt === "regenerate"
                            ? "追加して生成"
                              : item.kind === "orphan" && opt === "keep"
                              ? "残す（不一致のまま）"
                              : CHOICE_LABEL[opt]}
                      </button>
                    ))}
                  </div>
                  {item.syncStatus && item.syncStatus !== "ok" && (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      {MANUAL_SYNC_LABEL[item.syncStatus]}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t px-4 py-3 sm:flex-col md:px-5">
          <p className="w-full text-[11px] text-muted-foreground">
            <History className="mr-1 inline size-3" />
            適用前に変更対象の版をセクション履歴へ保存します。
          </p>
          <div className={cn("flex w-full gap-2", isMobile && "flex-col-reverse")}>
            <Button
              variant="outline"
              className={cn(isMobile && "h-11 w-full")}
              disabled={applying}
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button
              className={cn("gap-1.5", isMobile && "h-11 w-full")}
              disabled={applying}
              onClick={() => void apply()}
            >
              {applying ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  AIで反映中…
                </>
              ) : confirmApproved ? (
                <>
                  <Check className="size-4" />
                  保護中のセクションも含めて適用
                </>
              ) : (
                <>
                  <RotateCcw className="size-4" />
                  適用する
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
