/**
 * LLM Adapter（プロバイダ抽象化）
 * OPENAI_API_KEY があれば実 API、なければモック（デモ用）にフォールバック。
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
