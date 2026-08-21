import type { ManualBlock, ManualSection, Project } from "@/lib/types"
import {
  buildManualOutline,
  displaySectionTitle,
  resolveSectionNumber,
} from "@/lib/manual-outline"
import { downloadBlob, embedJapaneseFontInPptx, FONT_FACE } from "@/lib/pptx-embed-font"
import {
  formatMajorTitle,
  formatMediumHeading,
  resolveExportTheme,
  type ExportTheme,
} from "@/lib/export-theme"
import PptxGenJS from "pptxgenjs"

/** 必須要件: 13.333 × 7.5 in */
const SLIDE_W = 13.333
const SLIDE_H = 7.5

type TextItem =
  | { kind: "heading"; text: string }
  | { kind: "note"; text: string }
  | { kind: "step"; text: string; stepNo: number }
  | { kind: "para"; text: string }
  | { kind: "blank" }

function buildBodyItems(blocks: ManualBlock[], mediumHeading: string): TextItem[] {
  const items: TextItem[] = [{ kind: "heading", text: mediumHeading }, { kind: "blank" }]
  let stepNo = 0
  for (const block of blocks) {
    if (block.type === "note") {
      const t = block.text.trim().startsWith("※") ? block.text.trim() : `※${block.text.trim()}`
      items.push({ kind: "note", text: t })
      items.push({ kind: "blank" })
    } else if (block.type === "step") {
      stepNo += 1
      items.push({ kind: "step", text: `・${block.text.trim()}`, stepNo })
      items.push({ kind: "blank" })
    } else if (block.text.trim()) {
      items.push({ kind: "para", text: block.text.trim() })
      items.push({ kind: "blank" })
    }
  }
  while (items.length && items[items.length - 1]?.kind === "blank") items.pop()
  return items
}

function bodyToPptxRuns(items: TextItem[]): PptxGenJS.TextProps[] {
  return items.map((item) => {
    if (item.kind === "blank") {
      return { text: " ", options: { fontSize: 8, breakLine: true } }
    }
    if (item.kind === "heading") {
      return {
        text: item.text,
        options: { bold: true, fontSize: 16, color: "000000", breakLine: true },
      }
    }
    if (item.kind === "note") {
      return {
        text: item.text,
        options: {
          bold: true,
          fontSize: 16,
          color: "000000",
          highlight: "FFFF00",
          breakLine: true,
        },
      }
    }
    return {
      text: item.text,
      options: { bold: false, fontSize: 16, color: "000000", breakLine: true },
    }
  })
}

function addChrome(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  theme: ExportTheme,
  opts: { title: string; chip?: string; pageNum: number },
) {
  // D2 上端ネイビーバー
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.17,
    fill: { color: theme.navy },
    line: { color: theme.navy, width: 0 },
  })

  // D3 タイトル 20pt
  slide.addText(opts.title, {
    x: 0.238,
    y: 0.271,
    w: opts.chip ? 9.2 : 12.858,
    h: 0.55,
    fontSize: 20,
    bold: true,
    color: theme.text,
    fontFace: FONT_FACE,
    valign: "middle",
  })

  // D6 識別チップ
  if (opts.chip) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 9.606,
      y: 0.325,
      w: 3.49,
      h: 0.472,
      fill: { color: theme.chipBg },
      line: { color: theme.chipBg, width: 0 },
      rectRadius: 0.08,
    })
    slide.addText(opts.chip, {
      x: 9.606,
      y: 0.325,
      w: 3.49,
      h: 0.472,
      fontSize: 14,
      bold: true,
      color: theme.chipFg,
      fontFace: FONT_FACE,
      align: "center",
      valign: "middle",
    })
  }

  // D4 区切り線 2pt
  slide.addShape(pptx.ShapeType.line, {
    x: 0.194,
    y: 0.938,
    w: 12.901,
    h: 0,
    line: { color: theme.accent, width: 2 },
  })

  // D5 コンテンツ枠（塗りなし・枠線のみ）
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.194,
    y: 1.125,
    w: 12.901,
    h: 5.628,
    fill: { type: "none" },
    line: { color: theme.frame, width: 2.25 },
    rectRadius: 0.12,
  })

  // D7 ページ番号
  slide.addText(String(opts.pageNum), {
    x: 12.144,
    y: 7.022,
    w: 0.836,
    h: 0.307,
    fontSize: 11,
    color: "444444",
    fontFace: FONT_FACE,
    align: "right",
    valign: "middle",
  })
}

type ProcedurePart = {
  section: ManualSection
  majorTitle: string
  majorNumber: string
  mediumHeading: string
  blocks: ManualBlock[]
  imageUrl?: string
  chip?: string
}

function buildProcedureParts(
  sections: ManualSection[],
  project: Project,
  includeImages: boolean,
): ProcedurePart[] {
  const outline = buildManualOutline(sections, { defaultMajorTitle: project.name })
  const parts: ProcedurePart[] = []

  for (const major of outline) {
    for (const medium of major.mediums) {
      for (const section of medium.sections) {
        const title = displaySectionTitle(section)
        const num = resolveSectionNumber(section) || medium.number
        const images = includeImages
          ? section.blocks.map((b) => b.image?.url).filter((u): u is string => Boolean(u))
          : []
        const total = Math.max(1, images.length)
        const chip = major.title ? `【${major.title}】` : undefined

        if (images.length === 0) {
          parts.push({
            section,
            majorTitle: major.title ?? project.name,
            majorNumber: major.number,
            mediumHeading: formatMediumHeading(num, title),
            blocks: section.blocks,
            chip,
          })
          continue
        }

        images.forEach((url, i) => {
          parts.push({
            section,
            majorTitle: major.title ?? project.name,
            majorNumber: major.number,
            mediumHeading: formatMediumHeading(num, title, { index: i + 1, total }),
            blocks: i === 0 ? section.blocks : [],
            imageUrl: url,
            chip,
          })
        })
      }
    }
  }
  return parts
}

/** マニュアルを PowerPoint 出力（必須要件準拠・LAYOUT_WIDE・Noto Sans JP 埋め込み） */
export async function exportManualPptx(
  project: Project,
  sections: ManualSection[],
  options?: { includeImages?: boolean; template?: string },
): Promise<void> {
  const includeImages = options?.includeImages ?? true
  const theme = resolveExportTheme(options?.template)
  const pptx = new PptxGenJS()
  pptx.author = "ラクマニュアル"
  pptx.title = project.name
  pptx.layout = "LAYOUT_WIDE"
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: SLIDE_W, height: SLIDE_H })
  pptx.layout = "LAYOUT_WIDE"

  let pageNum = 0
  const nextPage = () => {
    pageNum += 1
    return pageNum
  }

  // —— 表紙 ——
  {
    const slide = pptx.addSlide()
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: SLIDE_W,
      h: SLIDE_H,
      fill: { color: theme.coverBg },
      line: { width: 0 },
    })
    slide.addText(project.name, {
      x: 0.8,
      y: 2.6,
      w: 11.7,
      h: 1.4,
      fontSize: 36,
      bold: true,
      color: "FFFFFF",
      fontFace: FONT_FACE,
      align: "center",
    })
    slide.addText("業務マニュアル", {
      x: 0.8,
      y: 4.2,
      w: 11.7,
      h: 0.5,
      fontSize: 18,
      color: "FFFFFF",
      fontFace: FONT_FACE,
      align: "center",
    })
    nextPage()
  }

  const outline = buildManualOutline(sections, { defaultMajorTitle: project.name })

  // —— 目次 ——
  {
    const slide = pptx.addSlide()
    const pn = nextPage()
    addChrome(pptx, slide, theme, { title: "目次", pageNum: pn })
    const lines: PptxGenJS.TextProps[] = []
    for (const major of outline) {
      lines.push({
        text: formatMajorTitle(major.number, major.title),
        options: { bold: true, fontSize: 14, breakLine: true, color: theme.navy },
      })
      for (const medium of major.mediums) {
        const first = medium.sections[0]
        const label = first
          ? `${resolveSectionNumber(first) || medium.number}　${displaySectionTitle(first)}`
          : `${medium.number}　${medium.title ?? ""}`
        lines.push({
          text: `    ${label}`,
          options: { fontSize: 12, breakLine: true, color: "000000" },
        })
      }
      lines.push({ text: " ", options: { fontSize: 8, breakLine: true } })
    }
    slide.addText(lines, {
      x: 0.45,
      y: 1.3,
      w: 12.4,
      h: 5.2,
      fontFace: FONT_FACE,
      valign: "top",
    })
  }

  // —— 大項目中扉 + 操作手順 ——
  let lastMajor = ""
  const parts = buildProcedureParts(sections, project, includeImages)

  for (const part of parts) {
    if (part.majorNumber !== lastMajor) {
      lastMajor = part.majorNumber
      const slide = pptx.addSlide()
      nextPage()
      slide.addText(formatMajorTitle(part.majorNumber, part.majorTitle), {
        x: 0.367,
        y: 3.1,
        w: 12.6,
        h: 1.0,
        fontSize: 32,
        bold: true,
        color: theme.frame,
        fontFace: FONT_FACE,
        align: "center",
        valign: "middle",
      })
    }

    const slide = pptx.addSlide()
    const pn = nextPage()
    const slideTitle = formatMajorTitle(part.majorNumber, part.majorTitle)
    addChrome(pptx, slide, theme, {
      title: slideTitle.length > 40 ? slideTitle.slice(0, 40) + "…" : slideTitle,
      chip: part.chip,
      pageNum: pn,
    })

    const items = buildBodyItems(part.blocks, part.mediumHeading)
    const runs = bodyToPptxRuns(items)
    const hasImage = Boolean(part.imageUrl)

    // 本文（画像ありは上半分、なしは枠内いっぱい）
    slide.addText(runs.length ? runs : [{ text: part.mediumHeading, options: { bold: true, fontSize: 16 } }], {
      x: 0.4,
      y: 1.28,
      w: 12.5,
      h: hasImage ? 1.7 : 5.2,
      fontFace: FONT_FACE,
      valign: "top",
      // 行間100%（必須 F4）。余白は blank ランで確保
    })

    if (part.imageUrl) {
      // I1: 本文下・横長大判（キャプションは付けない I6）
      slide.addImage({
        data: part.imageUrl,
        x: 0.55,
        y: 3.15,
        w: 12.2,
        h: 3.35,
        sizing: { type: "contain", w: 12.2, h: 3.35 },
        shadow: {
          type: "outer",
          color: "000000",
          blur: 6,
          opacity: 0.25,
          offset: 2,
        },
      })
    }
  }

  const raw = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer
  const withFont = await embedJapaneseFontInPptx(raw)
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, "_")
  downloadBlob(withFont, `${safeName}.pptx`)
}
