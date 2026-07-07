import { ACCENT_OPTIONS, type AccentId } from "@/lib/mock-data"

const STORAGE_KEY = "rakumanual:accent"
const DEFAULT_ACCENT: AccentId = "red"
const VALID_IDS = new Set(ACCENT_OPTIONS.map((o) => o.id))

function isAccentId(value: string): value is AccentId {
  return VALID_IDS.has(value as AccentId)
}

/** 保存済みアクセントカラーを読み込む */
export function loadAccent(): AccentId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && isAccentId(stored)) return stored
  } catch {
    // private browsing 等
  }
  return DEFAULT_ACCENT
}

/** アクセントカラーを保存する */
export function saveAccent(accent: AccentId): void {
  try {
    localStorage.setItem(STORAGE_KEY, accent)
  } catch {
    // 保存不可環境は無視
  }
}

/** 初回描画前に data-accent を適用（React 起動前のフラッシュ防止） */
export function applyAccentToDocument(accent: AccentId = loadAccent()): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-accent", accent)
  }
}
