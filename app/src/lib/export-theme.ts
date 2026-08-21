/** マニュアル出力テンプレート色（必須要件の構造は共通、色は差し替え可） */

export interface ExportTheme {
  id: string
  navy: string
  accent: string
  frame: string
  chipBg: string
  chipFg: string
  coverBg: string
  text: string
}

export function resolveExportTheme(template?: string): ExportTheme {
  if (template === "simple") {
    return {
      id: "simple",
      navy: "374151",
      accent: "111827",
      frame: "6B7280",
      chipBg: "F3F4F6",
      chipFg: "374151",
      coverBg: "374151",
      text: "000000",
    }
  }
  if (template === "training") {
    return {
      id: "training",
      navy: "0F766E",
      accent: "0D9488",
      frame: "14B8A6",
      chipBg: "CCFBF1",
      chipFg: "115E59",
      coverBg: "0D9488",
      text: "000000",
    }
  }
  // corporate / RM 系（参考資料に近い既定）
  return {
    id: "corporate",
    navy: "053766",
    accent: "BF0000",
    frame: "FF008C",
    chipBg: "FFE3B5",
    chipFg: "A26600",
    coverBg: "FF008C",
    text: "000000",
  }
}

/** 半角数字 → 全角（大項目番号用） */
export function toZenkakuDigits(num: string): string {
  return num.replace(/\d/g, (d) => "０１２３４５６７８９"[Number(d)] ?? d)
}

export function formatMajorTitle(number: string, title?: string): string {
  const head = `${toZenkakuDigits(number)}．`
  return title?.trim() ? `${head}${title.trim()}` : head
}

export function formatMediumHeading(number: string, title: string, part?: { index: number; total: number }): string {
  const base = `${number}　${title.trim()}`
  if (!part || part.total <= 1) return base
  return `${base}（${part.index}/${part.total}）`
}
