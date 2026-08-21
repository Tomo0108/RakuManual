import type { jsPDF } from "jspdf"
import type { GfxLine, GfxTextOpts, GfxTextRun, SlideGfx } from "@/lib/slide-gfx"

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

export function createPdfSlideGfx(doc: jsPDF): SlideGfx {
  return {
    addRect({ x, y, w, h, fill, line }) {
      const hasFill = applyFill(doc, fill)
      const hasStroke = applyStroke(doc, line)
      if (hasFill && hasStroke) doc.rect(x, y, w, h, "FD")
      else if (hasFill) doc.rect(x, y, w, h, "F")
      else if (hasStroke) doc.rect(x, y, w, h, "S")
    },
    addRoundRect({ x, y, w, h, fill, line, rectRadius }) {
      const r = Math.min(rectRadius ?? 0.1, w / 2, h / 2)
      const hasFill = applyFill(doc, fill)
      const hasStroke = applyStroke(doc, line)
      if (hasFill && hasStroke) doc.roundedRect(x, y, w, h, r, r, "FD")
      else if (hasFill) doc.roundedRect(x, y, w, h, r, r, "F")
      else if (hasStroke) doc.roundedRect(x, y, w, h, r, r, "S")
    },
    addEllipse({ x, y, w, h, fill, line }) {
      const cx = x + w / 2
      const cy = y + h / 2
      const rx = w / 2
      const ry = h / 2
      const hasFill = applyFill(doc, fill)
      const hasStroke = applyStroke(doc, line)
      if (hasFill && hasStroke) doc.ellipse(cx, cy, rx, ry, "FD")
      else if (hasFill) doc.ellipse(cx, cy, rx, ry, "F")
      else if (hasStroke) doc.ellipse(cx, cy, rx, ry, "S")
    },
    addDiamond({ x, y, w, h, fill, line }) {
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
    },
    addCylinder({ x, y, w, h, fill, line }) {
      // 簡易シリンダー: 角丸矩形で近似
      const r = Math.min(0.08, w / 2, h / 4)
      const hasFill = applyFill(doc, fill)
      const hasStroke = applyStroke(doc, line)
      if (hasFill && hasStroke) doc.roundedRect(x, y, w, h, r, r, "FD")
      else if (hasFill) doc.roundedRect(x, y, w, h, r, r, "F")
      else if (hasStroke) doc.roundedRect(x, y, w, h, r, r, "S")
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
    addText(text, opts: GfxTextOpts) {
      const fontName = "Meiryo"
      const align = opts.align ?? "left"
      const valign = opts.valign ?? "top"
      const color = opts.color ?? "000000"
      const fontSize = opts.fontSize ?? 12

      if (opts.fill) {
        doc.setFillColor(hex(opts.fill))
        doc.rect(opts.x, opts.y, opts.w, opts.h, "F")
      }

      const runs: GfxTextRun[] =
        typeof text === "string"
          ? [{ text, bold: opts.bold, fontSize, color, highlight: opts.highlight }]
          : text

      // 行に分割（breakLine）
      const lines: GfxTextRun[][] = [[]]
      for (const run of runs) {
        lines[lines.length - 1]!.push(run)
        if (run.breakLine) lines.push([])
      }
      while (lines.length && lines[lines.length - 1]!.length === 0) lines.pop()

      const lineHeights = lines.map((lineRuns) => {
        const fs = Math.max(...lineRuns.map((r) => r.fontSize ?? fontSize), fontSize)
        return (fs / 72) * 1.15
      })
      const totalH = lineHeights.reduce((a, b) => a + b, 0)
      let cursorY =
        valign === "middle"
          ? opts.y + (opts.h - totalH) / 2
          : valign === "bottom"
            ? opts.y + opts.h - totalH
            : opts.y

      for (let li = 0; li < lines.length; li++) {
        const lineRuns = lines[li]!
        const lh = lineHeights[li]!
        // 行幅概算（全角相当）
        const approxW = lineRuns.reduce((sum, r) => {
          const fs = r.fontSize ?? fontSize
          return sum + [...r.text].reduce((s, ch) => s + (ch.charCodeAt(0) > 255 ? fs : fs * 0.55), 0) / 72
        }, 0)
        let cursorX =
          align === "center"
            ? opts.x + (opts.w - approxW) / 2
            : align === "right"
              ? opts.x + opts.w - approxW
              : opts.x

        for (const run of lineRuns) {
          const fs = run.fontSize ?? fontSize
          const bold = run.bold ?? opts.bold ?? false
          doc.setFont(fontName, bold ? "bold" : "normal")
          doc.setFontSize(fs)
          doc.setTextColor(hex(run.color ?? color))
          if (run.highlight) {
            const tw =
              [...run.text].reduce((s, ch) => s + (ch.charCodeAt(0) > 255 ? fs : fs * 0.55), 0) / 72
            doc.setFillColor(hex(run.highlight))
            doc.rect(cursorX, cursorY, tw, lh, "F")
            doc.setTextColor(hex(run.color ?? color))
          }
          // jsPDF text baseline はおおよそ中央寄りなので少し下げる
          doc.text(run.text, cursorX, cursorY + lh * 0.78, { baseline: "alphabetic" })
          cursorX +=
            [...run.text].reduce((s, ch) => s + (ch.charCodeAt(0) > 255 ? fs : fs * 0.55), 0) / 72
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
