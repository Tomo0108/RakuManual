/**
 * LLM Adapter（プロバイダ抽象化）
 *
 * - 試運転: OpenRouter（LLM_PROVIDER=openrouter / OPENROUTER_API_KEY）
 * - 本番想定: 社内 Gateway（LLM_PROVIDER=gateway / LLM_GATEWAY_*）
 * - 互換: OpenAI 直結も可
 * - 未設定: 構造化モック
 */

import { insertLlmIoLog } from "../db.js"
import { resolveLlmConfig, type LlmRuntimeConfig } from "./config.js"
import { chatComplete, chatStream } from "./openai-compatible.js"
import type {
  LlmAdapter,
  LlmCallContext,
  LlmCompleteOptions,
  LlmCompletionResult,
  LlmMessage,
  LlmProviderId,
  LlmStreamChunk,
} from "./types.js"

export type {
  LlmAdapter,
  LlmCallContext,
  LlmCompleteOptions,
  LlmCompletionResult,
  LlmMessage,
  LlmProviderId,
  LlmStreamChunk,
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
    const result: LlmCompletionResult = { text, tokens, provider: "mock" }
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
  if (system.includes("スイムレーン") || system.includes('"lanes"') || system.includes("フロー設計ルール")) {
    let name = "業務"
    try {
      const parsed = JSON.parse(user) as {
        projectName?: string
        name?: string
        hearingAnswers?: Array<{ questionId?: string; value?: string }>
      }
      name = parsed.projectName ?? parsed.name ?? name
      const steps = parsed.hearingAnswers?.find((a) => a.questionId === "q8")?.value
      const parts = steps
        ? steps
            .split(/[、,。\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 2)
        : [`${name}の準備`, `${name}の実施`]
      return JSON.stringify({
        lanes: ["担当者", "確認者"],
        nodes: [
          { id: "n0", data: { label: "業務開始", lane: "担当者", kind: "start", source: "mock-llm" } },
          {
            id: "n1",
            data: { label: parts[0] ?? `${name}準備`, lane: "担当者", kind: "process", source: "q8" },
          },
          {
            id: "n2",
            data: { label: parts[1] ?? `${name}実施`, lane: "担当者", kind: "process", source: "q8" },
          },
          { id: "n3", data: { label: "内容確認", lane: "確認者", kind: "decision", source: "q3" } },
          { id: "n4", data: { label: "完了", lane: "担当者", kind: "end", source: "q6" } },
        ],
        edges: [
          { id: "e0", source: "n0", target: "n1" },
          { id: "e1", source: "n1", target: "n2" },
          { id: "e2", source: "n2", target: "n3" },
          { id: "e3", source: "n3", target: "n4", label: "はい" },
        ],
      })
    } catch {
      /* fallthrough */
    }
  }

  if (system.includes("セクション") && system.includes("blocks")) {
    try {
      const parsed = JSON.parse(user) as {
        projectName?: string
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
            {
              type: "paragraph",
              text: parsed.section.title ?? "再生成セクション",
              needsConfirm: false,
            },
            {
              type: "note",
              text: "※入力内容を保存前に確認してください。",
              needsConfirm: true,
            },
            {
              type: "step",
              text: "・「保存」ボタンをクリックし、ステータスが「保存済み」になっていることを確認してください。",
              needsConfirm: false,
            },
          ],
        })
      }
      const deepdive = parsed.deepdive ?? []
      const sections =
        deepdive.length > 0
          ? deepdive.map((d, i) => {
              const num = d.sectionNumber ?? `${i + 1}`
              const label = d.stepLabel ?? `ステップ${i + 1}`
              const answerText = (d.answers ?? [])
                .map((a) => a.answer ?? a.value ?? "")
                .filter(Boolean)
                .join(" / ")
              const firstAnswer = (d.answers ?? []).map((a) => a.answer ?? a.value ?? "").find(Boolean)
              const stepText = firstAnswer
                ? firstAnswer.includes("・")
                  ? firstAnswer.startsWith("・")
                    ? firstAnswer.endsWith("。")
                      ? firstAnswer
                      : `${firstAnswer.replace(/[。．]$/, "")}。`
                    : `・${firstAnswer.replace(/[。．]$/, "")}してください。`
                  : `・${firstAnswer.replace(/[。．]$/, "")}してください。`
                : "・画面の指示に従い、必要項目を入力して「保存」ボタンをクリックしてください。"
              return {
                title: `${num}　${label}`,
                sectionNumber: num,
                stepId: d.stepId,
                blocks: [
                  {
                    type: "paragraph",
                    text: `${num}　${label}`,
                    needsConfirm: false,
                  },
                  {
                    type: "note",
                    text: answerText
                      ? `※${answerText}`
                      : "※操作前に入力内容を確認してください。",
                    needsConfirm: !answerText,
                  },
                  {
                    type: "step",
                    text: stepText,
                    needsConfirm: !firstAnswer,
                  },
                ],
              }
            })
          : [
              {
                title: `${parsed.projectName ?? parsed.name ?? "業務"}の概要`,
                sectionNumber: "1",
                blocks: [
                  {
                    type: "paragraph",
                    text: `${parsed.projectName ?? parsed.name ?? "業務"}の手順概要です。`,
                    needsConfirm: true,
                  },
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

  if (system.includes("深掘りヒアリング") || (system.includes("questions") && system.includes("重要度"))) {
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

/** OpenAI 互換エンドポイント向け（OpenRouter / Gateway / OpenAI） */
class CompatibleLlmAdapter implements LlmAdapter {
  constructor(private readonly config: LlmRuntimeConfig) {}

  async complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<LlmCompletionResult> {
    const result = await chatComplete(this.config, messages, { maxTokens: opts?.maxTokens })
    maybeLog(messages, result, opts)
    return result
  }

  async *streamComplete(
    messages: LlmMessage[],
    opts?: LlmCompleteOptions,
  ): AsyncGenerator<LlmStreamChunk, LlmCompletionResult> {
    const stream = chatStream(this.config, messages, { maxTokens: opts?.maxTokens })
    let result: LlmCompletionResult = {
      text: "",
      tokens: 0,
      provider: this.config.provider,
    }
    while (true) {
      const step = await stream.next()
      if (step.done) {
        result = step.value
        break
      }
      yield step.value
    }
    maybeLog(messages, result, opts)
    return result
  }
}

let cached: LlmAdapter | null = null
let cachedConfig: LlmRuntimeConfig | null = null

export function getLlmAdapter(): LlmAdapter {
  if (cached) return cached
  const config = resolveLlmConfig()
  cachedConfig = config
  if (config.provider === "mock") {
    cached = new MockLlmAdapter()
  } else {
    cached = new CompatibleLlmAdapter(config)
  }
  return cached
}

/** テストや設定変更時にキャッシュを捨てる */
export function resetLlmAdapterCache() {
  cached = null
  cachedConfig = null
}

export function getLlmProviderName(): LlmProviderId {
  return (cachedConfig ?? resolveLlmConfig()).provider
}

export function getLlmRuntimeInfo(): {
  provider: LlmProviderId
  model: string
  baseUrl: string
} {
  const config = cachedConfig ?? resolveLlmConfig()
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.provider === "mock" ? "" : config.baseUrl,
  }
}
