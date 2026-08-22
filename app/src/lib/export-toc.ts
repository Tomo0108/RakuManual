import type { ManualOutlineMajor } from "@/lib/manual-outline"
import { displaySectionTitle } from "@/lib/manual-outline"
import type { ExportTheme } from "@/lib/export-theme"
import type { SlideGfx } from "@/lib/slide-gfx"

/** 目次の構造（PDF / PPTX / HTML 共通） */
export type TocItem =
  | { kind: "flow" }
  | { kind: "rule" }
  | { kind: "major"; majorNumber: string; title: string }
  | {
      kind: "medium"
      majorNumber: string
      mediumNumber: string
      title: string
      sectionId?: string
    }

const TOC_Y0 = 1.36
const TOC_Y1 = 6.56
const TOC_X = 0.52
const TOC_RIGHT = 12.85
const PAGE_W = 0.55
/** リーダー（点線）の開始位置。全行で揃える */
const LEADER_X = 9.15

export function tocItemHeight(kind: TocItem["kind"]): number {
  if (kind === "flow") return 0.44
  if (kind === "rule") return 0.3
  if (kind === "major") return 0.48
  return 0.36
}

/** 大項目→中項目のみ。小項目(1.1.1)は目次に出さない */
export function buildTocItems(outline: ManualOutlineMajor[], includeFlow: boolean): TocItem[] {
  const items: TocItem[] = []
  if (includeFlow) {
    items.push({ kind: "flow" })
    items.push({ kind: "rule" })
  }
  for (const major of outline) {
    items.push({
      kind: "major",
      majorNumber: major.number,
      title: (major.title ?? "").trim(),
    })
    for (const medium of major.mediums) {
      const first = medium.sections[0]
      const title =
        (medium.title ?? "").trim() || (first ? displaySectionTitle(first) : "")
      items.push({
        kind: "medium",
        majorNumber: major.number,
        mediumNumber: medium.number,
        title,
        sectionId: first?.id,
      })
    }
  }
  return items
}

export function paginateTocItems(items: TocItem[]): TocItem[][] {
  const budget = TOC_Y1 - TOC_Y0
  const pages: TocItem[][] = []
  let current: TocItem[] = []
  let used = 0

  const pushPage = () => {
    if (!current.length) return
    if (current[current.length - 1]?.kind === "rule") current.pop()
    if (current.length) pages.push(current)
    current = []
    used = 0
  }

  for (const item of items) {
    const h = tocItemHeight(item.kind)
    if (current.length > 0 && used + h > budget) {
      pushPage()
    }
    if (item.kind === "rule" && current.length === 0) continue
    current.push(item)
    used += h
  }
  pushPage()
  return pages.length ? pages : [[]]
}

export function formatTocMajorNumber(majorNumber: string): string {
  const n = majorNumber.replace(/\.0+$/, "")
  return n.endsWith(".") ? n : `${n}.`
}

export function drawTocSlide(
  gfx: SlideGfx,
  theme: ExportTheme,
  items: TocItem[],
  pageOf: (item: TocItem) => number | undefined,
): void {
  let y = TOC_Y0
  const pageX = TOC_RIGHT - PAGE_W
  const leaderRight = pageX - 0.12
  const muted = "5C6770"

  const addLeaders = (left: number, midY: number) => {
    if (left >= leaderRight - 0.2) return
    gfx.addLine({
      x: left,
      y: midY,
      w: leaderRight - left,
      h: 0,
      line: { color: "C5CDD6", width: 1.15, dash: true },
    })
  }

  const addPage = (page: number | undefined, rowY: number, rowH: number, slide?: number) => {
    if (page == null) return
    gfx.addText(String(page), {
      x: pageX,
      y: rowY,
      w: PAGE_W,
      h: rowH,
      fontSize: 12,
      color: muted,
      align: "right",
      valign: "middle",
      hyperlink: slide ? { slide, tooltip: `${page}` } : undefined,
    })
  }

  for (const item of items) {
    const h = tocItemHeight(item.kind)
    const page = pageOf(item)
    const slide = page

    if (item.kind === "flow") {
      gfx.addEllipse({
        x: TOC_X,
        y: y + (h - 0.13) / 2,
        w: 0.13,
        h: 0.13,
        fill: theme.navy,
        line: null,
      })
      gfx.addText("業務フロー図", {
        x: TOC_X + 0.28,
        y,
        w: LEADER_X - TOC_X - 0.4,
        h,
        fontSize: 16,
        bold: true,
        color: theme.navy,
        valign: "middle",
        hyperlink: slide ? { slide, tooltip: "業務フロー図へ" } : undefined,
      })
      if (page != null) addLeaders(LEADER_X, y + h / 2)
      addPage(page, y, h, slide)
    } else if (item.kind === "rule") {
      gfx.addLine({
        x: TOC_X,
        y: y + h / 2,
        w: TOC_RIGHT - TOC_X,
        h: 0,
        line: { color: "C5CDD6", width: 1.35 },
      })
    } else if (item.kind === "major") {
      const num = formatTocMajorNumber(item.majorNumber)
      gfx.addText(num, {
        x: TOC_X,
        y,
        w: 0.72,
        h,
        fontSize: 18,
        bold: true,
        color: theme.navy,
        valign: "middle",
        hyperlink: slide ? { slide, tooltip: item.title || num } : undefined,
      })
      gfx.addText(item.title || " ", {
        x: TOC_X + 0.78,
        y,
        w: LEADER_X - TOC_X - 0.9,
        h,
        fontSize: 16,
        bold: true,
        color: theme.navy,
        valign: "middle",
        hyperlink: slide ? { slide, tooltip: item.title || num } : undefined,
      })
      if (page != null) addLeaders(LEADER_X, y + h / 2)
      addPage(page, y, h, slide)
    } else {
      gfx.addText(item.mediumNumber, {
        x: TOC_X + 0.55,
        y,
        w: 0.9,
        h,
        fontSize: 14,
        color: "2A3038",
        valign: "middle",
        hyperlink: slide ? { slide, tooltip: item.title } : undefined,
      })
      gfx.addText(item.title || " ", {
        x: TOC_X + 1.52,
        y,
        w: LEADER_X - TOC_X - 1.64,
        h,
        fontSize: 14,
        color: "2A3038",
        valign: "middle",
        hyperlink: slide ? { slide, tooltip: item.title } : undefined,
      })
      if (page != null) addLeaders(LEADER_X, y + h / 2)
      addPage(page, y, h, slide)
    }

    y += h
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function tocItemsToHtml(
  items: TocItem[],
  hrefOf: (item: TocItem) => string | undefined,
  pageOf: (item: TocItem) => number | undefined,
): string {
  const parts: string[] = ['<div class="toc-list">']
  for (const item of items) {
    const href = hrefOf(item)
    const page = pageOf(item)
    const pg = page != null ? `<span class="pg">${page}</span>` : ""
    const lead = page != null ? `<span class="lead" aria-hidden="true"></span>` : ""
    if (item.kind === "flow") {
      const inner = `<span class="disc" aria-hidden="true"></span><span class="ttl">業務フロー図</span>${lead}${pg}`
      parts.push(
        href
          ? `<a class="toc-flow" href="${escapeHtml(href)}">${inner}</a>`
          : `<div class="toc-flow">${inner}</div>`,
      )
    } else if (item.kind === "rule") {
      parts.push(`<hr class="toc-rule" />`)
    } else if (item.kind === "major") {
      const num = formatTocMajorNumber(item.majorNumber)
      const inner = `<span class="num">${escapeHtml(num)}</span><span class="ttl">${escapeHtml(item.title)}</span>${lead}${pg}`
      parts.push(
        href
          ? `<a class="toc-major" href="${escapeHtml(href)}">${inner}</a>`
          : `<div class="toc-major">${inner}</div>`,
      )
    } else {
      const inner = `<span class="num">${escapeHtml(item.mediumNumber)}</span><span class="ttl">${escapeHtml(item.title)}</span>${lead}${pg}`
      parts.push(
        href
          ? `<a class="toc-medium" href="${escapeHtml(href)}">${inner}</a>`
          : `<div class="toc-medium">${inner}</div>`,
      )
    }
  }
  parts.push("</div>")
  return parts.join("")
}

export function tocItemsToSidebarHtml(
  items: TocItem[],
  hrefOf: (item: TocItem) => string | undefined,
): string {
  const parts: string[] = []
  for (const item of items) {
    const href = hrefOf(item)
    if (item.kind === "flow") {
      const inner = `<span class="disc" aria-hidden="true"></span>業務フロー図`
      parts.push(
        href
          ? `<a class="side-link flow" href="${escapeHtml(href)}">${inner}</a>`
          : "",
      )
    } else if (item.kind === "rule") {
      parts.push(`<hr class="side-rule" />`)
    } else if (item.kind === "major") {
      const num = formatTocMajorNumber(item.majorNumber)
      const inner = `<span class="num">${escapeHtml(num)}</span>${escapeHtml(item.title)}`
      parts.push(
        href
          ? `<a class="side-link major" href="${escapeHtml(href)}">${inner}</a>`
          : "",
      )
    } else {
      const inner = `<span class="num">${escapeHtml(item.mediumNumber)}</span>${escapeHtml(item.title)}`
      parts.push(
        href
          ? `<a class="side-link medium" href="${escapeHtml(href)}">${inner}</a>`
          : "",
      )
    }
  }
  return parts.join("")
}
