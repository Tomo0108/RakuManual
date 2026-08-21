/**
 * OpenAI 互換 Chat Completions クライアント
 * OpenRouter / 社内 Gateway / OpenAI いずれも同一プロトコル。
 */

import type { LlmCompletionResult, LlmMessage, LlmStreamChunk } from "./types.js"
import type { LlmRuntimeConfig } from "./config.js"

export async function chatComplete(
  config: LlmRuntimeConfig,
  messages: LlmMessage[],
  opts?: { maxTokens?: number },
): Promise<LlmCompletionResult> {
  const url = `${config.baseUrl}/chat/completions`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...config.extraHeaders,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: opts?.maxTokens ?? 1024,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`${config.provider} API error: ${res.status} ${errText.slice(0, 500)}`)
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number }
  }
  const text = data.choices?.[0]?.message?.content ?? ""
  const usageTotal =
    data.usage?.total_tokens ??
    ((data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0) || undefined)
  const tokens = usageTotal && usageTotal > 0 ? usageTotal : Math.max(100, Math.round(text.length / 2))
  return {
    text,
    tokens,
    provider: config.provider,
  }
}

export async function* chatStream(
  config: LlmRuntimeConfig,
  messages: LlmMessage[],
  opts?: { maxTokens?: number },
): AsyncGenerator<LlmStreamChunk, LlmCompletionResult> {
  const url = `${config.baseUrl}/chat/completions`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...config.extraHeaders,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: opts?.maxTokens ?? 1024,
      stream: true,
    }),
  })
  if (!res.ok || !res.body) {
    const errText = await res.text()
    throw new Error(`${config.provider} API error: ${res.status} ${errText.slice(0, 500)}`)
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

  return {
    text,
    tokens: Math.max(100, Math.round(text.length / 2)),
    provider: config.provider,
  }
}
