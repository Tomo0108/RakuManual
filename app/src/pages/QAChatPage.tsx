import { useEffect, useRef, useState } from "react"
import { BookOpenText, MessageCircleQuestion, Send, ThumbsDown, ThumbsUp } from "lucide-react"
import { uid } from "@/lib/project-utils"
import { askQuestion, sendQaFeedback, type QASource } from "@/lib/api/qa"
import { SUCCESS_TEXT, DANGER_TEXT } from "@/lib/semantic-styles"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AiBubble, TypingIndicator, UserBubble } from "@/components/chat/AiBubble"
import { cn } from "@/lib/utils"

interface Message {
  id: string
  role: "user" | "ai"
  text: string
  source?: QASource
  noSource?: boolean
  feedback?: "up" | "down"
  question?: string
}

const SUGGESTIONS = [
  "経費精算のやり方を教えて",
  "5万円以上の経費は誰が承認する?",
  "新入社員のPCはいつまでに手配する?",
  "請求書の発行手順は?",
  "有給休暇の申請方法は?",
]

interface Props {
  onOpenSource: (projectId: string, sectionId?: string) => void
}

export function QAChatPage({ onOpenSource }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [thinking, setThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages.length, thinking])

  const ask = async (question: string) => {
    if (!question.trim() || thinking) return
    const q = question.trim()
    setMessages((prev) => [...prev, { id: uid("m"), role: "user", text: q }])
    setInput("")
    setThinking(true)
    try {
      const res = await askQuestion(q)
      setMessages((prev) => [
        ...prev,
        {
          id: res.messageId,
          role: "ai",
          text: res.text,
          source: res.source,
          noSource: res.noSource,
          question: q,
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uid("m"),
          role: "ai",
          text: "回答の取得に失敗しました。しばらくしてから再度お試しください。",
          noSource: true,
        },
      ])
    } finally {
      setThinking(false)
    }
  }

  const setFeedback = async (msg: Message, fb: "up" | "down") => {
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, feedback: fb } : m)))
    if (msg.question) {
      try {
        await sendQaFeedback({ messageId: msg.id, question: msg.question, feedback: fb })
      } catch {
        /* UI はローカル反映済み */
      }
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="page-header px-4 py-3 md:px-6 md:py-4">
        <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <MessageCircleQuestion className="size-5 text-primary" />
          業務QAチャット
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          公開済みマニュアルを根拠に回答します。回答には必ず出典が付き、根拠がない場合は推測で答えません。
        </p>
      </header>

      <div ref={scrollRef} className="scroll-touch min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.length === 0 && (
            <div className="mt-8 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                <MessageCircleQuestion className="size-6" />
              </div>
              <p className="mt-4 text-sm font-medium">業務に関する質問をどうぞ</p>
              <p className="mt-1 text-sm text-muted-foreground">
                公開済みマニュアルを根拠に回答します。例えばこんな質問ができます:
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outline" size="sm" className="text-xs" onClick={() => void ask(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <UserBubble key={m.id}>{m.text}</UserBubble>
            ) : (
              <div key={m.id} className="flex flex-col gap-1.5">
                <AiBubble variant={m.noSource && !m.source ? "warning" : "default"}>
                  {m.text}
                  {m.source && (
                    <button
                      onClick={() => onOpenSource(m.source!.projectId, m.source!.sectionId)}
                      className="mt-3 flex w-full items-center gap-2 rounded-lg border border-border/60 bg-secondary/60 px-3 py-2 text-left text-xs transition-colors hover:border-primary-muted hover:bg-primary-subtle/50"
                    >
                      <BookOpenText className="size-3.5 shrink-0 text-primary" />
                      <span>
                        出典: <span className="font-medium">{m.source.projectName}</span>
                        <span className="text-muted-foreground"> ─ {m.source.section}</span>
                      </span>
                    </button>
                  )}
                </AiBubble>
                <div className="flex items-center gap-1 pl-11">
                  <span className="text-[11px] text-muted-foreground">この回答は役に立ちましたか?</span>
                  <button
                    className={cn("rounded p-1 hover:bg-muted", m.feedback === "up" && SUCCESS_TEXT)}
                    onClick={() => void setFeedback(m, "up")}
                    aria-label="役に立った"
                  >
                    <ThumbsUp className="size-3.5" />
                  </button>
                  <button
                    className={cn("rounded p-1 hover:bg-muted", m.feedback === "down" && DANGER_TEXT)}
                    onClick={() => void setFeedback(m, "down")}
                    aria-label="役に立たなかった"
                  >
                    <ThumbsDown className="size-3.5" />
                  </button>
                  {m.feedback && <span className="text-[11px] text-muted-foreground">フィードバックを記録しました</span>}
                </div>
              </div>
            ),
          )}

          {thinking && <TypingIndicator />}
        </div>
      </div>

      <div className="border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6 md:py-4">
        <div className="mx-auto flex max-w-2xl gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="例: ○○の申請ってどうやるの?"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void ask(input)
            }}
          />
          <Button size="icon" onClick={() => void ask(input)} disabled={!input.trim() || thinking} aria-label="質問する">
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
