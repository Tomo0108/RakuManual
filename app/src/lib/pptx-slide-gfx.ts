import type PptxGenJS from "pptxgenjs"
import { FONT_FACE } from "@/lib/pptx-embed-font"
import type { GfxHyperlink, GfxLine, GfxTextOpts, GfxTextRun, SlideGfx } from "@/lib/slide-gfx"

function toPptxLine(line: GfxLine | null | undefined) {
  if (!line) return { color: "FFFFFF", width: 0 }
  return {
    color: line.color,
    width: line.width,
    dashType: line.dash ? ("dash" as const) : undefined,
    beginArrowType: (line.beginArrow ? "triangle" : "none") as "triangle" | "none",
    endArrowType: (line.endArrow ? "triangle" : "none") as "triangle" | "none",
  }
}

function fillOpt(fill?: string | null, fillOpacity?: number) {
  if (fill == null || fill === "") return { type: "none" as const }
  const transparency =
    fillOpacity != null && fillOpacity < 0.999 ? Math.round((1 - fillOpacity) * 100) : undefined
  return {
    color: fill,
    ...(transparency != null && transparency > 0 ? { transparency } : {}),
  }
}

function toPptxHyperlink(link?: GfxHyperlink) {
  if (!link) return undefined
  if ("url" in link) {
    return { url: link.url, tooltip: link.tooltip }
  }
  return { slide: link.slide, tooltip: link.tooltip }
}

export function createPptxSlideGfx(pptx: PptxGenJS, slide: PptxGenJS.Slide): SlideGfx {
  return {
    addRect({ x, y, w, h, fill, fillOpacity, line }) {
      slide.addShape(pptx.ShapeType.rect, {
        x,
        y,
        w,
        h,
        fill: fillOpt(fill, fillOpacity),
        line: line === null ? { color: "FFFFFF", width: 0 } : toPptxLine(line ?? { color: "000000", width: 0 }),
      })
    },
    addRoundRect({ x, y, w, h, fill, fillOpacity, line, rectRadius }) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x,
        y,
        w,
        h,
        fill: fillOpt(fill, fillOpacity),
        line: line === null ? { color: "FFFFFF", width: 0 } : toPptxLine(line ?? { color: "000000", width: 0 }),
        rectRadius: rectRadius ?? 0.1,
      })
    },
    addEllipse({ x, y, w, h, fill, fillOpacity, line }) {
      slide.addShape(pptx.ShapeType.ellipse, {
        x,
        y,
        w,
        h,
        fill: fillOpt(fill, fillOpacity),
        line: line === null ? { color: "FFFFFF", width: 0 } : toPptxLine(line ?? { color: "000000", width: 0 }),
      })
    },
    addDiamond({ x, y, w, h, fill, fillOpacity, line }) {
      slide.addShape(pptx.ShapeType.flowChartDecision, {
        x,
        y,
        w,
        h,
        fill: fillOpt(fill, fillOpacity),
        line: line === null ? { color: "FFFFFF", width: 0 } : toPptxLine(line ?? { color: "000000", width: 0 }),
      })
    },
    addCylinder({ x, y, w, h, fill, fillOpacity, line }) {
      slide.addShape(pptx.ShapeType.flowChartMagneticDisk, {
        x,
        y,
        w,
        h,
        fill: fillOpt(fill, fillOpacity),
        line: line === null ? { color: "FFFFFF", width: 0 } : toPptxLine(line ?? { color: "000000", width: 0 }),
      })
    },
    addLine({ x, y, w, h, flipH, flipV, line }) {
      slide.addShape(pptx.ShapeType.line, {
        x,
        y,
        w,
        h,
        flipH,
        flipV,
        line: toPptxLine(line),
      })
    },
    addText(text, opts: GfxTextOpts) {
      const link = toPptxHyperlink(opts.hyperlink)
      // 色付きランに hyperlink を載せると pptxgenjs が ahyp 拡張を付け、環境によってリンクが無効化される。
      // リンクがある場合は色を親オプションに寄せ、テキスト側はリンクのみにする。
      if (typeof text === "string") {
        if (link) {
          slide.addText([{ text, options: { hyperlink: link, bold: opts.bold, fontSize: opts.fontSize } }], {
            x: opts.x,
            y: opts.y,
            w: opts.w,
            h: opts.h,
            fontFace: FONT_FACE,
            fontSize: opts.fontSize,
            bold: opts.bold,
            color: opts.color,
            align: opts.align,
            valign: opts.valign,
            fill: opts.fill ? { color: opts.fill } : undefined,
            highlight: opts.highlight,
            margin: opts.margin,
          })
        } else {
          slide.addText(text, {
            x: opts.x,
            y: opts.y,
            w: opts.w,
            h: opts.h,
            fontFace: FONT_FACE,
            fontSize: opts.fontSize,
            bold: opts.bold,
            color: opts.color,
            align: opts.align,
            valign: opts.valign,
            fill: opts.fill ? { color: opts.fill } : undefined,
            highlight: opts.highlight,
            margin: opts.margin,
          })
        }
        return
      }
      const runs = (text as GfxTextRun[]).map((r) => {
        const runLink = toPptxHyperlink(r.hyperlink ?? opts.hyperlink)
        return {
          text: r.text,
          options: {
            bold: r.bold,
            fontSize: r.fontSize,
            color: runLink ? undefined : r.color,
            highlight: r.highlight,
            breakLine: r.breakLine,
            hyperlink: runLink,
          },
        }
      })
      slide.addText(runs, {
        x: opts.x,
        y: opts.y,
        w: opts.w,
        h: opts.h,
        fontFace: FONT_FACE,
        fontSize: opts.fontSize,
        bold: opts.bold,
        color: opts.color ?? "000000",
        align: opts.align,
        valign: opts.valign,
        fill: opts.fill ? { color: opts.fill } : undefined,
        highlight: opts.highlight,
        margin: opts.margin,
      })
    },
    addImage({ data, x, y, w, h }) {
      slide.addImage({ data, x, y, w, h })
    },
  }
}
