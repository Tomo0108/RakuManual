import type { ManualSection } from "@/lib/types"

export interface ManualOutlineMajor {
  key: string
  number: string
  mediums: ManualOutlineMedium[]
}

export interface ManualOutlineMedium {
  key: string
  number: string
  sections: ManualSection[]
}

/** 項番を数値配列に分解 */
export function sectionNumberParts(num?: string): number[] {
  if (!num?.trim()) return []
  return num.split(".").map((p) => Number.parseInt(p, 10)).filter((n) => !Number.isNaN(n))
}

/** セクションの項番を解決（未設定時はタイトル先頭から推定） */
export function resolveSectionNumber(section: ManualSection): string {
  if (section.sectionNumber?.trim()) return section.sectionNumber.trim()
  const m = section.title.match(/^(\d+(?:\.\d+)*)\s*[.．]?\s*/)
  return m?.[1] ?? ""
}

/** 大項目キー (例: "1") */
export function majorKey(num: string): string | null {
  const parts = sectionNumberParts(num)
  return parts.length >= 1 ? String(parts[0]) : null
}

/** 中項目キー (例: "1.1") */
export function mediumKey(num: string): string | null {
  const parts = sectionNumberParts(num)
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null
}

/** 項番の深さ (1=大, 2=中, 3+=小/スライド) */
export function sectionDepth(num: string): number {
  return sectionNumberParts(num).length
}

/** 項番ソート */
export function compareSectionNumbers(a: string, b: string): number {
  const pa = sectionNumberParts(a)
  const pb = sectionNumberParts(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** タイトルから項番プレフィックスを除去 */
export function displaySectionTitle(section: ManualSection): string {
  const num = resolveSectionNumber(section)
  let title = section.title.trim()
  if (num) {
    const re = new RegExp(`^${num.replace(/\./g, "\\.")}\\s*[.．]?\\s*`)
    title = title.replace(re, "").trim()
  }
  title = title.replace(/^\d+(?:\.\d+)*\s*[.．]\s*/, "").trim()
  return title || section.title
}

/** 中項目を細分化する場合のスライド項番を生成 (例: 1.1 + index0 → 1.1.1) */
export function toSlideSectionNumber(mediumNumber?: string, index = 0): string | undefined {
  if (!mediumNumber?.trim()) return undefined
  const parts = sectionNumberParts(mediumNumber)
  if (parts.length >= 3) return mediumNumber
  if (parts.length === 2) return `${mediumNumber}.${index + 1}`
  if (parts.length === 1) return index === 0 ? `${mediumNumber}.1` : `${mediumNumber}.1.${index + 1}`
  return undefined
}

/** セクション一覧を大項目→中項目→小項目(スライド)の階層に整理 */
export function buildManualOutline(sections: ManualSection[]): ManualOutlineMajor[] {
  const sorted = [...sections].sort((a, b) =>
    compareSectionNumbers(resolveSectionNumber(a), resolveSectionNumber(b)),
  )

  const majorMap = new Map<string, ManualOutlineMajor>()

  for (const section of sorted) {
    const num = resolveSectionNumber(section)
    const major = majorKey(num) ?? "0"
    const medium = mediumKey(num) ?? `${major}.0`

    if (!majorMap.has(major)) {
      majorMap.set(major, { key: major, number: major, mediums: [] })
    }
    const majorGroup = majorMap.get(major)!
    let mediumGroup = majorGroup.mediums.find((m) => m.key === medium)
    if (!mediumGroup) {
      mediumGroup = { key: medium, number: medium, sections: [] }
      majorGroup.mediums.push(mediumGroup)
    }
    mediumGroup.sections.push(section)
  }

  return [...majorMap.values()].sort((a, b) => compareSectionNumbers(a.number, b.number))
}

/** パンくず用の項番チェーン (例: ["1", "1.1", "1.1.1"]) */
export function sectionNumberChain(num: string): string[] {
  const parts = sectionNumberParts(num)
  return parts.map((_, i) => parts.slice(0, i + 1).join("."))
}
