import { useMemo, useState } from "react"
import { AlertTriangle, BookCheck, Check, ChevronRight, Send } from "lucide-react"
import type { DeepDiveItem, DeepDiveStatus, Project, ProjectTab } from "@/lib/types"
import { DEEPDIVE_LABEL } from "@/lib/types"
import type { UpdateProject } from "@/pages/ProjectPage"
import { now } from "@/lib/project-utils"
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

const STATUS_STYLE: Record<DeepDiveStatus, string> = {
  "not-started": "bg-muted text-muted-foreground border-transparent",
  "in-progress": "bg-sky-50 text-sky-700 border-sky-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  recheck: "bg-amber-50 text-amber-700 border-amber-200",
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

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-bold">まだ深掘りヒアリングを開始できません</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            先にフロー図を確定すると、各ステップの詳細を収集する深掘りヒアリングが始まります。
          </p>
          <Button className="mt-4" onClick={() => setTab("flow")}>
            フロー図へ進む
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* ステップ一覧(状況の一覧把握) */}
      <aside className="flex w-80 shrink-0 flex-col border-r bg-muted/20">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold">ステップ別ヒアリング状況</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {doneCount} / {items.length} 完了 ・ 好きな順で回答できます
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-1.5">
            {items.map((item) => (
              <button
                key={item.stepId}
                onClick={() => setSelectedId(item.stepId)}
                className={cn(
                  "rounded-md border bg-background px-3 py-2.5 text-left transition-colors",
                  selectedId === item.stepId
                    ? "border-primary/60 ring-2 ring-primary/15"
                    : "hover:border-primary/30",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs font-bold tabular-nums text-primary">
                    {item.sectionNumber ?? "—"}
                  </span>
                  <span className="flex-1 truncate text-[13px] font-medium">{item.stepLabel}</span>
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Badge variant="outline" className={cn("h-5 text-[10px]", STATUS_STYLE[item.status])}>
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
        <div className="border-t p-3">
          <Button className="w-full gap-1.5" disabled={!canGenerate} onClick={() => {
            updateProject(project.id, (p) => ({
              ...p,
              status: p.status === "deepdive" ? "manual" : p.status,
              history: [
                { id: `h-${Date.now()}`, date: now(), user: "山田 太郎", action: "マニュアル生成を開始" },
                ...p.history,
              ],
            }))
            setTab("manual")
          }}>
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

      {/* 回答エリア */}
      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex items-center gap-3 border-b px-6 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {selected.sectionNumber && (
                    <span className="mr-1.5 text-primary">{selected.sectionNumber}</span>
                  )}
                  対象ステップ: {selected.stepLabel}
                </div>
                <div className="text-xs text-muted-foreground">
                  {selected.answers.length} / {questions.length} 問回答済み(重要度で質問数が変わります)
                </div>
              </div>
              <Select
                value={selected.importance}
                onValueChange={(v) => {
                  const importance = v as DeepDiveItem["importance"]
                  const count = QUESTIONS_BY_IMPORTANCE[importance].length
                  update(selected.stepId, (d) => ({
                    ...d,
                    importance,
                    // 質問数が減って全問回答済みになった場合は完了に、増えた場合は回答中に戻す
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
                <SelectTrigger size="sm" className="w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">重要度: 高(5問)</SelectItem>
                  <SelectItem value="normal">重要度: 中(3問)</SelectItem>
                  <SelectItem value="low">重要度: 低(1問)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="mx-auto flex max-w-2xl flex-col gap-4">
                {selected.status === "recheck" && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <div>
                      フロー図が修正されたため、このステップの回答は「要確認」になっています。
                      内容を見直して、問題なければ完了にしてください。
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 block h-7 border-amber-300 bg-white text-xs"
                        onClick={() => update(selected.stepId, (d) => ({ ...d, status: "done" }))}
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

                {currentQuestion ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/[0.03] px-4 py-3">
                    <div className="text-xs font-semibold text-primary">
                      質問 {selected.answers.length + 1} / {questions.length}
                    </div>
                    <div className="mt-1 text-sm font-medium">{currentQuestion}</div>
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="回答を入力…"
                      className="mt-3 min-h-20 bg-background"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitAnswer()
                      }}
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">⌘+Enter で送信</span>
                      <Button size="sm" className="gap-1" disabled={!draft.trim()} onClick={submitAnswer}>
                        <Send className="size-3.5" />
                        回答する
                      </Button>
                    </div>
                  </div>
                ) : (
                  selected.status === "done" && (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      <Check className="size-4" />
                      このステップのヒアリングは完了しています
                    </div>
                  )
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            左の一覧からステップを選択してください
          </div>
        )}
      </div>
    </div>
  )
}
