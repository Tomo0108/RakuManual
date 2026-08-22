import type { jsPDF } from "jspdf"
import type { GfxHyperlink, GfxLine, GfxTextOpts, GfxTextRun, SlideGfx } from "@/lib/slide-gfx"

function hex(c: string) {
  return c.startsWith("#") ? c : `#${c}`
}

function applyStroke(doc: jsPDF, line: GfxLine | null | undefined) {
  if (!line || line.width <= 0) {
    doc.setDrawColor(255, 255, 255)
    doc.setLineWidth(0)
    return false
  }
  doc.setDrawColor(hex(line.color))
  doc.setLineWidth(line.width / 72) // pt → inch
  if (line.dash) doc.setLineDashPattern([0.08, 0.06], 0)
  else doc.setLineDashPattern([], 0)
  return true
}

function applyFill(doc: jsPDF, fill: string | null | undefined) {
  if (!fill) return false
  doc.setFillColor(hex(fill))
  return true
}

function withFillOpacity(doc: jsPDF, fillOpacity: number | undefined, draw: () => void) {
  if (fillOpacity == null || fillOpacity >= 0.999) {
    draw()
    return
  }
  const anyDoc = doc as jsPDF & {
    GState?: new (opts: { opacity: number }) => unknown
    setGState?: (g: unknown) => void
    saveGraphicsState?: () => void
    restoreGraphicsState?: () => void
  }
  try {
    if (anyDoc.GState && anyDoc.setGState) {
      anyDoc.saveGraphicsState?.()
      anyDoc.setGState(new anyDoc.GState({ opacity: fillOpacity }))
      draw()
      anyDoc.restoreGraphicsState?.()
      return
    }
  } catch {
    /* fall through */
  }
  draw()
}

function drawArrowHead(
  doc: jsPDF,
  tipX: number,
  tipY: number,
  fromX: number,
  fromY: number,
  color: string,
) {
  const dx = tipX - fromX
  const dy = tipY - fromY
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const size = 0.08
  const bx = tipX - ux * size
  const by = tipY - uy * size
  const px = -uy * size * 0.45
  const py = ux * size * 0.45
  doc.setFillColor(hex(color))
  doc.triangle(tipX, tipY, bx + px, by + py, bx - px, by - py, "F")
}

function applyPdfLink(doc: jsPDF, x: number, y: number, w: number, h: number, link?: GfxHyperlink) {
  if (!link || w <= 0 || h <= 0) return
  try {
    if ("url" in link) {
      doc.link(x, y, w, h, { url: link.url })
    } else {
      doc.link(x, y, w, h, { pageNumber: link.slide })
    }
  } catch {
    /* ignore invalid link targets */
  }
}

function textWidthIn(text: string, fontSize: number) {
  return [...text].reduce((s, ch) => s + (ch.charCodeAt(0) > 255 ? fontSize : fontSize * 0.55), 0) / 72
}

export function createPdfSlideGfx(doc: jsPDF): SlideGfx {
  return {
    addRect({ x, y, w, h, fill, fillOpacity, line }) {
      const hasFill = applyFill(doc, fill)
      const hasStroke = applyStroke(doc, line)
      withFillOpacity(doc, hasFill ? fillOpacity : undefined, () => {
        if (hasFill && hasStroke) doc.rect(x, y, w, h, "FD")
        else if (hasFill) doc.rect(x, y, w, h, "F")
        else if (hasStroke) doc.rect(x, y, w, h, "S")
      })
    },
    addRoundRect({ x, y, w, h, fill, fillOpacity, line, rectRadius }) {
      const r = Math.min(rectRadius ?? 0.1, w / 2, h / 2)
      const hasFill = applyFill(doc, fill)
      const hasStroke = applyStroke(doc, line)
      withFillOpacity(doc, hasFill ? fillOpacity : undefined, () => {
        if (hasFill && hasStroke) doc.roundedRect(x, y, w, h, r, r, "FD")
        else if (hasFill) doc.roundedRect(x, y, w, h, r, r, "F")
        else if (hasStroke) doc.roundedRect(x, y, w, h, r, r, "S")
      })
    },
    addEllipse({ x, y, w, h, fill, fillOpacity, line }) {
      const cx = x + w / 2
      const cy = y + h / 2
      const rx = w / 2
      const ry = h / 2
      const hasFill = applyFill(doc, fill)
      const hasStroke = applyStroke(doc, line)
      withFillOpacity(doc, hasFill ? fillOpacity : undefined, () => {
        if (hasFill && hasStroke) doc.ellipse(cx, cy, rx, ry, "FD")
        else if (hasFill) doc.ellipse(cx, cy, rx, ry, "F")
        else if (hasStroke) doc.ellipse(cx, cy, rx, ry, "S")
      })
    },
    addDiamond({ x, y, w, h, fill, fillOpacity, line }) {
      const cx = x + w / 2
      const cy = y + h / 2
      const pts: [number, number][] = [
        [cx, y],
        [x + w, cy],
        [cx, y + h],
        [x, cy],
      ]
      const hasFill = applyFill(doc, fill)
      const hasStroke = applyStroke(doc, line)
      const style = hasFill && hasStroke ? "FD" : hasFill ? "F" : "S"
      withFillOpacity(doc, hasFill ? fillOpacity : undefined, () => {
        doc.lines(
          [
            [pts[1]![0] - pts[0]![0], pts[1]![1] - pts[0]![1]],
            [pts[2]![0] - pts[1]![0], pts[2]![1] - pts[1]![1]],
            [pts[3]![0] - pts[2]![0], pts[3]![1] - pts[2]![1]],
            [pts[0]![0] - pts[3]![0], pts[0]![1] - pts[3]![1]],
          ],
          pts[0]![0],
          pts[0]![1],
          [1, 1],
          style,
          true,
        )
      })
    },
    addCylinder({ x, y, w, h, fill, fillOpacity, line }) {
      const r = Math.min(0.08, w / 2, h / 4)
      const hasFill = applyFill(doc, fill)
      const hasStroke = applyStroke(doc, line)
      withFillOpacity(doc, hasFill ? fillOpacity : undefined, () => {
        if (hasFill && hasStroke) doc.roundedRect(x, y, w, h, r, r, "FD")
        else if (hasFill) doc.roundedRect(x, y, w, h, r, r, "F")
        else if (hasStroke) doc.roundedRect(x, y, w, h, r, r, "S")
      })
    },
    addLine({ x, y, w, h, flipH, flipV, line }) {
      let x1 = x
      let y1 = y
      let x2 = x + w
      let y2 = y + h
      if (h === 0) {
        if (flipH) [x1, x2] = [x2, x1]
      } else if (w === 0) {
        if (flipV) [y1, y2] = [y2, y1]
      }
      applyStroke(doc, line)
      doc.line(x1, y1, x2, y2)
      if (line.endArrow) drawArrowHead(doc, x2, y2, x1, y1, line.color)
      if (line.beginArrow) drawArrowHead(doc, x1, y1, x2, y2, line.color)
      doc.setLineDashPattern([], 0)
    },
    addHyperlinkArea({ x, y, w, h, hyperlink }) {
      applyPdfLink(doc, x, y, w, h, hyperlink)
    },
    addText(text, opts: GfxTextOpts) {
      const fontName = "Meiryo"
      const align = opts.align ?? "left"
      const valign = opts.valign ?? "top"
      const color = opts.color ?? "000000"
      const fontSize = opts.fontSize ?? 12

      const setPdfFont = (bold?: boolean) => {
        try {
          doc.setFont(fontName, bold ? "bold" : "normal")
        } catch {
          try {
            doc.setFont(fontName, "normal")
          } catch {
            /* keep previous font */
          }
        }
      }

      if (opts.fill) {
        doc.setFillColor(hex(opts.fill))
        doc.rect(opts.x, opts.y, opts.w, opts.h, "F")
      }

      const runs: GfxTextRun[] =
        typeof text === "string"
          ? [{ text, bold: opts.bold, fontSize, color, highlight: opts.highlight, hyperlink: opts.hyperlink }]
          : text.map((r) => ({ ...r, hyperlink: r.hyperlink ?? opts.hyperlink }))

      // breakLine で段落分割したうえで、各 run を幅で折り返す
      type Seg = { text: string; bold?: boolean; fontSize: number; color: string; highlight?: string; hyperlink?: GfxHyperlink }
      const paragraphs: Seg[][] = [[]]
      for (const run of runs) {
        const fs = run.fontSize ?? fontSize
        setPdfFont(run.bold ?? opts.bold)
        doc.setFontSize(fs)
        const wrapped = doc.splitTextToSize(run.text || " ", Math.max(opts.w, 0.2)) as string[]
        wrapped.forEach((line, i) => {
          paragraphs[paragraphs.length - 1]!.push({
            text: line,
            bold: run.bold ?? opts.bold,
            fontSize: fs,
            color: run.color ?? color,
            highlight: run.highlight,
            hyperlink: run.hyperlink,
          })
          if (i < wrapped.length - 1) paragraphs.push([])
        })
        if (run.breakLine) paragraphs.push([])
      }
      while (paragraphs.length && paragraphs[paragraphs.length - 1]!.length === 0) paragraphs.pop()

      const lineHeights = paragraphs.map((segs) => {
        const fs = Math.max(...segs.map((s) => s.fontSize), fontSize)
        return (fs / 72) * 1.2
      })
      const totalH = lineHeights.reduce((a, b) => a + b, 0)
      let cursorY =
        valign === "middle"
          ? opts.y + Math.max(0, (opts.h - totalH) / 2)
          : valign === "bottom"
            ? opts.y + Math.max(0, opts.h - totalH)
            : opts.y
      const bottom = opts.y + opts.h

      if (
        typeof text === "string" &&
        opts.hyperlink &&
        (align === "center" || align === "right" || valign === "middle")
      ) {
        applyPdfLink(doc, opts.x, opts.y, opts.w, opts.h, opts.hyperlink)
      }

      for (let li = 0; li < paragraphs.length; li++) {
        if (cursorY + lineHeights[li]! > bottom + 0.01) break
        const segs = paragraphs[li]!
        const lh = lineHeights[li]!
        const approxW = segs.reduce((sum, s) => sum + textWidthIn(s.text, s.fontSize), 0)
        let cursorX =
          align === "center"
            ? opts.x + (opts.w - approxW) / 2
            : align === "right"
              ? opts.x + opts.w - approxW
              : opts.x

        for (const seg of segs) {
          const tw = textWidthIn(seg.text, seg.fontSize)
          setPdfFont(seg.bold)
          doc.setFontSize(seg.fontSize)
          doc.setTextColor(hex(seg.color))
          if (seg.highlight) {
            doc.setFillColor(hex(seg.highlight))
            doc.rect(cursorX, cursorY, tw, lh, "F")
            doc.setTextColor(hex(seg.color))
          }
          doc.text(seg.text, cursorX, cursorY + lh * 0.78, { baseline: "alphabetic" })
          if (seg.hyperlink && !(typeof text === "string" && opts.hyperlink)) {
            applyPdfLink(doc, cursorX, cursorY, Math.max(tw, 0.2), lh, seg.hyperlink)
          }
          cursorX += tw
        }
        cursorY += lh
      }
    },
    addImage({ data, x, y, w, h }) {
      try {
        const format = data.startsWith("data:image/jpeg")
          ? "JPEG"
          : data.startsWith("data:image/webp")
            ? "WEBP"
            : "PNG"
        doc.addImage(data, format, x, y, w, h)
      } catch {
        /* skip broken images */
      }
    },
  }
}
