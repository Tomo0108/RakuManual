import type { GfxLine, GfxTextOpts, GfxTextRun, SlideGfx } from "@/lib/slide-gfx"

const SLIDE_W = 13.333
const SLIDE_H = 7.5

function hex(c: string) {
  return c.startsWith("#") ? c : `#${c}`
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function fillAttr(fill?: string | null, fillOpacity?: number): string {
  if (fill == null || fill === "") return `fill="none"`
  const op = fillOpacity == null || fillOpacity >= 0.999 ? "" : ` fill-opacity="${fillOpacity}"`
  return `fill="${hex(fill)}"${op}`
}

function strokeAttr(line?: GfxLine | null): string {
  if (!line || line.width <= 0) return `stroke="none"`
  const dash = line.dash ? ` stroke-dasharray="0.08 0.06"` : ""
  return `stroke="${hex(line.color)}" stroke-width="${(line.width / 72).toFixed(4)}"${dash}`
}

function wrapLine(text: string, maxZen: number): string[] {
  if (maxZen <= 1) return [text]
  const lines: string[] = []
  let cur = ""
  let len = 0
  for (const ch of text) {
    const w = ch.charCodeAt(0) <= 0xff ? 0.5 : 1
    if (cur && len + w > maxZen) {
      lines.push(cur)
      cur = ch
      len = w
    } else {
      cur += ch
      len += w
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : [""]
}

export function createSvgSlideGfx(): { gfx: SlideGfx; toSvg: () => string } {
  const parts: string[] = []
  let markerId = 0

  const pushArrowMarker = (color: string) => {
    markerId += 1
    const id = `arr-${markerId}`
    parts.push(
      `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${hex(color)}"/></marker>`,
    )
    return id
  }

  const gfx: SlideGfx = {
    addRect({ x, y, w, h, fill, fillOpacity, line }) {
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${fillAttr(fill, fillOpacity)} ${strokeAttr(line)} />`,
      )
    },
    addRoundRect({ x, y, w, h, fill, fillOpacity, line, rectRadius }) {
      const r = rectRadius ?? 0.1
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" ${fillAttr(fill, fillOpacity)} ${strokeAttr(line)} />`,
      )
    },
    addEllipse({ x, y, w, h, fill, fillOpacity, line }) {
      parts.push(
        `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${fillAttr(fill, fillOpacity)} ${strokeAttr(line)} />`,
      )
    },
    addDiamond({ x, y, w, h, fill, fillOpacity, line }) {
      const cx = x + w / 2
      const cy = y + h / 2
      const d = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`
      parts.push(`<polygon points="${d}" ${fillAttr(fill, fillOpacity)} ${strokeAttr(line)} />`)
    },
    addCylinder({ x, y, w, h, fill, fillOpacity, line }) {
      const r = Math.min(0.08, w / 2, h / 4)
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" ${fillAttr(fill, fillOpacity)} ${strokeAttr(line)} />`,
      )
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
      const end = line.endArrow ? ` marker-end="url(#${pushArrowMarker(line.color)})"` : ""
      const begin = line.beginArrow ? ` marker-start="url(#${pushArrowMarker(line.color)})"` : ""
      parts.push(
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${fillAttr(null)} ${strokeAttr(line)}${end}${begin} />`,
      )
    },
    addText(text, opts: GfxTextOpts) {
      if (opts.fill) {
        parts.push(
          `<rect x="${opts.x}" y="${opts.y}" width="${opts.w}" height="${opts.h}" ${fillAttr(opts.fill)} stroke="none" />`,
        )
      }
      const runs: GfxTextRun[] =
        typeof text === "string"
          ? [{ text, bold: opts.bold, fontSize: opts.fontSize, color: opts.color }]
          : text
      const raw = runs.map((r) => r.text).join("")
      const fs = opts.fontSize ?? 12
      const fsIn = fs / 72
      const maxZen = Math.max(2, (opts.w * 72) / fs)
      const lines = wrapLine(raw, maxZen)
      const lh = fsIn * 1.25
      const totalH = lines.length * lh
      const align = opts.align ?? "left"
      const valign = opts.valign ?? "top"
      let startY = opts.y + fsIn * 0.9
      if (valign === "middle") startY = opts.y + (opts.h - totalH) / 2 + fsIn * 0.9
      else if (valign === "bottom") startY = opts.y + opts.h - totalH + fsIn * 0.9
      const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start"
      const tx =
        align === "center" ? opts.x + opts.w / 2 : align === "right" ? opts.x + opts.w : opts.x
      const weight = opts.bold || (typeof text !== "string" && runs.some((r) => r.bold)) ? "700" : "400"
      const color = hex(opts.color ?? "000000")
      const wrap = (inner: string) => {
        if (opts.hyperlink && "url" in opts.hyperlink) {
          return `<a href="${escapeXml(opts.hyperlink.url)}">${inner}</a>`
        }
        return inner
      }
      lines.forEach((line, i) => {
        parts.push(
          wrap(
            `<text x="${tx}" y="${startY + i * lh}" text-anchor="${anchor}" font-size="${fsIn}" font-weight="${weight}" fill="${color}" font-family="Meiryo, 'Hiragino Sans', 'Noto Sans JP', sans-serif">${escapeXml(line)}</text>`,
          ),
        )
      })
    },
    addHyperlinkArea() {
      /* HTML フロー SVG では目次リンクを使わない */
    },
    addImage() {
      /* flow slides do not embed raster images */
    },
  }

  const toSvg = () =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SLIDE_W} ${SLIDE_H}" width="100%" role="img" aria-label="業務フロー図">${parts.join("")}</svg>`

  return { gfx, toSvg }
}
