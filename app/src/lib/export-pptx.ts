import type { FlowEdge, FlowNode, FlowState, ManualBlock, ManualSection, Project } from "@/lib/types"
import {
  buildManualOutline,
  displaySectionTitle,
  resolveSectionNumber,
} from "@/lib/manual-outline"
import { downloadBlob, applyMeiryoFontToPptx, FONT_FACE } from "@/lib/pptx-embed-font"
import {
  formatMajorTitle,
  formatMediumHeading,
  resolveExportTheme,
  type ExportTheme,
} from "@/lib/export-theme"
import { dimForKind } from "@/features/flow/flow-layout"
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
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.17,
    fill: { color: theme.navy },
    line: { color: theme.navy, width: 0 },
  })

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

  slide.addShape(pptx.ShapeType.line, {
    x: 0.194,
    y: 0.938,
    w: 12.901,
    h: 0,
    line: { color: theme.accent, width: 2 },
  })

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.194,
    y: 1.125,
    w: 12.901,
    h: 5.628,
    fill: { type: "none" },
    line: { color: theme.frame, width: 2.25 },
    rectRadius: 0.12,
  })

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

/* ---------- フロー図（スイムレーン風） ---------- */

function flowBounds(nodes: FlowNode[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    const d = dimForKind(n.data.kind ?? "process")
    minX = Math.min(minX, n.position.x)
    minY = Math.min(minY, n.position.y)
    maxX = Math.max(maxX, n.position.x + d.w)
    maxY = Math.max(maxY, n.position.y + d.h)
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 400, maxY: 200 }
  }
  return { minX, minY, maxX, maxY }
}

function nodeFill(kind: string | undefined, theme: ExportTheme): string {
  if (kind === "start" || kind === "end") return "C00000"
  if (kind === "decision") return theme.chipBg
  return "FFFFFF"
}

function nodeShape(pptx: PptxGenJS, kind: string | undefined) {
  if (kind === "decision") return pptx.ShapeType.diamond
  if (kind === "start" || kind === "end") return pptx.ShapeType.ellipse
  return pptx.ShapeType.roundRect
}

function drawFlowOnSlide(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  flow: FlowState,
  theme: ExportTheme,
  nodeFilter?: Set<string>,
) {
  const nodes = nodeFilter
    ? flow.nodes.filter((n) => nodeFilter.has(n.id))
    : flow.nodes
  if (nodes.length === 0) return

  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges = flow.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
  const lanes = flow.lanes.length > 0 ? flow.lanes : ["担当"]

  const plotX = 1.35
  const plotY = 1.4
  const plotW = 10.6
  const plotH = 5.1
  const { minX, minY, maxX, maxY } = flowBounds(nodes)
  const pxW = Math.max(maxX - minX, 1)
  const pxH = Math.max(maxY - minY, 1)
  const scale = Math.min(plotW / pxW, plotH / pxH) * 0.9

  const toX = (px: number) => plotX + (px - minX) * scale
  const toY = (px: number) => plotY + (px - minY) * scale
  const toW = (px: number) => Math.max(px * scale, 0.55)
  const toH = (px: number) => Math.max(px * scale, 0.35)

  // レーン帯
  const laneH = plotH / lanes.length
  lanes.forEach((lane, i) => {
    const y = plotY + i * laneH
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.35,
      y,
      w: 0.95,
      h: laneH,
      fill: { color: i % 2 === 0 ? "F3F4F6" : "E5E7EB" },
      line: { color: "D1D5DB", width: 0.75 },
    })
    slide.addText(lane, {
      x: 0.35,
      y,
      w: 0.95,
      h: laneH,
      fontSize: 9,
      bold: true,
      color: "002060",
      fontFace: FONT_FACE,
      align: "center",
      valign: "middle",
    })
    slide.addShape(pptx.ShapeType.rect, {
      x: plotX,
      y,
      w: plotW,
      h: laneH,
      fill: { color: i % 2 === 0 ? "FAFAFA" : "FFFFFF" },
      line: { color: "E5E7EB", width: 0.5 },
    })
  })

  // エッジ（ノードより先に）
  const centers = new Map<string, { x: number; y: number }>()
  for (const n of nodes) {
    const d = dimForKind(n.data.kind ?? "process")
    centers.set(n.id, {
      x: toX(n.position.x) + toW(d.w) / 2,
      y: toY(n.position.y) + toH(d.h) / 2,
    })
  }

  for (const e of edges as FlowEdge[]) {
    const a = centers.get(e.source)
    const b = centers.get(e.target)
    if (!a || !b) continue
    const w = Math.abs(b.x - a.x) || 0.01
    const h = Math.abs(b.y - a.y) || 0.01
    const flipH = b.x < a.x
    const flipV = b.y < a.y
    slide.addShape(pptx.ShapeType.line, {
      x: flipH ? b.x : a.x,
      y: flipV ? b.y : a.y,
      w,
      h,
      flipH,
      flipV,
      line: {
        color: "262626",
        width: 1.25,
        endArrowType: "triangle",
      },
    })
    const label =
      typeof e.label === "string"
        ? e.label
        : e.label != null
          ? String(e.label)
          : ""
    if (label) {
      slide.addText(label, {
        x: (a.x + b.x) / 2 - 0.6,
        y: (a.y + b.y) / 2 - 0.15,
        w: 1.2,
        h: 0.28,
        fontSize: 8,
        color: "374151",
        fontFace: FONT_FACE,
        align: "center",
      })
    }
  }

  // ノード
  for (const n of nodes) {
    const kind = n.data.kind
    const d = dimForKind(kind ?? "process")
    const x = toX(n.position.x)
    const y = toY(n.position.y)
    const w = toW(d.w)
    const h = toH(d.h)
    const fill = nodeFill(kind, theme)
    const textColor = kind === "start" || kind === "end" ? "FFFFFF" : "111827"
    const shape = nodeShape(pptx, kind)
    const num = n.data.sectionNumber ? `${n.data.sectionNumber} ` : ""
    const label = `${num}${n.data.label}`

    slide.addShape(shape, {
      x,
      y,
      w,
      h,
      fill: { color: fill },
      line: { color: "262626", width: 1.25 },
      rectRadius: kind === "process" || !kind ? 0.06 : undefined,
    })
    slide.addText(label, {
      x,
      y,
      w,
      h,
      fontSize: Math.min(10, Math.max(7, h * 14)),
      color: textColor,
      fontFace: FONT_FACE,
      align: "center",
      valign: "middle",
      bold: kind === "start" || kind === "end",
    })
  }

  // 凡例
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 11.15,
    y: 1.35,
    w: 1.85,
    h: 1.55,
    fill: { color: "FFFFFF" },
    line: { color: "D1D5DB", width: 1 },
    rectRadius: 0.06,
  })
  slide.addText(
    [
      { text: "凡例", options: { bold: true, fontSize: 9, breakLine: true } },
      { text: "赤丸: 開始/終了", options: { fontSize: 8, breakLine: true } },
      { text: "ひし形: 分岐", options: { fontSize: 8, breakLine: true } },
      { text: "四角: 処理", options: { fontSize: 8, breakLine: true } },
    ],
    {
      x: 11.25,
      y: 1.42,
      w: 1.65,
      h: 1.4,
      fontFace: FONT_FACE,
      color: "374151",
      valign: "top",
    },
  )
}

/** 列が多いフローは複数スライドに分割 */
function partitionFlowByColumns(flow: FlowState, maxColsPerSlide = 5): FlowNode[][] {
  const nodes = [...flow.nodes]
  if (nodes.length === 0) return []
  if (nodes.length <= 8) return [nodes]

  const cols = new Map<number, FlowNode[]>()
  for (const n of nodes) {
    const col = Math.round(n.position.x / 240)
    const list = cols.get(col) ?? []
    list.push(n)
    cols.set(col, list)
  }
  const sortedCols = [...cols.keys()].sort((a, b) => a - b)
  const chunks: FlowNode[][] = []
  for (let i = 0; i < sortedCols.length; i += maxColsPerSlide) {
    const slice = sortedCols.slice(i, i + maxColsPerSlide)
    chunks.push(slice.flatMap((c) => cols.get(c) ?? []))
  }
  return chunks.length > 0 ? chunks : [nodes]
}

/* ---------- スライド計画（目次リンク用に番号を先に確定） ---------- */

type Planned =
  | { kind: "cover" }
  | { kind: "flow"; nodes: FlowNode[]; part: number; total: number }
  | { kind: "toc" }
  | { kind: "major"; majorNumber: string; majorTitle: string }
  | { kind: "procedure"; part: ProcedurePart }

function planPresentation(
  project: Project,
  sections: ManualSection[],
  options: { includeImages: boolean; includeFlow: boolean },
): {
  planned: Planned[]
  sectionSlide: Map<string, number>
  majorSlide: Map<string, number>
} {
  const planned: Planned[] = [{ kind: "cover" }]

  if (options.includeFlow && project.flow?.nodes?.length) {
    const chunks = partitionFlowByColumns(project.flow)
    chunks.forEach((nodes, i) => {
      planned.push({ kind: "flow", nodes, part: i + 1, total: chunks.length })
    })
  }

  planned.push({ kind: "toc" })

  const parts = buildProcedureParts(sections, project, options.includeImages)
  let lastMajor = ""
  for (const part of parts) {
    if (part.majorNumber !== lastMajor) {
      lastMajor = part.majorNumber
      planned.push({
        kind: "major",
        majorNumber: part.majorNumber,
        majorTitle: part.majorTitle,
      })
    }
    planned.push({ kind: "procedure", part })
  }

  const sectionSlide = new Map<string, number>()
  const majorSlide = new Map<string, number>()
  planned.forEach((p, idx) => {
    const slideNo = idx + 1
    if (p.kind === "major") majorSlide.set(p.majorNumber, slideNo)
    if (p.kind === "procedure" && !sectionSlide.has(p.part.section.id)) {
      sectionSlide.set(p.part.section.id, slideNo)
    }
  })

  return { planned, sectionSlide, majorSlide }
}

/** マニュアルを PowerPoint 出力（フロー図・ハイパーリンク目次付き） */
export async function exportManualPptx(
  project: Project,
  sections: ManualSection[],
  options?: { includeImages?: boolean; includeFlow?: boolean; template?: string },
): Promise<void> {
  const includeImages = options?.includeImages ?? true
  const includeFlow = options?.includeFlow ?? true
  const theme = resolveExportTheme(options?.template)
  const pptx = new PptxGenJS()
  pptx.author = "Rakumanual"
  pptx.title = project.name
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: SLIDE_W, height: SLIDE_H })
  pptx.layout = "LAYOUT_WIDE"

  const outline = buildManualOutline(sections, { defaultMajorTitle: project.name })
  const { planned, sectionSlide, majorSlide } = planPresentation(project, sections, {
    includeImages,
    includeFlow,
  })

  planned.forEach((item, idx) => {
    const pageNum = idx + 1
    const slide = pptx.addSlide()

    if (item.kind === "cover") {
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
      return
    }

    if (item.kind === "flow") {
      const title =
        item.total > 1 ? `業務フロー図（${item.part}/${item.total}）` : "業務フロー図"
      addChrome(pptx, slide, theme, { title, pageNum })
      drawFlowOnSlide(pptx, slide, project.flow, theme, new Set(item.nodes.map((n) => n.id)))
      return
    }

    if (item.kind === "toc") {
      addChrome(pptx, slide, theme, { title: "目次", pageNum })
      const left: PptxGenJS.TextProps[] = []
      const right: PptxGenJS.TextProps[] = []
      const mid = Math.ceil(outline.length / 2)

      outline.forEach((major, mi) => {
        const bucket = mi < mid ? left : right
        const majorTarget = majorSlide.get(major.number) ?? pageNum
        bucket.push({
          text: formatMajorTitle(major.number, major.title),
          options: {
            bold: true,
            fontSize: 13,
            breakLine: true,
            color: theme.navy,
            hyperlink: { slide: majorTarget, tooltip: "この章へ" },
          },
        })
        for (const medium of major.mediums) {
          const first = medium.sections[0]
          const label = first
            ? `${resolveSectionNumber(first) || medium.number}　${displaySectionTitle(first)}`
            : `${medium.number}　${medium.title ?? ""}`
          const target = first ? sectionSlide.get(first.id) ?? majorTarget : majorTarget
          bucket.push({
            text: `  ${label}`,
            options: {
              fontSize: 11,
              breakLine: true,
              color: "0563C1",
              hyperlink: { slide: target, tooltip: label },
            },
          })
        }
        bucket.push({ text: " ", options: { fontSize: 6, breakLine: true } })
      })

      slide.addText(left, {
        x: 0.45,
        y: 1.3,
        w: 6.0,
        h: 5.2,
        fontFace: FONT_FACE,
        valign: "top",
      })
      slide.addText(right, {
        x: 6.7,
        y: 1.3,
        w: 6.0,
        h: 5.2,
        fontFace: FONT_FACE,
        valign: "top",
      })
      return
    }

    if (item.kind === "major") {
      slide.addText(formatMajorTitle(item.majorNumber, item.majorTitle), {
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
      slide.addText(String(pageNum), {
        x: 12.144,
        y: 7.022,
        w: 0.836,
        h: 0.307,
        fontSize: 11,
        color: "444444",
        fontFace: FONT_FACE,
        align: "right",
      })
      return
    }

    // procedure
    const part = item.part
    const slideTitle = formatMajorTitle(part.majorNumber, part.majorTitle)
    addChrome(pptx, slide, theme, {
      title: slideTitle.length > 40 ? slideTitle.slice(0, 40) + "…" : slideTitle,
      chip: part.chip,
      pageNum,
    })

    const items = buildBodyItems(part.blocks, part.mediumHeading)
    const runs = bodyToPptxRuns(items)
    const hasImage = Boolean(part.imageUrl)

    slide.addText(
      runs.length ? runs : [{ text: part.mediumHeading, options: { bold: true, fontSize: 16 } }],
      {
        x: 0.4,
        y: 1.28,
        w: 12.5,
        h: hasImage ? 1.7 : 5.2,
        fontFace: FONT_FACE,
        valign: "top",
      },
    )

    if (part.imageUrl) {
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
  })

  const raw = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer
  const withFont = await applyMeiryoFontToPptx(raw)
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, "_")
  downloadBlob(withFont, `${safeName}.pptx`)
}
