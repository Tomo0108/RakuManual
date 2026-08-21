import type { FlowEdge, FlowNode, FlowState, ManualBlock, ManualSection, Project } from "@/lib/types"
import {
  buildManualOutline,
  displaySectionTitle,
  resolveLeafSectionNumber,
} from "@/lib/manual-outline"
import { downloadBlob, applyMeiryoFontToPptx } from "@/lib/pptx-embed-font"
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
import type { GfxTextRun, SlideGfx } from "@/lib/slide-gfx"
import { createPptxSlideGfx } from "@/lib/pptx-slide-gfx"
import { createPdfSlideGfx } from "@/lib/pdf-slide-gfx"
import { jsPDF } from "jspdf"

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

function bodyToGfxRuns(items: TextItem[]): GfxTextRun[] {
  return items.map((item) => {
    if (item.kind === "blank") {
      return { text: " ", fontSize: 8, breakLine: true }
    }
    if (item.kind === "heading") {
      return { text: item.text, bold: true, fontSize: 16, color: "000000", breakLine: true }
    }
    if (item.kind === "note") {
      return {
        text: item.text,
        bold: true,
        fontSize: 16,
        color: "000000",
        highlight: "FFFF00",
        breakLine: true,
      }
    }
    return { text: item.text, bold: false, fontSize: 16, color: "000000", breakLine: true }
  })
}

function addChrome(
  gfx: SlideGfx,
  theme: ExportTheme,
  opts: { title: string; chip?: string; pageNum: number },
) {
  gfx.addRect({
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.17,
    fill: theme.navy,
    line: null,
  })

  gfx.addText(opts.title, {
    x: 0.238,
    y: 0.271,
    w: opts.chip ? 9.2 : 12.858,
    h: 0.55,
    fontSize: 20,
    bold: true,
    color: theme.text,
    valign: "middle",
  })

  if (opts.chip) {
    gfx.addRoundRect({
      x: 9.606,
      y: 0.325,
      w: 3.49,
      h: 0.472,
      fill: theme.chipBg,
      line: null,
      rectRadius: 0.08,
    })
    gfx.addText(opts.chip, {
      x: 9.606,
      y: 0.325,
      w: 3.49,
      h: 0.472,
      fontSize: 14,
      bold: true,
      color: theme.chipFg,
      align: "center",
      valign: "middle",
    })
  }

  gfx.addLine({
    x: 0.194,
    y: 0.938,
    w: 12.901,
    h: 0,
    line: { color: theme.accent, width: 2 },
  })

  gfx.addRoundRect({
    x: 0.194,
    y: 1.125,
    w: 12.901,
    h: 5.628,
    fill: null,
    line: { color: theme.frame, width: 2.25 },
    rectRadius: 0.12,
  })

  gfx.addText(String(opts.pageNum), {
    x: 12.144,
    y: 7.022,
    w: 0.836,
    h: 0.307,
    fontSize: 11,
    color: "444444",
    align: "right",
    valign: "middle",
  })
}

function estimateBodyHeightInches(items: TextItem[]): number {
  let units = 0
  for (const item of items) {
    if (item.kind === "blank") {
      units += 0.55
      continue
    }
    const len = item.text.length
    // 16pt・幅約12.5in。見積もり不足で画像と被らないようやや保守的に
    units += Math.max(1, Math.ceil(len / 36))
  }
  // 行あたり約 0.32in（16pt + 空段落）＋余白
  return Math.min(3.0, Math.max(0.85, units * 0.32 + 0.12))
}

/** 画面キャプチャの表示 DPI（原寸＝拡大しない） */
const SCREEN_DPI = 96

/**
 * 枠内の最大領域に収め、縦横比を保ち、原寸を超えて拡大しない。
 * 余白は左右中央・上寄せ（本文直下）。
 */
function fitImageInBox(opts: {
  boxX: number
  boxY: number
  boxW: number
  boxH: number
  naturalPxW?: number | null
  naturalPxH?: number | null
}): { x: number; y: number; w: number; h: number } {
  const { boxX, boxY, boxW, boxH } = opts
  if (boxW <= 0 || boxH <= 0) {
    return { x: boxX, y: boxY, w: 0, h: 0 }
  }

  let natW: number
  let natH: number
  if (
    opts.naturalPxW &&
    opts.naturalPxH &&
    opts.naturalPxW > 0 &&
    opts.naturalPxH > 0
  ) {
    natW = opts.naturalPxW / SCREEN_DPI
    natH = opts.naturalPxH / SCREEN_DPI
  } else {
    // 寸法不明時は 16:9 で枠に収める（拡大扱いではなく上限として）
    natW = boxW
    natH = (boxW * 9) / 16
  }

  const scale = Math.min(1, boxW / natW, boxH / natH)
  const w = natW * scale
  const h = natH * scale
  return {
    x: boxX + (boxW - w) / 2,
    y: boxY,
    w,
    h,
  }
}

function probeImageNaturalSize(
  src: string,
): Promise<{ w: number; h: number } | null> {
  if (typeof Image === "undefined") return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      resolve(w > 0 && h > 0 ? { w, h } : null)
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** コンテンツ枠内: 本文の下に画像。枠からはみ出さず、文字と被らず、原寸超拡大しない */
function layoutProcedureImage(opts: {
  hasBody: boolean
  bodyItems: TextItem[]
  imageOnly: boolean
  naturalPxW?: number | null
  naturalPxH?: number | null
}): { text: { x: number; y: number; w: number; h: number }; image: { x: number; y: number; w: number; h: number } } {
  // addChrome の枠: x=0.194 y=1.125 w=12.901 h=5.628 → 下端 6.753。内側に余白
  const contentLeft = 0.4
  const contentWidth = 12.5
  const textY = 1.28
  const frameBottom = 6.55
  const gap = 0.16
  const boxInsetX = 0.35
  const boxW = contentWidth - boxInsetX * 2
  const boxX = contentLeft + boxInsetX

  const textH = opts.imageOnly
    ? 0.7
    : opts.hasBody
      ? estimateBodyHeightInches(opts.bodyItems)
      : 0.85
  const imgTop = Math.min(textY + textH + gap, frameBottom - 0.5)
  const boxH = Math.max(0.4, frameBottom - imgTop)

  const image = fitImageInBox({
    boxX,
    boxY: imgTop,
    boxW,
    boxH,
    naturalPxW: opts.naturalPxW,
    naturalPxH: opts.naturalPxH,
  })

  return {
    text: { x: contentLeft, y: textY, w: contentWidth, h: textH },
    image,
  }
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
        const num = resolveLeafSectionNumber(section, medium.number, medium.sections.indexOf(section))
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

/** 全角換算のおよその文字数（半角は 0.5） */
function approxZenLen(s: string): number {
  let n = 0
  for (const ch of s) n += ch.charCodeAt(0) <= 0xff ? 0.5 : 1
  return n
}

function flowNodeFontSize(wIn: number, hIn: number, text: string): number {
  const chars9 = Math.floor((wIn - 0.1) / 0.125) * Math.floor((hIn - 0.08) / 0.156)
  if (chars9 >= 4 && approxZenLen(text) <= Math.max(chars9, 4)) return 9
  return 8
}

type FlowNodeVisual = {
  fill: string
  line: string
  lineW: number
  text: string
  legendKey: "terminal" | "process" | "approval" | "notify" | "decision"
}

function flowNodeVisual(
  kind: string | undefined,
  connectorId: string | undefined,
  theme: ExportTheme,
): FlowNodeVisual {
  if (kind === "start" || kind === "end") {
    return {
      fill: "FFFFFF",
      line: theme.accent,
      lineW: 2.25,
      text: "000000",
      legendKey: "terminal",
    }
  }
  if (kind === "decision") {
    return {
      fill: "FFF2CC",
      line: "BF8F00",
      lineW: 1.5,
      text: "000000",
      legendKey: "decision",
    }
  }
  if (connectorId === "approval") {
    return {
      fill: "DAE3F3",
      line: "2F5597",
      lineW: 1.5,
      text: "000000",
      legendKey: "approval",
    }
  }
  if (connectorId === "notification") {
    return {
      fill: "EDEDED",
      line: "595959",
      lineW: 1.5,
      text: "000000",
      legendKey: "notify",
    }
  }
  return {
    fill: "FFFFFF",
    line: "000000",
    lineW: 1.5,
    text: "000000",
    legendKey: "process",
  }
}

function flowNodeKind(kind: string | undefined): "diamond" | "ellipse" | "rect" {
  if (kind === "decision") return "diamond"
  if (kind === "start" || kind === "end") return "ellipse"
  return "rect"
}

type Pt = { x: number; y: number }

function addStraightLine(
  gfx: SlideGfx,
  a: Pt,
  b: Pt,
  opts: { color?: string; width?: number; dash?: boolean; endArrow?: boolean },
) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.abs(dx) < 0.002 && Math.abs(dy) < 0.002) return

  const line = {
    color: opts.color ?? "000000",
    width: opts.width ?? 2.25,
    dash: opts.dash,
    endArrow: opts.endArrow,
  }

  if (Math.abs(dy) < 0.015) {
    const goingRight = b.x >= a.x
    gfx.addLine({
      x: Math.min(a.x, b.x),
      y: a.y,
      w: Math.max(Math.abs(dx), 0.02),
      h: 0,
      flipH: !goingRight,
      line,
    })
    return
  }

  if (Math.abs(dx) < 0.015) {
    const goingDown = b.y >= a.y
    gfx.addLine({
      x: a.x,
      y: Math.min(a.y, b.y),
      w: 0,
      h: Math.max(Math.abs(dy), 0.02),
      flipV: !goingDown,
      line,
    })
    return
  }

  const mid = { x: (a.x + b.x) / 2, y: a.y }
  addStraightLine(gfx, a, mid, { ...opts, endArrow: false })
  addStraightLine(gfx, mid, { x: mid.x, y: b.y }, { ...opts, endArrow: false })
  addStraightLine(gfx, { x: mid.x, y: b.y }, b, opts)
}

function addOrthoConnector(
  gfx: SlideGfx,
  from: { left: number; right: number; top: number; bottom: number; cx: number; cy: number },
  to: { left: number; right: number; top: number; bottom: number; cx: number; cy: number },
  backward: boolean,
  detourSlot = 0,
): Pt {
  const color = backward ? "595959" : "000000"
  const width = backward ? 1.0 : 2.25
  const dash = backward

  if (!backward && Math.abs(from.cy - to.cy) < 0.04) {
    addStraightLine(gfx, { x: from.right, y: from.cy }, { x: to.left, y: to.cy }, {
      color,
      width,
      endArrow: true,
    })
    return { x: (from.right + to.left) / 2, y: from.cy }
  }

  if (!backward && to.left >= from.right - 0.02) {
    const midX = (from.right + to.left) / 2
    addStraightLine(gfx, { x: from.right, y: from.cy }, { x: midX, y: from.cy }, {
      color,
      width,
    })
    addStraightLine(gfx, { x: midX, y: from.cy }, { x: midX, y: to.cy }, { color, width })
    addStraightLine(gfx, { x: midX, y: to.cy }, { x: to.left, y: to.cy }, {
      color,
      width,
      endArrow: true,
    })
    return { x: midX, y: (from.cy + to.cy) / 2 }
  }

  const detourY = Math.max(from.bottom, to.bottom) + 0.18 + detourSlot * 0.1
  addStraightLine(gfx, { x: from.cx, y: from.bottom }, { x: from.cx, y: detourY }, {
    color,
    width,
    dash,
  })
  addStraightLine(gfx, { x: from.cx, y: detourY }, { x: to.cx, y: detourY }, {
    color,
    width,
    dash,
  })
  addStraightLine(gfx, { x: to.cx, y: detourY }, { x: to.cx, y: to.bottom }, {
    color,
    width,
    dash,
    endArrow: true,
  })
  return { x: (from.cx + to.cx) / 2, y: detourY }
}

function drawFlowLegend(
  gfx: SlideGfx,
  theme: ExportTheme,
  present: Set<FlowNodeVisual["legendKey"]>,
  hasForward: boolean,
  hasBackward: boolean,
  hasSectionNo: boolean,
  hasOffPage: boolean,
) {
  const items: { key: string; label: string; draw: (x: number, y: number) => void }[] = []

  const push = (
    key: FlowNodeVisual["legendKey"],
    label: string,
    draw: (x: number, y: number) => void,
  ) => {
    if (present.has(key)) items.push({ key, label, draw })
  }

  push("terminal", "開始・終了", (x, y) => {
    gfx.addEllipse({
      x,
      y: y + 0.02,
      w: 0.18,
      h: 0.12,
      fill: "FFFFFF",
      line: { color: theme.accent, width: 1.25 },
    })
  })
  push("process", "処理", (x, y) => {
    gfx.addRect({
      x,
      y: y + 0.02,
      w: 0.18,
      h: 0.12,
      fill: "FFFFFF",
      line: { color: "000000", width: 0.75 },
    })
  })
  push("approval", "承認", (x, y) => {
    gfx.addRect({
      x,
      y: y + 0.02,
      w: 0.18,
      h: 0.12,
      fill: "DAE3F3",
      line: { color: "2F5597", width: 0.75 },
    })
  })
  push("notify", "通知・連絡", (x, y) => {
    gfx.addRect({
      x,
      y: y + 0.02,
      w: 0.18,
      h: 0.12,
      fill: "EDEDED",
      line: { color: "595959", width: 0.75 },
    })
  })
  push("decision", "判断・分岐", (x, y) => {
    gfx.addDiamond({
      x,
      y: y + 0.02,
      w: 0.18,
      h: 0.12,
      fill: "FFF2CC",
      line: { color: "BF8F00", width: 0.75 },
    })
  })

  if (hasForward) {
    items.push({
      key: "fwd",
      label: "順方向",
      draw: (x, y) => {
        gfx.addLine({
          x,
          y: y + 0.08,
          w: 0.22,
          h: 0,
          line: { color: "000000", width: 2.25, endArrow: true },
        })
      },
    })
  }
  if (hasBackward) {
    items.push({
      key: "back",
      label: "差戻し・再実行",
      draw: (x, y) => {
        gfx.addLine({
          x,
          y: y + 0.08,
          w: 0.22,
          h: 0,
          line: { color: "595959", width: 1, dash: true, endArrow: true },
        })
      },
    })
  }
  if (hasOffPage) {
    items.push({
      key: "off",
      label: "ページ間の接続",
      draw: (x, y) => {
        gfx.addEllipse({
          x: x + 0.02,
          y: y + 0.02,
          w: 0.14,
          h: 0.14,
          fill: "C00000",
          line: { color: "000000", width: 0.75 },
        })
        gfx.addText("A", {
          x: x + 0.02,
          y: y + 0.02,
          w: 0.14,
          h: 0.14,
          fontSize: 8,
          bold: true,
          color: "FFFFFF",
          align: "center",
          valign: "middle",
        })
      },
    })
  }
  if (hasSectionNo) {
    items.push({
      key: "sec",
      label: "1-1. 手順書の項番",
      draw: () => {},
    })
  }

  if (items.length === 0) return

  const legendY = 6.4
  gfx.addLine({
    x: 0.32,
    y: 6.36,
    w: 12.7,
    h: 0,
    line: { color: "D9D9D9", width: 0.75 },
  })

  gfx.addText("凡例", {
    x: 0.32,
    y: legendY,
    w: 0.55,
    h: 0.28,
    fontSize: 9,
    bold: true,
    color: "404040",
    valign: "middle",
  })

  const startX = 0.9
  const avail = 12.1
  const slot = Math.min(1.85, avail / items.length)
  items.forEach((item, i) => {
    const x = startX + i * slot
    item.draw(x, legendY + 0.02)
    const textX = item.key === "sec" ? x : x + 0.24
    gfx.addText(item.label, {
      x: textX,
      y: legendY,
      w: slot - 0.28,
      h: 0.28,
      fontSize: 9,
      color: "404040",
      valign: "middle",
    })
  })
}

type FlowOffPageLink = { letter: string; nodeId: string; side: "out" | "in" }

type FlowPartitionOpts = {
  overlapPrevCol?: number
  overlapNextCol?: number
  offPage?: FlowOffPageLink[]
}

function drawFlowOnSlide(
  gfx: SlideGfx,
  flow: FlowState,
  theme: ExportTheme,
  nodeFilter?: Set<string>,
  partition?: FlowPartitionOpts,
) {
  const nodes = (nodeFilter ? flow.nodes.filter((n) => nodeFilter.has(n.id)) : flow.nodes).filter(
    (n) => n.data.kind !== undefined || n.data.label,
  )
  if (nodes.length === 0) return

  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges = flow.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
  const lanes = flow.lanes.length > 0 ? flow.lanes : ["担当"]
  const metrics = computeLaneRowMetrics(flow.nodes, lanes)

  const cols = nodes.map((n) => colFromX(n.position.x, dimForKind(n.data.kind ?? "process").w))
  const minCol = Math.min(...cols)
  const maxCol = Math.max(...cols)

  const contentMinX = FLOW_ORIGIN_X + minCol * COL_WIDTH
  const contentMaxX = FLOW_ORIGIN_X + (maxCol + 1) * COL_WIDTH
  const contentMinY = FLOW_ORIGIN_Y
  const last = metrics[metrics.length - 1]
  const contentMaxY =
    (last ? last.top + last.height : FLOW_ORIGIN_Y + 112) + SYSTEM_ROW_HEIGHT + 12
  const pxW = Math.max(contentMaxX - contentMinX, 1)
  const pxH = Math.max(contentMaxY - contentMinY, 1)

  const areaX = 0.32
  const areaY = 1.3
  const areaW = 12.7
  const areaH = 4.96
  const labelW = 1.2
  const plotX = areaX + labelW
  const plotY = areaY
  const plotW = areaW - labelW
  const plotH = areaH
  const scale = Math.min(plotW / pxW, plotH / pxH)
  const usedW = pxW * scale
  const offsetX = Math.max(0, (plotW - usedW) / 2)

  const toX = (px: number) => plotX + offsetX + (px - contentMinX) * scale
  const toY = (px: number) => plotY + (px - contentMinY) * scale
  const toS = (px: number) => px * scale

  lanes.forEach((lane, i) => {
    const m = metrics[i] ?? { top: FLOW_ORIGIN_Y + i * 112, height: 112 }
    const y = toY(m.top)
    const h = toS(m.height)
    gfx.addRect({
      x: areaX,
      y,
      w: labelW,
      h,
      fill: theme.navy,
      line: null,
    })
    const laneFs = [...lane].length >= 7 ? 9 : 11
    gfx.addText(lane, {
      x: areaX + 0.04,
      y,
      w: labelW - 0.08,
      h,
      fontSize: laneFs,
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "middle",
    })
    if (i > 0) {
      gfx.addLine({
        x: plotX,
        y,
        w: plotW,
        h: 0,
        line: { color: "D9D9D9", width: 0.75 },
      })
    }
  })

  const plotBottom = toY(last ? last.top + last.height : contentMaxY - SYSTEM_ROW_HEIGHT)
  gfx.addLine({
    x: plotX,
    y: plotY,
    w: plotW,
    h: 0,
    line: { color: "D9D9D9", width: 0.75 },
  })
  gfx.addLine({
    x: plotX,
    y: plotBottom,
    w: plotW,
    h: 0,
    line: { color: "D9D9D9", width: 0.75 },
  })

  const systems = flow.layoutMeta?.columnSystems ?? []
  const sysY = toY(last ? last.top + last.height : contentMaxY - SYSTEM_ROW_HEIGHT)
  const sysH = Math.max(toS(SYSTEM_ROW_HEIGHT), 0.28)
  const systemEntries = Array.from({ length: maxCol - minCol + 1 }, (_, i) => {
    const c = minCol + i
    const entry = systems[c]
    return entry?.label && entry.label !== "—" ? { c, label: entry.label } : null
  }).filter(Boolean) as { c: number; label: string }[]

  type SysSpan = { from: number; to: number; label: string }
  const systemSpans: SysSpan[] = []
  for (let i = 0; i < systemEntries.length; ) {
    const start = systemEntries[i]!
    let end = start.c
    let j = i + 1
    while (
      j < systemEntries.length &&
      systemEntries[j]!.label === start.label &&
      systemEntries[j]!.c === end + 1
    ) {
      end = systemEntries[j]!.c
      j += 1
    }
    systemSpans.push({ from: start.c, to: end, label: start.label })
    i = j
  }

  if (systemSpans.length > 0) {
    gfx.addText("利用システム", {
      x: areaX,
      y: sysY,
      w: labelW,
      h: sysH,
      fontSize: 8,
      bold: true,
      color: "595959",
      align: "center",
      valign: "middle",
    })
    for (const span of systemSpans) {
      const x0 = toX(FLOW_ORIGIN_X + span.from * COL_WIDTH)
      const x1 = toX(FLOW_ORIGIN_X + (span.to + 1) * COL_WIDTH)
      const pad = toS(COL_WIDTH) * 0.08
      const x = x0 + pad
      const w = Math.max(x1 - x0 - pad * 2, 0.4)
      gfx.addCylinder({
        x,
        y: sysY + 0.02,
        w,
        h: sysH - 0.04,
        fill: "FFFFFF",
        line: { color: "595959", width: 0.75 },
      })
      gfx.addText(span.label, {
        x,
        y: sysY + 0.02,
        w,
        h: sysH - 0.04,
        fontSize: 9,
        color: "000000",
        align: "center",
        valign: "middle",
      })
    }
  }

  const shadeCol = (col: number, caption: string) => {
    const x = toX(FLOW_ORIGIN_X + col * COL_WIDTH)
    const w = toS(COL_WIDTH)
    gfx.addRect({
      x,
      y: plotY,
      w,
      h: Math.max(plotBottom - plotY, 0.2),
      fill: "F7F7F7",
      line: null,
    })
    gfx.addText(caption, {
      x,
      y: plotY + 0.04,
      w,
      h: 0.22,
      fontSize: 8,
      color: "595959",
      align: "center",
      valign: "middle",
    })
  }
  if (partition?.overlapPrevCol != null) shadeCol(partition.overlapPrevCol, "前ページと重複")
  if (partition?.overlapNextCol != null) shadeCol(partition.overlapNextCol, "次ページに続く")

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

  let hasForward = false
  let hasBackward = false
  let detourSlot = 0

  for (const e of edges as FlowEdge[]) {
    const a = boxes.get(e.source)
    const b = boxes.get(e.target)
    if (!a || !b) continue

    const sameCol = a.col === b.col
    const backward = b.col < a.col
    if (backward) hasBackward = true
    else hasForward = true

    let mid: Pt
    if (sameCol && b.cy >= a.cy) {
      addStraightLine(
        gfx,
        { x: a.cx, y: a.bottom },
        { x: b.cx, y: b.top },
        { color: "000000", width: 2.25, endArrow: true },
      )
      mid = { x: a.cx, y: (a.bottom + b.top) / 2 }
    } else {
      mid = addOrthoConnector(gfx, a, b, backward, backward ? detourSlot++ : 0)
    }

    const label =
      typeof e.label === "string" ? e.label : e.label != null ? String(e.label) : ""
    if (label) {
      const lw = Math.min(1.1, Math.max(0.45, approxZenLen(label) * 0.125 + 0.1))
      gfx.addText(label, {
        x: mid.x - lw / 2,
        y: mid.y - 0.13,
        w: lw,
        h: 0.26,
        fontSize: 9,
        color: "000000",
        align: "center",
        valign: "middle",
        fill: "FFFFFF",
      })
    }
  }

  const present = new Set<FlowNodeVisual["legendKey"]>()
  let hasSectionNo = false

  for (const n of nodes) {
    const kind = n.data.kind
    const d = dimForKind(kind ?? "process")
    const x = toX(n.position.x)
    const y = toY(n.position.y)
    const w = toS(d.w)
    const h = toS(d.h)
    const visual = flowNodeVisual(kind, n.data.connectorId, theme)
    present.add(visual.legendKey)
    const shape = flowNodeKind(kind)
    const num =
      kind === "start" || kind === "end" ? "" : formatFlowSectionNo(n.data.sectionNumber)
    if (num) hasSectionNo = true
    const body = n.data.label ?? ""
    const measure = num ? `${num} ${body}` : body
    const fontSize = flowNodeFontSize(w, h, measure)

    const shapeOpts = {
      x,
      y,
      w,
      h,
      fill: visual.fill,
      line: { color: visual.line, width: visual.lineW },
    }
    if (shape === "diamond") gfx.addDiamond(shapeOpts)
    else if (shape === "ellipse") gfx.addEllipse(shapeOpts)
    else gfx.addRect(shapeOpts)

    const tx = kind === "decision" ? x - 0.04 : x + 0.04
    const tw = kind === "decision" ? w + 0.08 : w - 0.08
    const textOpts = {
      x: tx,
      y: y + 0.02,
      w: tw,
      h: h - 0.04,
      align: "center" as const,
      valign: "middle" as const,
      color: visual.text,
      fontSize,
      margin: 2,
    }

    if (num) {
      gfx.addText(
        [
          { text: `${num} `, bold: true, fontSize, color: visual.text },
          { text: body, bold: false, fontSize, color: visual.text },
        ],
        textOpts,
      )
    } else {
      gfx.addText(body, { ...textOpts, bold: kind === "start" || kind === "end" })
    }
  }

  const offPage = partition?.offPage ?? []
  for (const link of offPage) {
    const box = boxes.get(link.nodeId)
    if (!box) continue
    const size = 0.22
    const x = link.side === "out" ? box.right + 0.04 : box.left - size - 0.04
    const y = box.cy - size / 2
    gfx.addEllipse({
      x,
      y,
      w: size,
      h: size,
      fill: "C00000",
      line: { color: "000000", width: 1 },
    })
    gfx.addText(link.letter, {
      x,
      y,
      w: size,
      h: size,
      fontSize: 10,
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "middle",
    })
  }

  drawFlowLegend(
    gfx,
    theme,
    present,
    hasForward,
    hasBackward,
    hasSectionNo,
    offPage.length > 0,
  )
}

type FlowChunk = {
  nodes: FlowNode[]
  cols: number[]
  overlapPrevCol?: number
  overlapNextCol?: number
}

/** 9pt が成立する最大列数（上限 6） */
function chooseMaxColsPerSlide(flow: FlowState): number {
  const laneCount = Math.max(1, flow.lanes?.length || 1)
  const plotW = 11.5
  const plotH = 4.7
  const process = dimForKind("process")
  for (let max = 6; max >= 3; max--) {
    const pxW = max * COL_WIDTH
    const pxH = laneCount * 112 + SYSTEM_ROW_HEIGHT + 24
    const scale = Math.min(plotW / pxW, plotH / pxH)
    if (process.w * scale >= 0.95 && process.h * scale >= 0.5) return max
  }
  return 3
}

/** 列が多いフローは複数スライドに分割（可読なノードサイズを確保） */
function partitionFlowByColumns(flow: FlowState): FlowChunk[] {
  const nodes = [...flow.nodes]
  if (nodes.length === 0) return []

  const maxColsPerSlide = chooseMaxColsPerSlide(flow)
  const cols = new Map<number, FlowNode[]>()
  for (const n of nodes) {
    const col = colFromX(n.position.x, dimForKind(n.data.kind ?? "process").w)
    const list = cols.get(col) ?? []
    list.push(n)
    cols.set(col, list)
  }
  const sortedCols = [...cols.keys()].sort((a, b) => a - b)
  if (sortedCols.length <= maxColsPerSlide) {
    return [{ nodes, cols: sortedCols }]
  }

  const chunks: FlowChunk[] = []
  let i = 0
  while (i < sortedCols.length) {
    const slice = sortedCols.slice(i, i + maxColsPerSlide)
    const chunkNodes = slice.flatMap((c) => cols.get(c) ?? [])
    if (chunkNodes.length) {
      const overlapPrevCol = i > 0 ? slice[0] : undefined
      const hasMore = i + maxColsPerSlide < sortedCols.length
      const overlapNextCol = hasMore ? slice[slice.length - 1] : undefined
      chunks.push({
        nodes: chunkNodes,
        cols: slice,
        overlapPrevCol,
        overlapNextCol,
      })
    }
    if (i + maxColsPerSlide >= sortedCols.length) break
    i += maxColsPerSlide - 1
  }
  return chunks.length > 0 ? chunks : [{ nodes, cols: sortedCols }]
}

function assignOffPageLinks(
  flow: FlowState,
  chunkNodes: FlowNode[],
  letterMap: Map<string, string>,
): FlowOffPageLink[] {
  const ids = new Set(chunkNodes.map((n) => n.id))
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const links: FlowOffPageLink[] = []
  for (const e of flow.edges) {
    const srcIn = ids.has(e.source)
    const tgtIn = ids.has(e.target)
    if (srcIn === tgtIn) continue
    let letter = letterMap.get(e.id)
    if (!letter) {
      letter = letters[letterMap.size % letters.length]!
      letterMap.set(e.id, letter)
    }
    if (srcIn && !tgtIn) links.push({ letter, nodeId: e.source, side: "out" })
    if (!srcIn && tgtIn) links.push({ letter, nodeId: e.target, side: "in" })
  }
  return links
}

/* ---------- スライド計画（目次リンク用に番号を先に確定） ---------- */

type Planned =
  | { kind: "cover" }
  | {
      kind: "flow"
      nodes: FlowNode[]
      part: number
      total: number
      overlapPrevCol?: number
      overlapNextCol?: number
      offPage: FlowOffPageLink[]
    }
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
  flowSlide?: number
} {
  const planned: Planned[] = [{ kind: "cover" }]

  if (options.includeFlow && project.flow?.nodes?.length) {
    const flow = prepareFlow(project.flow)
    const chunks = partitionFlowByColumns(flow)
    const letterMap = new Map<string, string>()
    chunks.forEach((chunk, i) => {
      planned.push({
        kind: "flow",
        nodes: chunk.nodes,
        part: i + 1,
        total: chunks.length,
        overlapPrevCol: chunk.overlapPrevCol,
        overlapNextCol: chunk.overlapNextCol,
        offPage: assignOffPageLinks(flow, chunk.nodes, letterMap),
      })
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
  let flowSlide: number | undefined
  planned.forEach((p, idx) => {
    const slideNo = idx + 1
    if (p.kind === "major") majorSlide.set(p.majorNumber, slideNo)
    if (p.kind === "procedure" && !sectionSlide.has(p.part.section.id)) {
      sectionSlide.set(p.part.section.id, slideNo)
    }
    if (p.kind === "flow" && flowSlide === undefined) flowSlide = slideNo
  })

  return { planned, sectionSlide, majorSlide, flowSlide }
}

/** スライドデッキを共通描画（PPTX / PDF 同一デザイン） */
async function renderManualDeck(
  project: Project,
  sections: ManualSection[],
  options: { includeImages: boolean; includeFlow: boolean; template?: string },
  createSlide: () => SlideGfx,
): Promise<void> {
  const theme = resolveExportTheme(options.template)
  const outline = buildManualOutline(sections, { defaultMajorTitle: project.name })
  const preparedFlow = project.flow?.nodes?.length ? prepareFlow(project.flow) : project.flow
  const projectForExport = { ...project, flow: preparedFlow }
  const { planned, flowSlide } = planPresentation(
    projectForExport,
    sections,
    {
      includeImages: options.includeImages,
      includeFlow: options.includeFlow,
    },
  )

  const imageNaturalSize = new Map<string, { w: number; h: number } | null>()
  if (options.includeImages) {
    const urls = [
      ...new Set(
        planned
          .filter((p): p is Extract<typeof p, { kind: "procedure" }> => p.kind === "procedure")
          .map((p) => p.part.imageUrl)
          .filter((u): u is string => Boolean(u)),
      ),
    ]
    await Promise.all(
      urls.map(async (url) => {
        imageNaturalSize.set(url, await probeImageNaturalSize(url))
      }),
    )
  }

  planned.forEach((item, idx) => {
    const pageNum = idx + 1
    const gfx = createSlide()

    if (item.kind === "cover") {
      gfx.addRect({
        x: 0,
        y: 0,
        w: SLIDE_W,
        h: SLIDE_H,
        fill: theme.coverBg,
        line: null,
      })
      gfx.addText(project.name, {
        x: 0.8,
        y: 2.6,
        w: 11.7,
        h: 1.4,
        fontSize: 36,
        bold: true,
        color: "FFFFFF",
        align: "center",
      })
      gfx.addText("業務マニュアル", {
        x: 0.8,
        y: 4.2,
        w: 11.7,
        h: 0.5,
        fontSize: 18,
        color: "FFFFFF",
        align: "center",
      })
      return
    }

    if (item.kind === "flow") {
      const title =
        item.total > 1 ? `業務フロー図（${item.part}/${item.total}）` : "業務フロー図"
      addChrome(gfx, theme, { title, pageNum })
      if (preparedFlow) {
        drawFlowOnSlide(gfx, preparedFlow, theme, new Set(item.nodes.map((n) => n.id)), {
          overlapPrevCol: item.overlapPrevCol,
          overlapNextCol: item.overlapNextCol,
          offPage: item.offPage,
        })
      }
      return
    }

    if (item.kind === "toc") {
      addChrome(gfx, theme, { title: "目次", pageNum })
      const left: GfxTextRun[] = []
      const right: GfxTextRun[] = []
      const mid = Math.ceil(outline.length / 2)

      if (flowSlide != null) {
        left.push({ text: "業務フロー図", bold: true, fontSize: 13, color: "0563C1", breakLine: true })
        left.push({ text: " ", fontSize: 6, breakLine: true })
      }

      outline.forEach((major, mi) => {
        const bucket = mi < mid ? left : right
        bucket.push({
          text: formatMajorTitle(major.number, major.title),
          bold: true,
          fontSize: 13,
          color: theme.navy,
          breakLine: true,
        })
        for (const medium of major.mediums) {
          const first = medium.sections[0]
          const label = `${medium.number}　${medium.title ?? (first ? displaySectionTitle(first) : "")}`
          bucket.push({ text: `  ${label}`, fontSize: 11, color: "0563C1", breakLine: true })
        }
        bucket.push({ text: " ", fontSize: 6, breakLine: true })
      })

      gfx.addText(left, { x: 0.45, y: 1.3, w: 6.0, h: 5.2, valign: "top" })
      gfx.addText(right, { x: 6.7, y: 1.3, w: 6.0, h: 5.2, valign: "top" })
      return
    }

    if (item.kind === "major") {
      gfx.addText(formatMajorTitle(item.majorNumber, item.majorTitle), {
        x: 0.367,
        y: 3.1,
        w: 12.6,
        h: 1.0,
        fontSize: 32,
        bold: true,
        color: theme.frame,
        align: "center",
        valign: "middle",
      })
      gfx.addText(String(pageNum), {
        x: 12.144,
        y: 7.022,
        w: 0.836,
        h: 0.307,
        fontSize: 11,
        color: "444444",
        align: "right",
      })
      return
    }

    const part = item.part
    const slideTitle = formatMajorTitle(part.majorNumber, part.majorTitle)
    addChrome(gfx, theme, {
      title: slideTitle.length > 40 ? slideTitle.slice(0, 40) + "…" : slideTitle,
      chip: part.chip,
      pageNum,
    })

    const bodyItems = buildBodyItems(part.blocks, part.mediumHeading)
    const runs = bodyToGfxRuns(bodyItems)
    const hasImage = Boolean(part.imageUrl)
    const imageOnly = hasImage && part.blocks.length === 0
    const natural = part.imageUrl ? imageNaturalSize.get(part.imageUrl) : null
    const layout = hasImage
      ? layoutProcedureImage({
          hasBody: part.blocks.length > 0,
          bodyItems,
          imageOnly,
          naturalPxW: natural?.w,
          naturalPxH: natural?.h,
        })
      : null

    gfx.addText(
      runs.length ? runs : [{ text: part.mediumHeading, bold: true, fontSize: 16 }],
      {
        x: layout?.text.x ?? 0.4,
        y: layout?.text.y ?? 1.28,
        w: layout?.text.w ?? 12.5,
        h: layout?.text.h ?? 5.2,
        valign: "top",
      },
    )

    if (part.imageUrl && layout && layout.image.w > 0 && layout.image.h > 0) {
      gfx.addImage({
        data: part.imageUrl,
        x: layout.image.x,
        y: layout.image.y,
        w: layout.image.w,
        h: layout.image.h,
      })
    }
  })
}

/** マニュアルを PowerPoint 出力（フロー図・目次付き） */
export async function buildManualPptxArrayBuffer(
  project: Project,
  sections: ManualSection[],
  options?: { includeImages?: boolean; includeFlow?: boolean; template?: string },
): Promise<ArrayBuffer> {
  const includeImages = options?.includeImages ?? true
  const includeFlow = options?.includeFlow ?? true
  const pptx = new PptxGenJS()
  pptx.author = "Rakumanual"
  pptx.title = project.name
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: SLIDE_W, height: SLIDE_H })
  pptx.layout = "LAYOUT_WIDE"

  await renderManualDeck(
    project,
    sections,
    { includeImages, includeFlow, template: options?.template },
    () => createPptxSlideGfx(pptx, pptx.addSlide()),
  )

  return (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer
}

const BUNDLED_CJK_FONT_URL = `${import.meta.env.BASE_URL}fonts/NotoSansJP-Regular.ttf`
const PDF_FONT_NAME = "Meiryo"
let pdfFontBase64Cache: string | null = null

async function loadPdfFontBase64(): Promise<string> {
  if (pdfFontBase64Cache) return pdfFontBase64Cache
  const res = await fetch(BUNDLED_CJK_FONT_URL)
  if (!res.ok) throw new Error("日本語フォントの読み込みに失敗しました")
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  pdfFontBase64Cache = btoa(binary)
  return pdfFontBase64Cache
}

/** PowerPoint と同じワイドスライドデザインの PDF を生成 */
export async function buildManualPdfBlob(
  project: Project,
  sections: ManualSection[],
  options?: { includeImages?: boolean; includeFlow?: boolean; template?: string },
): Promise<Blob> {
  const includeImages = options?.includeImages ?? true
  const includeFlow = options?.includeFlow ?? true
  const fontB64 = await loadPdfFontBase64()

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "in",
    format: [SLIDE_W, SLIDE_H],
  })
  doc.addFileToVFS(`${PDF_FONT_NAME}.ttf`, fontB64)
  doc.addFont(`${PDF_FONT_NAME}.ttf`, PDF_FONT_NAME, "normal")
  doc.addFont(`${PDF_FONT_NAME}.ttf`, PDF_FONT_NAME, "bold")
  doc.setFont(PDF_FONT_NAME, "normal")

  let first = true
  await renderManualDeck(
    project,
    sections,
    { includeImages, includeFlow, template: options?.template },
    () => {
      if (!first) doc.addPage([SLIDE_W, SLIDE_H], "landscape")
      first = false
      return createPdfSlideGfx(doc)
    },
  )

  return doc.output("blob")
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

export async function exportManualPdfSlides(
  project: Project,
  sections: ManualSection[],
  options?: { includeImages?: boolean; includeFlow?: boolean; template?: string },
): Promise<void> {
  const blob = await buildManualPdfBlob(project, sections, options)
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, "_")
  downloadBlob(blob, `${safeName}.pdf`)
}
