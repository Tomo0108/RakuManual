import { useMemo, useState } from "react"
import { AlertTriangle, ArrowLeft, BookCheck, Check, ChevronRight, Send, Workflow } from "lucide-react"
import type { DeepDiveItem, DeepDiveStatus, Project, ProjectTab } from "@/lib/types"
import { DEEPDIVE_LABEL } from "@/lib/types"
import type { UpdateProject } from "@/pages/ProjectPage"
import { now } from "@/lib/project-utils"
import { REVIEW_STATUS, WARNING_BOX, SUCCESS_BOX } from "@/lib/semantic-styles"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

const STATUS_STYLE: Record<DeepDiveStatus, string> = {
  "not-started": REVIEW_STATUS["not-started"],
  "in-progress": REVIEW_STATUS["in-progress"],
  done: REVIEW_STATUS.done,
  recheck: REVIEW_STATUS.recheck,
}

const IMPORTANCE_LABEL = { high: "重要度: 高", normal: "重要度: 中", low: "重要度: 低" } as const

/** 重要度に応じて質問の深さを変える(F-4: ヒアリング密度の調整) */
const QUESTIONS_BY_IMPORTANCE: Record<DeepDiveItem["importance"], string[]> = {
  high: [
    "このステップで使用するファイル・システム・画面を教えてください。",
    "具体的な操作手順を、順を追って教えてください。",
    "判断に迷うポイントと、その判断基準を教えてください。",
    "よくあるミスや注意点はありますか?",
    "例外的なケースの対応方法を教えてください。",
  ],
  normal: [
    "このステップで使用するファイル・システムを教えてください。",
    "具体的な作業内容を教えてください。",
    "注意点があれば教えてください。",
  ],
  low: ["このステップの作業内容を簡単に教えてください。"],
}

interface Props {
  project: Project
  updateProject: UpdateProject
  setTab: (t: ProjectTab) => void
}

export function DeepDiveTab({ project, updateProject, setTab }: Props) {
  const isMobile = useIsMobile()
  const items = useMemo(
    () =>
      [...project.deepdive].sort((a, b) => {
        const pa = (a.sectionNumber ?? "9.9").split(".").map(Number)
        const pb = (b.sectionNumber ?? "9.9").split(".").map(Number)
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          const d = (pa[i] ?? 0) - (pb[i] ?? 0)
          if (d !== 0) return d
        }
        return 0
      }),
    [project.deepdive],
  )
  const [selectedId, setSelectedId] = useState<string | null>(
    items.find((i) => i.status !== "done")?.stepId ?? items[0]?.stepId ?? null,
  )
  const [mobileView, setMobileView] = useState<"list" | "detail">("list")
  const [draft, setDraft] = useState("")

  const selected = items.find((i) => i.stepId === selectedId) ?? null
  const questions = selected ? QUESTIONS_BY_IMPORTANCE[selected.importance] : []
  const currentQuestion = selected ? questions[selected.answers.length] : undefined

  const doneCount = items.filter((i) => i.status === "done").length
  const canGenerate = useMemo(() => items.some((i) => i.status === "done"), [items])

  const update = (stepId: string, updater: (d: DeepDiveItem) => DeepDiveItem) => {
    updateProject(project.id, (p) => ({
      ...p,
      deepdive: p.deepdive.map((d) => (d.stepId === stepId ? updater(d) : d)),
    }))
  }

  const selectStep = (stepId: string) => {
    setSelectedId(stepId)
    if (isMobile) setMobileView("detail")
  }

  const submitAnswer = () => {
    if (!selected || !currentQuestion || !draft.trim()) return
    const answer = draft.trim()
    const willComplete = selected.answers.length + 1 >= questions.length
    update(selected.stepId, (d) => ({
      ...d,
      status: willComplete ? "done" : "in-progress",
      answers: [...d.answers, { question: currentQuestion, answer }],
    }))
    setDraft("")
  }

  const goToManual = () => {
    updateProject(project.id, (p) => ({
      ...p,
      status: p.status === "deepdive" ? "manual" : p.status,
      history: [
        { id: `h-${Date.now()}`, date: now(), user: "山田 太郎", action: "マニュアル生成を開始" },
        ...p.history,
      ],
    }))
    setTab("manual")
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-bold">まだ深掘りヒアリングを開始できません</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            先にフロー図を確定すると、各ステップの詳細を収集する深掘りヒアリングが始まります。
          </p>
          <Button className="mt-4 gap-1.5" onClick={() => setTab("flow")}>
            <Workflow className="size-4" />
            フロー図へ進む
          </Button>
        </div>
      </div>
    )
  }

  if (isMobile && mobileView === "list") {
    return (
      <StepListPanel
        items={items}
        selectedId={selectedId}
        doneCount={doneCount}
        canGenerate={canGenerate}
        onSelect={selectStep}
        onGoToManual={goToManual}
        className="h-full w-full border-r-0"
      />
    )
  }

  if (isMobile && mobileView === "detail" && selected) {
    return (
      <StepDetailPanel
        selected={selected}
        questions={questions}
        currentQuestion={currentQuestion}
        draft={draft}
        setDraft={setDraft}
        onSubmit={submitAnswer}
        onUpdate={(updater) => update(selected.stepId, updater)}
        isMobile
        onBack={() => setMobileView("list")}
      />
    )
  }

  return (
    <div className="flex h-full">
      <StepListPanel
        items={items}
        selectedId={selectedId}
        doneCount={doneCount}
        canGenerate={canGenerate}
        onSelect={selectStep}
        onGoToManual={goToManual}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <StepDetailPanel
            selected={selected}
            questions={questions}
            currentQuestion={currentQuestion}
            draft={draft}
            setDraft={setDraft}
            onSubmit={submitAnswer}
            onUpdate={(updater) => update(selected.stepId, updater)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            左の一覧からステップを選択してください
          </div>
        )}
      </div>
    </div>
  )
}

/* ================= ステップ一覧 ================= */

function StepListPanel({
  items,
  selectedId,
  doneCount,
  canGenerate,
  onSelect,
  onGoToManual,
  className,
}: {
  items: DeepDiveItem[]
  selectedId: string | null
  doneCount: number
  canGenerate: boolean
  onSelect: (stepId: string) => void
  onGoToManual: () => void
  className?: string
}) {
  return (
    <aside className={cn("flex w-80 shrink-0 flex-col border-r bg-muted/20", className)}>
      <div className="border-b px-4 py-3">
        <div className="text-sm font-semibold">ステップ別ヒアリング状況</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {doneCount} / {items.length} 完了 ・ 好きな順で回答できます
        </div>
      </div>
      <div className="scroll-touch min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-1.5">
          {items.map((item) => (
            <button
              key={item.stepId}
              onClick={() => onSelect(item.stepId)}
              className={cn(
                "min-h-14 rounded-md border bg-background px-3 py-3 text-left transition-colors md:min-h-0 md:py-2.5",
                selectedId === item.stepId
                  ? "border-primary bg-primary-subtle ring-2 ring-primary/20"
                  : "hover:border-primary/30 active:bg-muted/50",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs font-bold tabular-nums text-primary">
                  {item.sectionNumber ?? "—"}
                </span>
                <span className="flex-1 truncate text-[13px] font-medium">{item.stepLabel}</span>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={cn(
                    "h-5 overflow-visible border text-[10px] whitespace-nowrap",
                    STATUS_STYLE[item.status],
                  )}
                >
                  {item.status === "recheck" && <AlertTriangle className="size-2.5" />}
                  {DEEPDIVE_LABEL[item.status]}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {IMPORTANCE_LABEL[item.importance]}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button className="w-full gap-1.5" disabled={!canGenerate} onClick={onGoToManual}>
          <BookCheck className="size-4" />
          マニュアル生成へ進む
        </Button>
        {doneCount < items.length && (
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            未完了のステップはプレースホルダとして扱われます
          </p>
        )}
      </div>
    </aside>
  )
}

/* ================= 回答エリア ================= */

function StepDetailPanel({
  selected,
  questions,
  currentQuestion,
  draft,
  setDraft,
  onSubmit,
  onUpdate,
  isMobile,
  onBack,
}: {
  selected: DeepDiveItem
  questions: string[]
  currentQuestion: string | undefined
  draft: string
  setDraft: (v: string) => void
  onSubmit: () => void
  onUpdate: (updater: (d: DeepDiveItem) => DeepDiveItem) => void
  isMobile?: boolean
  onBack?: () => void
}) {
  const importanceSelect = (
    <Select
      value={selected.importance}
      onValueChange={(v) => {
        const importance = v as DeepDiveItem["importance"]
        const count = QUESTIONS_BY_IMPORTANCE[importance].length
        onUpdate((d) => ({
          ...d,
          importance,
          status:
            d.status === "recheck"
              ? d.status
              : d.answers.length >= count
                ? "done"
                : d.answers.length > 0
                  ? "in-progress"
                  : "not-started",
        }))
      }}
    >
      <SelectTrigger
        size="sm"
        className={cn("bg-background text-xs", isMobile ? "h-10 w-full" : "w-36")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="high">重要度: 高(5問)</SelectItem>
        <SelectItem value="normal">重要度: 中(3問)</SelectItem>
        <SelectItem value="low">重要度: 低(1問)</SelectItem>
      </SelectContent>
    </Select>
  )

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className={cn("border-b px-4 py-3.5 md:px-6", isMobile && "flex flex-col gap-3")}>
        {isMobile && onBack && (
          <Button variant="ghost" size="sm" className="-ml-2 h-9 gap-1 px-2" onClick={onBack}>
            <ArrowLeft className="size-4" />
            ステップ一覧
          </Button>
        )}
        <div className={cn("flex gap-3", isMobile ? "flex-col" : "items-center")}>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-snug">
              {selected.sectionNumber && (
                <span className="mr-1.5 text-primary">{selected.sectionNumber}</span>
              )}
              対象ステップ: {selected.stepLabel}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {selected.answers.length} / {questions.length} 問回答済み(重要度で質問数が変わります)
            </div>
          </div>
          {importanceSelect}
        </div>
      </div>

      <div
        className={cn(
          "scroll-touch min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5",
          isMobile && currentQuestion && "pb-2",
        )}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {selected.status === "recheck" && (
            <div className={cn("flex items-start gap-2 px-4 py-3 text-[13px]", WARNING_BOX)}>
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                フロー図が修正されたため、このステップの回答は「要確認」になっています。
                内容を見直して、問題なければ完了にしてください。
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 gap-1 bg-background text-xs"
                  onClick={() => onUpdate((d) => ({ ...d, status: "done" }))}
                >
                  <Check className="size-3.5" />
                  確認済みにする
                </Button>
              </div>
            </div>
          )}

          {selected.answers.map((qa, i) => (
            <div key={i} className="rounded-lg border bg-card px-4 py-3">
              <div className="text-xs font-medium text-muted-foreground">Q. {qa.question}</div>
              <div className="mt-1.5 text-sm leading-relaxed">{qa.answer}</div>
            </div>
          ))}

          {currentQuestion && !isMobile && (
            <QuestionInput
              questionIndex={selected.answers.length + 1}
              totalQuestions={questions.length}
              question={currentQuestion}
              draft={draft}
              setDraft={setDraft}
              onSubmit={onSubmit}
            />
          )}

          {!currentQuestion && selected.status === "done" && (
            <div className={cn("flex items-center gap-2 px-4 py-3 text-sm", SUCCESS_BOX)}>
              <Check className="size-4" />
              このステップのヒアリングは完了しています
            </div>
          )}
        </div>
      </div>

      {isMobile && currentQuestion && (
        <div className="shrink-0 border-t bg-card/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
          <div className="text-xs font-semibold text-primary">
            質問 {selected.answers.length + 1} / {questions.length}
          </div>
          <div className="mt-1 text-sm font-medium leading-snug">{currentQuestion}</div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="回答を入力…"
            className="mt-2 min-h-16 bg-background"
          />
          <Button className="mt-2 w-full gap-1.5" disabled={!draft.trim()} onClick={onSubmit}>
            <Send className="size-4" />
            回答する
          </Button>
        </div>
      )}
    </div>
  )
}

function QuestionInput({
  questionIndex,
  totalQuestions,
  question,
  draft,
  setDraft,
  onSubmit,
}: {
  questionIndex: number
  totalQuestions: number
  question: string
  draft: string
  setDraft: (v: string) => void
  onSubmit: () => void
}) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.03] px-4 py-3">
      <div className="text-xs font-semibold text-primary">
        質問 {questionIndex} / {totalQuestions}
      </div>
      <div className="mt-1 text-sm font-medium">{question}</div>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="回答を入力…"
        className="mt-3 min-h-20 bg-background"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit()
        }}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">⌘+Enter で送信</span>
        <Button size="sm" className="gap-1" disabled={!draft.trim()} onClick={onSubmit}>
          <Send className="size-3.5" />
          回答する
        </Button>
      </div>
    </div>
  )
}
