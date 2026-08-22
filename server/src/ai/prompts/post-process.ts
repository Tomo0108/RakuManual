import type { LlmBlockType } from "./schemas.js"
import { normalizeBlockType } from "./schemas.js"

export type RawLlmBlock = {
  type?: string
  text?: string
  needsConfirm?: boolean | string
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
    if (t.startsWith("・") || t.startsWith("●") || t.startsWith("■")) return t
    return `・${t}`
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
