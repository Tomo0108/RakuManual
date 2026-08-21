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
import {
  COL_WIDTH,
  FLOW_ORIGIN_X,
  FLOW_ORIGIN_Y,
  SYSTEM_ROW_HEIGHT,
  autoLayout,
  colFromX,
  computeLaneRowMetrics,
  dimForKind,
  needsInitialLayout,
} from "@/features/flow/flow-layout"
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

/* ---------- フロー図（スイムレーン・エディタ座標と一致） ---------- */

function prepareFlow(flow: FlowState): FlowState {
  if (!flow.nodes.length) return flow
  return needsInitialLayout(flow) ? autoLayout(flow) : flow
}

/** マニュアル項番 1.1 → 参考資料形式 1-1. */
function formatFlowSectionNo(num?: string): string {
  if (!num?.trim()) return ""
  const n = num.trim().replace(/\./g, "-")
  return n.endsWith(".") ? n : `${n}.`
}

function nodeFill(kind: string | undefined): string {
  if (kind === "start" || kind === "end") return "C00000"
  return "FFFFFF"
}

function nodeShape(pptx: PptxGenJS, kind: string | undefined) {
  if (kind === "decision") return pptx.ShapeType.diamond
  if (kind === "start" || kind === "end") return pptx.ShapeType.ellipse
  return pptx.ShapeType.roundRect
}

type Pt = { x: number; y: number }

function addStraightLine(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  a: Pt,
  b: Pt,
  opts: { color?: string; width?: number; dash?: boolean; endArrow?: boolean },
) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.abs(dx) < 0.002 && Math.abs(dy) < 0.002) return

  const lineOpts = {
    color: opts.color ?? "000000",
    width: opts.width ?? 1.5,
    dashType: opts.dash ? ("dash" as const) : undefined,
    endArrowType: (opts.endArrow ? "triangle" : "none") as "triangle" | "none",
  }

  if (Math.abs(dy) < 0.015) {
    const goingRight = b.x >= a.x
    slide.addShape(pptx.ShapeType.line, {
      x: Math.min(a.x, b.x),
      y: a.y,
      w: Math.max(Math.abs(dx), 0.02),
      h: 0,
      flipH: !goingRight,
      line: lineOpts,
    })
    return
  }

  if (Math.abs(dx) < 0.015) {
    const goingDown = b.y >= a.y
    slide.addShape(pptx.ShapeType.line, {
      x: a.x,
      y: Math.min(a.y, b.y),
      w: 0,
      h: Math.max(Math.abs(dy), 0.02),
      flipV: !goingDown,
      line: lineOpts,
    })
    return
  }

  const mid = { x: (a.x + b.x) / 2, y: a.y }
  addStraightLine(pptx, slide, a, mid, { ...opts, endArrow: false })
  addStraightLine(pptx, slide, mid, { x: mid.x, y: b.y }, { ...opts, endArrow: false })
  addStraightLine(pptx, slide, { x: mid.x, y: b.y }, b, opts)
}

function addOrthoConnector(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  from: { left: number; right: number; top: number; bottom: number; cx: number; cy: number },
  to: { left: number; right: number; top: number; bottom: number; cx: number; cy: number },
  backward: boolean,
) {
  const color = "000000"
  const width = 1.5
  const dash = backward

  if (!backward && Math.abs(from.cy - to.cy) < 0.04) {
    addStraightLine(pptx, slide, { x: from.right, y: from.cy }, { x: to.left, y: to.cy }, {
      color,
      width,
      endArrow: true,
    })
    return
  }

  if (!backward && to.left >= from.right - 0.02) {
    const midX = (from.right + to.left) / 2
    addStraightLine(pptx, slide, { x: from.right, y: from.cy }, { x: midX, y: from.cy }, {
      color,
      width,
    })
    addStraightLine(pptx, slide, { x: midX, y: from.cy }, { x: midX, y: to.cy }, { color, width })
    addStraightLine(pptx, slide, { x: midX, y: to.cy }, { x: to.left, y: to.cy }, {
      color,
      width,
      endArrow: true,
    })
    return
  }

  // 差戻し・後退: 下側迂回
  const detourY = Math.max(from.bottom, to.bottom) + 0.18
  addStraightLine(pptx, slide, { x: from.cx, y: from.bottom }, { x: from.cx, y: detourY }, {
    color,
    width,
    dash,
  })
  addStraightLine(pptx, slide, { x: from.cx, y: detourY }, { x: to.cx, y: detourY }, {
    color,
    width,
    dash,
  })
  addStraightLine(pptx, slide, { x: to.cx, y: detourY }, { x: to.cx, y: to.bottom }, {
    color,
    width,
    dash,
    endArrow: true,
  })
}

function drawFlowOnSlide(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  flow: FlowState,
  _theme: ExportTheme,
  nodeFilter?: Set<string>,
) {
  const nodes = (nodeFilter ? flow.nodes.filter((n) => nodeFilter.has(n.id)) : flow.nodes).filter(
    (n) => n.data.kind !== undefined || n.data.label,
  )
  if (nodes.length === 0) return

  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges = flow.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
  const lanes = flow.lanes.length > 0 ? flow.lanes : ["担当"]
  // レーン高さは全フローの metrics（分割スライドでも行位置を揃える）
  const metrics = computeLaneRowMetrics(flow.nodes, lanes)

  const cols = nodes.map((n) => colFromX(n.position.x, dimForKind(n.data.kind ?? "process").w))
  const minCol = Math.min(...cols)
  const maxCol = Math.max(...cols)
  const colCount = Math.max(1, maxCol - minCol + 1)

  const contentMinX = FLOW_ORIGIN_X + minCol * COL_WIDTH
  const contentMaxX = FLOW_ORIGIN_X + (maxCol + 1) * COL_WIDTH
  const contentMinY = FLOW_ORIGIN_Y
  const last = metrics[metrics.length - 1]
  const contentMaxY =
    (last ? last.top + last.height : FLOW_ORIGIN_Y + 112) + SYSTEM_ROW_HEIGHT + 12
  const pxW = Math.max(contentMaxX - contentMinX, 1)
  const pxH = Math.max(contentMaxY - contentMinY, 1)

  const areaX = 0.32
  const areaY = 1.28
  const areaW = 12.7
  const areaH = 5.35
  const labelW = 1.05
  const plotX = areaX + labelW
  const plotY = areaY
  const plotW = areaW - labelW
  const plotH = areaH
  const scale = Math.min(plotW / pxW, plotH / pxH)

  const toX = (px: number) => plotX + (px - contentMinX) * scale
  const toY = (px: number) => plotY + (px - contentMinY) * scale
  const toS = (px: number) => px * scale

  // レーン帯（可変行高を同じスケールで）
  lanes.forEach((lane, i) => {
    const m = metrics[i] ?? { top: FLOW_ORIGIN_Y + i * 112, height: 112 }
    const y = toY(m.top)
    const h = toS(m.height)
    const bandFill = i % 2 === 0 ? "F2F2F2" : "FFFFFF"
    slide.addShape(pptx.ShapeType.rect, {
      x: areaX,
      y,
      w: labelW,
      h,
      fill: { color: i % 2 === 0 ? "D9E2F3" : "BDD7EE" },
      line: { color: "000000", width: 1 },
    })
    slide.addText(lane, {
      x: areaX,
      y,
      w: labelW,
      h,
      fontSize: Math.min(11, Math.max(8, h * 10)),
      bold: true,
      color: "000000",
      fontFace: FONT_FACE,
      align: "center",
      valign: "middle",
    })
    slide.addShape(pptx.ShapeType.rect, {
      x: plotX,
      y,
      w: toS(pxW),
      h,
      fill: { color: bandFill },
      line: { color: "000000", width: 1 },
    })
  })

  // 利用システム軸
  const systems = flow.layoutMeta?.columnSystems ?? []
  const sysY = toY(last ? last.top + last.height : contentMaxY - SYSTEM_ROW_HEIGHT)
  const sysH = Math.max(toS(SYSTEM_ROW_HEIGHT), 0.28)
  for (let c = minCol; c <= maxCol; c++) {
    const entry = systems[c]
    const x = toX(FLOW_ORIGIN_X + c * COL_WIDTH)
    const w = toS(COL_WIDTH)
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y: sysY,
      w,
      h: sysH,
      fill: { color: "FFF2CC" },
      line: { color: "000000", width: 0.75 },
    })
    if (entry?.label && entry.label !== "—") {
      slide.addText(entry.label, {
        x,
        y: sysY,
        w,
        h: sysH,
        fontSize: 8,
        color: "000000",
        fontFace: FONT_FACE,
        align: "center",
        valign: "middle",
      })
    }
  }

  type Box = {
    left: number
    right: number
    top: number
    bottom: number
    cx: number
    cy: number
    col: number
  }
  const boxes = new Map<string, Box>()
  for (const n of nodes) {
    const d = dimForKind(n.data.kind ?? "process")
    const x = toX(n.position.x)
    const y = toY(n.position.y)
    const w = toS(d.w)
    const h = toS(d.h)
    boxes.set(n.id, {
      left: x,
      right: x + w,
      top: y,
      bottom: y + h,
      cx: x + w / 2,
      cy: y + h / 2,
      col: colFromX(n.position.x, d.w),
    })
  }

  // コネクタ（ノードの下）
  for (const e of edges as FlowEdge[]) {
    const a = boxes.get(e.source)
    const b = boxes.get(e.target)
    if (!a || !b) continue

    const sameCol = Math.abs(a.cx - b.cx) < 0.22
    const backward = b.col < a.col

    if (sameCol && b.cy >= a.cy) {
      addStraightLine(
        pptx,
        slide,
        { x: a.cx, y: a.bottom },
        { x: b.cx, y: b.top },
        { color: "000000", width: 1.5, endArrow: true },
      )
    } else {
      addOrthoConnector(pptx, slide, a, b, backward)
    }

    const label =
      typeof e.label === "string" ? e.label : e.label != null ? String(e.label) : ""
    if (label) {
      slide.addText(label, {
        x: (a.cx + b.cx) / 2 - 0.55,
        y: (a.cy + b.cy) / 2 - 0.14,
        w: 1.1,
        h: 0.26,
        fontSize: 8,
        color: "000000",
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
    const w = toS(d.w)
    const h = toS(d.h)
    const fill = nodeFill(kind)
    const textColor = kind === "start" || kind === "end" ? "FFFFFF" : "000000"
    const shape = nodeShape(pptx, kind)
    const num = formatFlowSectionNo(n.data.sectionNumber)
    const label = num ? `${num}\n${n.data.label}` : n.data.label
    const fontSize = Math.min(10, Math.max(7, Math.min(w, h) * 9))

    const shapeOpts: {
      x: number
      y: number
      w: number
      h: number
      fill: { color: string }
      line: { color: string; width: number }
      rectRadius?: number
    } = {
      x,
      y,
      w,
      h,
      fill: { color: fill },
      line: { color: "000000", width: 1.5 },
    }
    if (shape === pptx.ShapeType.roundRect) shapeOpts.rectRadius = 0.08
    slide.addShape(shape, shapeOpts)
    slide.addText(label, {
      x: x + 0.04,
      y: y + 0.02,
      w: w - 0.08,
      h: h - 0.04,
      fontSize,
      color: textColor,
      fontFace: FONT_FACE,
      align: "center",
      valign: "middle",
      bold: true,
    })
  }

  // 凡例（枠外フッター付近・重なり回避）
  slide.addText("凡例　赤丸:開始/終了　ひし形:分岐　四角:処理", {
    x: 0.35,
    y: 6.75,
    w: 10,
    h: 0.28,
    fontSize: 9,
    color: "444444",
    fontFace: FONT_FACE,
  })
}

/** 列が多いフローは複数スライドに分割（可読なノードサイズを確保） */
function partitionFlowByColumns(flow: FlowState, maxColsPerSlide = 4): FlowNode[][] {
  const nodes = [...flow.nodes]
  if (nodes.length === 0) return []

  const cols = new Map<number, FlowNode[]>()
  for (const n of nodes) {
    const col = colFromX(n.position.x, dimForKind(n.data.kind ?? "process").w)
    const list = cols.get(col) ?? []
    list.push(n)
    cols.set(col, list)
  }
  const sortedCols = [...cols.keys()].sort((a, b) => a - b)
  if (sortedCols.length <= maxColsPerSlide) return [nodes]

  // 1列オーバーラップさせて、分割境界のコネクタが切れないようにする
  const chunks: FlowNode[][] = []
  let i = 0
  while (i < sortedCols.length) {
    const slice = sortedCols.slice(i, i + maxColsPerSlide)
    const chunkNodes = slice.flatMap((c) => cols.get(c) ?? [])
    if (chunkNodes.length) chunks.push(chunkNodes)
    if (i + maxColsPerSlide >= sortedCols.length) break
    i += maxColsPerSlide - 1
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
    const flow = prepareFlow(project.flow)
    const chunks = partitionFlowByColumns(flow)
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
export async function buildManualPptxArrayBuffer(
  project: Project,
  sections: ManualSection[],
  options?: { includeImages?: boolean; includeFlow?: boolean; template?: string },
): Promise<ArrayBuffer> {
  const includeImages = options?.includeImages ?? true
  const includeFlow = options?.includeFlow ?? true
  const theme = resolveExportTheme(options?.template)
  const pptx = new PptxGenJS()
  pptx.author = "Rakumanual"
  pptx.title = project.name
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: SLIDE_W, height: SLIDE_H })
  pptx.layout = "LAYOUT_WIDE"

  const outline = buildManualOutline(sections, { defaultMajorTitle: project.name })
  const preparedFlow = project.flow?.nodes?.length ? prepareFlow(project.flow) : project.flow
  const projectForExport = { ...project, flow: preparedFlow }
  const { planned, sectionSlide, majorSlide } = planPresentation(projectForExport, sections, {
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
      if (preparedFlow) {
        drawFlowOnSlide(pptx, slide, preparedFlow, theme, new Set(item.nodes.map((n) => n.id)))
      }
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

  return (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer
}

export async function exportManualPptx(
  project: Project,
  sections: ManualSection[],
  options?: { includeImages?: boolean; includeFlow?: boolean; template?: string },
): Promise<void> {
  const raw = await buildManualPptxArrayBuffer(project, sections, options)
  const withFont = await applyMeiryoFontToPptx(raw)
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, "_")
  downloadBlob(withFont, `${safeName}.pptx`)
}
