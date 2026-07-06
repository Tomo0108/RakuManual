import { useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  CircleHelp,
  Clock,
  Pencil,
  Send,
  SkipForward,
  Workflow,
} from "lucide-react"
import logo from "@/assets/logo.png"
import type { AnswerStatus, HearingAnswer, Project, ProjectTab } from "@/lib/types"
import { HEARING_QUESTIONS } from "@/lib/mock-data"
import { now } from "@/lib/project-utils"
import type { UpdateProject } from "@/pages/ProjectPage"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Props {
  project: Project
  updateProject: UpdateProject
  setTab: (t: ProjectTab) => void
}

const STATUS_TEXT: Record<AnswerStatus, string> = {
  answered: "",
  skipped: "(スキップ)",
  unknown: "わからない",
  later: "後で答える",
}

export function HearingTab({ project, updateProject, setTab }: Props) {
  const answers = project.hearingAnswers
  const answeredIds = new Set(answers.map((a) => a.questionId))
  const currentIndex = HEARING_QUESTIONS.findIndex((q) => !answeredIds.has(q.id))
  const currentQuestion = currentIndex >= 0 ? HEARING_QUESTIONS[currentIndex] : null
  const done = currentQuestion === null

  const [draft, setDraft] = useState("")
  const [multiSelection, setMultiSelection] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const [thinking, setThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const progress = Math.round((answers.length / HEARING_QUESTIONS.length) * 100)
  const pendingList = useMemo(
    () => answers.filter((a) => a.status !== "answered"),
    [answers],
  )

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [answers.length, thinking, done])

  const saveAnswer = (value: string, status: AnswerStatus) => {
    if (!currentQuestion) return
    const answer: HearingAnswer = { questionId: currentQuestion.id, value, status }
    // AIの応答らしい「間」を演出(1問ごと自動保存)
    setThinking(true)
    updateProject(project.id, (p) => ({
      ...p,
      updatedAt: now().slice(0, 10),
      hearingAnswers: [...p.hearingAnswers, answer],
    }))
    setDraft("")
    setMultiSelection([])
    window.setTimeout(() => setThinking(false), 450)
  }

  const saveEdit = (questionId: string) => {
    updateProject(project.id, (p) => ({
      ...p,
      hearingAnswers: p.hearingAnswers.map((a) =>
        a.questionId === questionId ? { ...a, value: editDraft, status: "answered" } : a,
      ),
    }))
    setEditingId(null)
  }

  return (
    <div className="flex h-full">
      {/* チャットエリア */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 進捗バー(終わりが見える対話) */}
        <div className="border-b bg-muted/30 px-6 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              骨組みヒアリング {done ? "完了" : `${answers.length + 1} / ${HEARING_QUESTIONS.length} 問目`}
            </span>
            <span className="text-muted-foreground">
              {done ? "すべて回答済み" : `残り約 ${HEARING_QUESTIONS.length - answers.length} 問`}
            </span>
          </div>
          <Progress value={done ? 100 : progress} className="mt-2 h-1.5" />
        </div>

        {/* メッセージ */}
        <div ref={scrollRef} className="scroll-touch min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            <AiBubble>
              こんにちは!「{project.name}」のマニュアル作成をお手伝いします。
              いくつか質問しますので、わかる範囲で気軽に答えてください。
              「わからない」「後で」も立派な回答です。
            </AiBubble>

            {answers.map((a) => {
              const q = HEARING_QUESTIONS.find((x) => x.id === a.questionId)
              if (!q) return null
              return (
                <div key={a.questionId} className="flex flex-col gap-5">
                  <AiBubble hint={q.hint}>{q.text}</AiBubble>
                  <UserBubble
                    answer={a}
                    editing={editingId === a.questionId}
                    editDraft={editDraft}
                    setEditDraft={setEditDraft}
                    onStartEdit={() => {
                      setEditingId(a.questionId)
                      setEditDraft(a.value)
                    }}
                    onSaveEdit={() => saveEdit(a.questionId)}
                    onCancelEdit={() => setEditingId(null)}
                  />
                </div>
              )
            })}

            {thinking && (
              <AiBubble>
                <span className="inline-flex gap-1">
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:120ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:240ms]" />
                </span>
              </AiBubble>
            )}

            {!thinking && currentQuestion && (
              <AiBubble hint={currentQuestion.hint}>{currentQuestion.text}</AiBubble>
            )}

            {!thinking && done && (
              <AiBubble>
                <div className="flex flex-col gap-3">
                  <p>
                    ありがとうございました!骨組みヒアリングは以上です。
                    いただいた回答をもとに業務フロー図を生成できます。
                  </p>
                  {pendingList.length > 0 && (
                    <p className="text-xs text-amber-600">
                      未回答が {pendingList.length} 件あります(右の回答一覧からいつでも追記できます)
                    </p>
                  )}
                  <Button className="w-fit gap-1.5" onClick={() => setTab("flow")}>
                    <Workflow className="size-4" />
                    フロー図を生成する
                  </Button>
                </div>
              </AiBubble>
            )}
          </div>
        </div>

        {/* 入力エリア */}
        {!done && currentQuestion && (
          <div className="border-t bg-background px-6 py-4">
            <div className="mx-auto max-w-2xl">
              {currentQuestion.type === "text" && (
                <div className="flex items-end gap-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="回答を入力…(Enterで送信 / Shift+Enterで改行)"
                    className="min-h-11 resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        if (draft.trim()) saveAnswer(draft.trim(), "answered")
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    disabled={!draft.trim()}
                    onClick={() => saveAnswer(draft.trim(), "answered")}
                    aria-label="送信"
                  >
                    <Send className="size-4" />
                  </Button>
                </div>
              )}

              {currentQuestion.type === "choice" && (
                <div className="flex flex-wrap gap-2">
                  {currentQuestion.options?.map((opt) => (
                    <Button
                      key={opt}
                      variant="outline"
                      className="hover:border-primary hover:text-primary"
                      onClick={() => saveAnswer(opt, "answered")}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              )}

              {currentQuestion.type === "multi" && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    {currentQuestion.options?.map((opt) => {
                      const selected = multiSelection.includes(opt)
                      return (
                        <Button
                          key={opt}
                          variant={selected ? "default" : "outline"}
                          className={cn(!selected && "hover:border-primary hover:text-primary")}
                          onClick={() =>
                            setMultiSelection((prev) =>
                              selected ? prev.filter((o) => o !== opt) : [...prev, opt],
                            )
                          }
                        >
                          {selected && <Check className="size-3.5" />}
                          {opt}
                        </Button>
                      )
                    })}
                  </div>
                  <Button
                    className="w-fit"
                    disabled={multiSelection.length === 0}
                    onClick={() => saveAnswer(multiSelection.join(", "), "answered")}
                  >
                    この内容で回答する
                  </Button>
                </div>
              )}

              {/* わからない・後で・スキップ */}
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => saveAnswer("", "unknown")}>
                  <CircleHelp className="size-3.5" />
                  わからない
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => saveAnswer("", "later")}>
                  <Clock className="size-3.5" />
                  後で答える
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => saveAnswer("", "skipped")}>
                  <SkipForward className="size-3.5" />
                  スキップ
                </Button>
                <span className="ml-auto self-center text-[11px] text-muted-foreground">
                  回答は1問ごとに自動保存されます
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 回答一覧サイドパネル(過去回答の見直し・修正) */}
      <aside className="hidden w-72 shrink-0 flex-col border-l bg-muted/20 lg:flex">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold">回答一覧</div>
          <div className="text-xs text-muted-foreground">クリックで内容を確認・修正できます</div>
        </div>
        <div className="scroll-touch min-h-0 flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-1.5">
            {HEARING_QUESTIONS.map((q, i) => {
              const a = answers.find((x) => x.questionId === q.id)
              const isCurrent = currentQuestion?.id === q.id
              return (
                <button
                  key={q.id}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-xs transition-colors",
                    isCurrent
                      ? "border-primary/50 bg-primary/5"
                      : a
                        ? "bg-background hover:border-primary/30"
                        : "border-dashed bg-transparent text-muted-foreground",
                  )}
                  onClick={() => {
                    if (a) {
                      setEditingId(q.id)
                      setEditDraft(a.value)
                    }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">Q{i + 1}</span>
                    {a?.status === "answered" && <Check className="size-3 text-emerald-600" />}
                    {a && a.status !== "answered" && (
                      <Badge variant="outline" className="h-4 border-amber-300 bg-amber-50 px-1 text-[10px] text-amber-700">
                        {STATUS_TEXT[a.status] || "未回答"}
                      </Badge>
                    )}
                    {isCurrent && (
                      <Badge className="h-4 px-1 text-[10px]">回答中</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-muted-foreground">{q.text}</div>
                  {a?.value && (
                    <div className="mt-1 line-clamp-2 font-medium text-foreground">{a.value}</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </aside>
    </div>
  )
}

/* ---------- バブル ---------- */

function AiBubble({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex gap-3">
      <img src={logo} alt="AI" className="size-8 shrink-0 rounded-xl shadow-xs" />
      <div className="max-w-[85%]">
        <div className="rounded-2xl rounded-tl-sm border bg-card px-4 py-3 text-sm leading-relaxed shadow-xs">
          {children}
        </div>
        {hint && <div className="mt-1 pl-1 text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  )
}

function UserBubble({
  answer,
  editing,
  editDraft,
  setEditDraft,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: {
  answer: HearingAnswer
  editing: boolean
  editDraft: string
  setEditDraft: (v: string) => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
}) {
  const isEmpty = answer.status !== "answered"
  return (
    <div className="flex justify-end">
      <div className="group max-w-[85%]">
        {editing ? (
          <div className="rounded-2xl border border-primary/40 bg-background p-3 shadow-xs">
            <Textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              className="min-h-16 text-sm"
              autoFocus
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={onCancelEdit}>
                キャンセル
              </Button>
              <Button size="sm" onClick={onSaveEdit} disabled={!editDraft.trim()}>
                修正を保存
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-amber-600">
              ※ 回答を修正すると、フロー図の再生成が必要になる場合があります
            </p>
          </div>
        ) : (
          <div
            className={cn(
              "relative rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed",
              isEmpty
                ? "border border-dashed bg-muted/40 text-muted-foreground italic"
                : "bg-primary text-primary-foreground",
            )}
          >
            {isEmpty ? (
              <span className="flex items-center gap-2">
                {STATUS_TEXT[answer.status] || "未回答"}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px] not-italic"
                  onClick={onStartEdit}
                >
                  <Pencil className="size-3" />
                  今答える
                </Button>
              </span>
            ) : (
              answer.value
            )}
            {!isEmpty && (
              <button
                className="absolute top-1/2 -left-8 -translate-y-1/2 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                onClick={onStartEdit}
                aria-label="回答を修正"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
