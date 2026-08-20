/**
 * LLM Adapter（プロバイダ抽象化）
 * OPENAI_API_KEY があれば実 API、なければモック（デモ用）にフォールバック。
 * complete / streamComplete の両方を提供（要件: ストリーミング表示）。
 */

import { insertLlmIoLog } from "../db.js"

export interface LlmMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface LlmCompletionResult {
  text: string
  tokens: number
  provider: "mock" | "openai"
}

export interface LlmStreamChunk {
  delta: string
}

export interface LlmCallContext {
  userId: string
  projectId?: string
  action: string
}

export interface LlmCompleteOptions {
  maxTokens?: number
  context?: LlmCallContext
}

export interface LlmAdapter {
  complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<LlmCompletionResult>
  streamComplete(
    messages: LlmMessage[],
    opts?: LlmCompleteOptions,
  ): AsyncGenerator<LlmStreamChunk, LlmCompletionResult>
}

async function* chunkText(text: string, size = 8): AsyncGenerator<LlmStreamChunk> {
  for (let i = 0; i < text.length; i += size) {
    yield { delta: text.slice(i, i + size) }
    await new Promise((r) => setTimeout(r, 12))
  }
}

function summarizeMessages(messages: LlmMessage[]): string {
  return messages.map((m) => `[${m.role}] ${m.content}`).join("\n").slice(0, 4000)
}

function maybeLog(
  messages: LlmMessage[],
  result: LlmCompletionResult,
  opts?: LlmCompleteOptions,
) {
  if (!opts?.context) return
  insertLlmIoLog({
    userId: opts.context.userId,
    projectId: opts.context.projectId,
    action: opts.context.action,
    provider: result.provider,
    prompt: summarizeMessages(messages),
    response: result.text,
    tokens: result.tokens,
  })
}

class MockLlmAdapter implements LlmAdapter {
  async complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<LlmCompletionResult> {
    const system = messages.find((m) => m.role === "system")?.content ?? ""
    const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? ""
    const text = buildMockStructuredResponse(system, last)
    const tokens = Math.max(80, Math.round(text.length / 2) + 120)
    const result = { text, tokens, provider: "mock" as const }
    maybeLog(messages, result, opts)
    return result
  }

  async *streamComplete(
    messages: LlmMessage[],
    opts?: LlmCompleteOptions,
  ): AsyncGenerator<LlmStreamChunk, LlmCompletionResult> {
    const result = await this.complete(messages, { ...opts, context: undefined })
    yield* chunkText(result.text)
    maybeLog(messages, result, opts)
    return result
  }
}

function buildMockStructuredResponse(system: string, user: string): string {
  if (system.includes("スイムレーンフロー") || system.includes('"lanes"')) {
    let name = "業務"
    try {
      const parsed = JSON.parse(user) as { name?: string; hearingAnswers?: Array<{ questionId?: string; value?: string }> }
      name = parsed.name ?? name
      const steps = parsed.hearingAnswers?.find((a) => a.questionId === "q8")?.value
      const parts = steps
        ? steps.split(/[、,。\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 2)
        : [`${name}の準備`, `${name}の実施`]
      return JSON.stringify({
        lanes: ["担当者", "確認者"],
        nodes: [
          { id: "n0", data: { label: "業務開始", lane: "担当者", kind: "start", source: "mock-llm" } },
          { id: "n1", data: { label: parts[0] ?? `${name}準備`, lane: "担当者", kind: "process", source: "q8" } },
          { id: "n2", data: { label: parts[1] ?? `${name}実施`, lane: "担当者", kind: "process", source: "q8" } },
          { id: "n3", data: { label: "内容確認", lane: "確認者", kind: "decision", source: "q3" } },
          { id: "n4", data: { label: "完了", lane: "担当者", kind: "end", source: "q6" } },
        ],
        edges: [
          { id: "e0", source: "n0", target: "n1" },
          { id: "e1", source: "n1", target: "n2" },
          { id: "e2", source: "n2", target: "n3" },
          { id: "e3", source: "n3", target: "n4" },
        ],
      })
    } catch {
      /* fallthrough */
    }
  }

  if (system.includes("セクション") && system.includes("blocks")) {
    try {
      const parsed = JSON.parse(user) as {
        name?: string
        deepdive?: Array<{
          stepId?: string
          stepLabel?: string
          sectionNumber?: string
          answers?: Array<{ question?: string; answer?: string; value?: string }>
        }>
        section?: { title?: string }
      }
      if (parsed.section) {
        return JSON.stringify({
          title: parsed.section.title ?? "再生成セクション",
          blocks: [
            { type: "paragraph", text: `${parsed.section.title ?? ""}の手順を更新しました。`, needsConfirm: true },
            { type: "step", text: "作業を実施し結果を記録する。", needsConfirm: false },
          ],
        })
      }
      const deepdive = parsed.deepdive ?? []
      const sections =
        deepdive.length > 0
          ? deepdive.map((d, i) => {
              const answerText = (d.answers ?? [])
                .map((a) => a.answer ?? a.value ?? "")
                .filter(Boolean)
                .join(" / ")
              return {
                title: d.stepLabel ?? `ステップ${i + 1}`,
                sectionNumber: d.sectionNumber ?? `${i + 1}`,
                stepId: d.stepId,
                blocks: [
                  {
                    type: "paragraph",
                    text: answerText || `「${d.stepLabel ?? ""}」の手順です。`,
                    needsConfirm: true,
                  },
                  { type: "step", text: "手順に沿って作業を実施する。", needsConfirm: false },
                ],
              }
            })
          : [
              {
                title: `${parsed.name ?? "業務"}の概要`,
                sectionNumber: "1",
                blocks: [
                  { type: "paragraph", text: `${parsed.name ?? "業務"}の手順概要です。`, needsConfirm: true },
                ],
              },
            ]
      return JSON.stringify({ sections })
    } catch {
      /* fallthrough */
    }
  }

  if (system.includes("contradiction") || system.includes("followUp") || system.includes("追加質問")) {
    return JSON.stringify({ contradiction: null, followUp: null })
  }

  if (system.includes("questions") && system.includes("深掘り")) {
    try {
      const parsed = JSON.parse(user) as { step?: string; importance?: string }
      const step = parsed.step ?? "このステップ"
      const questions =
        parsed.importance === "high"
          ? [
              `「${step}」で使うシステム・画面は？`,
              "操作手順を順に教えてください。",
              "判断基準は？",
              "注意点は？",
              "例外対応は？",
            ]
          : parsed.importance === "low"
            ? [`「${step}」の作業内容を簡単に教えてください。`]
            : [
                `「${step}」で使うファイル・システムは？`,
                "具体的な作業内容を教えてください。",
                "注意点があれば教えてください。",
              ]
      return JSON.stringify({ questions })
    } catch {
      return JSON.stringify({ questions: ["具体的な作業内容を教えてください。"] })
    }
  }

  if (system.includes("QA") || system.includes("出典") || system.includes("マニュアル根拠")) {
    return JSON.stringify({
      answer: "公開マニュアルの該当箇所に基づく回答です。",
      grounded: true,
    })
  }

  return `[モック生成] ${user.slice(0, 200)}`
}

class OpenAiAdapter implements LlmAdapter {
  constructor(private readonly apiKey: string) {}

  async complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<LlmCompletionResult> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages,
        max_tokens: opts?.maxTokens ?? 1024,
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`OpenAI API error: ${res.status} ${errText}`)
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { total_tokens?: number }
    }
    const text = data.choices?.[0]?.message?.content ?? ""
    const tokens = data.usage?.total_tokens ?? Math.max(100, Math.round(text.length / 2))
    const result = { text, tokens, provider: "openai" as const }
    maybeLog(messages, result, opts)
    return result
  }

  async *streamComplete(
    messages: LlmMessage[],
    opts?: LlmCompleteOptions,
  ): AsyncGenerator<LlmStreamChunk, LlmCompletionResult> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages,
        max_tokens: opts?.maxTokens ?? 1024,
        stream: true,
      }),
    })
    if (!res.ok || !res.body) {
      const errText = await res.text()
      throw new Error(`OpenAI API error: ${res.status} ${errText}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let text = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) continue
        const payload = trimmed.slice(5).trim()
        if (payload === "[DONE]") continue
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>
          }
          const delta = json.choices?.[0]?.delta?.content ?? ""
          if (delta) {
            text += delta
            yield { delta }
          }
        } catch {
          /* ignore partial JSON */
        }
      }
    }

    const result: LlmCompletionResult = {
      text,
      tokens: Math.max(100, Math.round(text.length / 2)),
      provider: "openai",
    }
    maybeLog(messages, result, opts)
    return result
  }
}

let cached: LlmAdapter | null = null

export function getLlmAdapter(): LlmAdapter {
  if (cached) return cached
  const key = process.env.OPENAI_API_KEY?.trim()
  cached = key ? new OpenAiAdapter(key) : new MockLlmAdapter()
  return cached
}

export function getLlmProviderName(): "mock" | "openai" {
  return process.env.OPENAI_API_KEY?.trim() ? "openai" : "mock"
}
