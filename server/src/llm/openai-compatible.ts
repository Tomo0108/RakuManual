/**
 * OpenAI 互換 Chat Completions クライアント
 * OpenRouter / 社内 Gateway / OpenAI いずれも同一プロトコル。
 */

import type { LlmCompletionResult, LlmMessage, LlmStreamChunk } from "./types.js"
import type { LlmRuntimeConfig } from "./config.js"

const DEFAULT_TIMEOUT_MS = 60_000
const MAX_RETRIES = 2

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function isRetryableStatus(status: number) {
  return status === 429 || status >= 500
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`LLM request timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function chatComplete(
  config: LlmRuntimeConfig,
  messages: LlmMessage[],
  opts?: { maxTokens?: number; timeoutMs?: number },
): Promise<LlmCompletionResult> {
  const url = `${config.baseUrl}/chat/completions`
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const body = JSON.stringify({
    model: config.model,
    messages,
    max_tokens: opts?.maxTokens ?? 1024,
  })
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    ...config.extraHeaders,
  }

  let lastError: Error | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(
        url,
        { method: "POST", headers, body },
        timeoutMs,
      )
      if (!res.ok) {
        const errText = await res.text()
        const err = new Error(`${config.provider} API error: ${res.status} ${errText.slice(0, 500)}`)
        if (isRetryableStatus(res.status) && attempt < MAX_RETRIES) {
          lastError = err
          await sleep(500 * 2 ** attempt)
          continue
        }
        throw err
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
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
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const retryable =
        lastError.message.includes("timed out") ||
        lastError.message.includes("API error: 429") ||
        /API error: 5\d\d/.test(lastError.message)
      if (retryable && attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt)
        continue
      }
      throw lastError
    }
  }
  throw lastError ?? new Error("LLM request failed")
}

export async function* chatStream(
  config: LlmRuntimeConfig,
  messages: LlmMessage[],
  opts?: { maxTokens?: number; timeoutMs?: number },
): AsyncGenerator<LlmStreamChunk, LlmCompletionResult> {
  const url = `${config.baseUrl}/chat/completions`
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const res = await fetchWithTimeout(
    url,
    {
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
    },
    timeoutMs,
  )
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
