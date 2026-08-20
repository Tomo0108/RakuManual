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
    const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? ""
    const text = `[モック生成] ${last.slice(0, 200)}`
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
