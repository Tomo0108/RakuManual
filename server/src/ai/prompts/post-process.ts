import type { LlmBlockType } from "./schemas.js"
import { normalizeBlockType } from "./schemas.js"

export type RawLlmBlock = {
  type?: string
  text?: string
  needsConfirm?: boolean | string
}

/** step 文末の「〜すること」を敬体「〜してください。」へ（安全な末尾限定） */
function polishStepEnding(text: string): string {
  return text
    .replace(/してくださいすること[。．]?\s*$/u, "してください。")
    .replace(/しないこと[。．]?\s*$/u, "しないでください。")
    .replace(/すること[。．]?\s*$/u, "してください。")
}

function polishStepText(text: string): string {
  if (!text.includes("\n")) return polishStepEnding(text)
  return text
    .split("\n")
    .map((line) => polishStepEnding(line))
    .join("\n")
}

/** LLM 出力 block をアプリ/export 向けに正規化（API 不要） */
export function normalizeBlockText(type: LlmBlockType, text: string): string {
  const t = text.trim()
  if (!t) return t
  if (type === "note") {
    if (t.startsWith("※")) return t
    return `※${t}`
  }
  if (type === "step") {
    const body = t.startsWith("・") || t.startsWith("●") || t.startsWith("■") ? t : `・${t}`
    return polishStepText(body)
  }
  return t
}

export function postProcessBlock(raw: RawLlmBlock): {
  type: LlmBlockType
  text: string
  needsConfirm: boolean
} {
  const type = normalizeBlockType(String(raw.type ?? "paragraph"))
  const text = normalizeBlockText(type, String(raw.text ?? ""))
  const needsConfirm = raw.needsConfirm === true || raw.needsConfirm === "true"
  return { type, text, needsConfirm }
}

/** UI 文言の「」不足を軽く検出（警告用） */
export function countMissingUiQuotes(text: string): number {
  const uiHints = /ボタン|フィールド|タブ|メニュー|リンク|ステータス|アプリ|画面/g
  const matches = text.match(uiHints)
  if (!matches) return 0
  const hasQuote = /「[^」]+」/.test(text)
  return hasQuote ? 0 : matches.length
}
