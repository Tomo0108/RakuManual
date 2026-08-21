/**
 * LLM 接続設定
 *
 * 最終形: 社内 Gateway（OpenAI 互換 Chat Completions）
 * 試運転: OpenRouter（同じ互換プロトコルでモデル切替）
 * キー未設定: mock
 */

import fs from "node:fs"
import path from "node:path"
import type { LlmProviderId } from "./types.js"

export type { LlmProviderId }
export interface LlmRuntimeConfig {
  provider: LlmProviderId
  /** Chat Completions のベース（末尾 /v1 想定） */
  baseUrl: string
  apiKey: string
  model: string
  extraHeaders: Record<string, string>
}

/** リポジトリルート / server 直下の .env を process.env に読み込む（未設定キーのみ） */
export function loadEnvFiles() {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), "../../.env"),
  ]
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, "utf8")
    for (const line of text.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}

function firstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = process.env[key]?.trim()
    if (v) return v
  }
  return undefined
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "")
}

export function resolveLlmConfig(): LlmRuntimeConfig {
  const explicit = (process.env.LLM_PROVIDER?.trim().toLowerCase() || "") as LlmProviderId | ""

  const openrouterKey = firstEnv("OPENROUTER_API_KEY", "LLM_OPENROUTER_API_KEY")
  const gatewayBase = firstEnv("LLM_GATEWAY_BASE_URL", "GATEWAY_BASE_URL")
  const gatewayKey = firstEnv("LLM_GATEWAY_API_KEY", "LLM_API_KEY", "GATEWAY_API_KEY")
  const openaiKey = firstEnv("OPENAI_API_KEY")

  let provider: LlmProviderId = "mock"
  if (explicit === "mock" || explicit === "openrouter" || explicit === "gateway" || explicit === "openai") {
    provider = explicit
  } else if (openrouterKey) {
    provider = "openrouter"
  } else if (gatewayBase && gatewayKey) {
    provider = "gateway"
  } else if (openaiKey) {
    provider = "openai"
  }

  if (provider === "openrouter") {
    const apiKey = openrouterKey ?? ""
    if (!apiKey) {
      return { provider: "mock", baseUrl: "", apiKey: "", model: "mock", extraHeaders: {} }
    }
    return {
      provider: "openrouter",
      baseUrl: normalizeBaseUrl(
        firstEnv("OPENROUTER_BASE_URL", "LLM_BASE_URL") ?? "https://openrouter.ai/api/v1",
      ),
      apiKey,
      model:
        firstEnv("LLM_MODEL", "OPENROUTER_MODEL", "OPENAI_MODEL") ??
        "openai/gpt-4o-mini",
      extraHeaders: {
        ...(firstEnv("OPENROUTER_HTTP_REFERER", "LLM_HTTP_REFERER")
          ? { "HTTP-Referer": firstEnv("OPENROUTER_HTTP_REFERER", "LLM_HTTP_REFERER")! }
          : { "HTTP-Referer": "https://rakumanual.local" }),
        ...(firstEnv("OPENROUTER_APP_TITLE", "LLM_APP_TITLE")
          ? { "X-Title": firstEnv("OPENROUTER_APP_TITLE", "LLM_APP_TITLE")! }
          : { "X-Title": "RakuManual" }),
      },
    }
  }

  if (provider === "gateway") {
    const apiKey = gatewayKey ?? ""
    const baseUrl = gatewayBase ?? ""
    if (!apiKey || !baseUrl) {
      return { provider: "mock", baseUrl: "", apiKey: "", model: "mock", extraHeaders: {} }
    }
    return {
      provider: "gateway",
      baseUrl: normalizeBaseUrl(baseUrl),
      apiKey,
      model: firstEnv("LLM_MODEL", "LLM_GATEWAY_MODEL", "OPENAI_MODEL") ?? "gpt-4o-mini",
      extraHeaders: parseExtraHeaders(process.env.LLM_GATEWAY_HEADERS),
    }
  }

  if (provider === "openai") {
    const apiKey = openaiKey ?? ""
    if (!apiKey) {
      return { provider: "mock", baseUrl: "", apiKey: "", model: "mock", extraHeaders: {} }
    }
    return {
      provider: "openai",
      baseUrl: normalizeBaseUrl(
        firstEnv("OPENAI_BASE_URL", "LLM_BASE_URL") ?? "https://api.openai.com/v1",
      ),
      apiKey,
      model: firstEnv("LLM_MODEL", "OPENAI_MODEL") ?? "gpt-4o-mini",
      extraHeaders: {},
    }
  }

  return { provider: "mock", baseUrl: "", apiKey: "", model: "mock", extraHeaders: {} }
}

function parseExtraHeaders(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}
