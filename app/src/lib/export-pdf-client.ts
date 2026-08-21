import { jsPDF } from "jspdf"
import type { ManualBlock, ManualSection, Project } from "@/lib/types"
import {
  buildManualOutline,
  displaySectionTitle,
  resolveLeafSectionNumber,
} from "@/lib/manual-outline"
import {
  formatMajorTitle,
  formatMediumHeading,
  resolveExportTheme,
} from "@/lib/export-theme"

/** public/fonts に配置。Vite の BASE_URL 経由で確実に取得（失敗時はエラーにして Helvetica 化けを防ぐ） */
const BUNDLED_CJK_FONT_URL = `${import.meta.env.BASE_URL}fonts/NotoSansJP-Regular.ttf`

/** PDF 内の論理フォント名 */
const FONT_NAME = "Meiryo"

let fontBase64Cache: string | null = null

async function loadFontBase64(): Promise<string> {
  if (fontBase64Cache) return fontBase64Cache
  const res = await fetch(BUNDLED_CJK_FONT_URL)
  if (!res.ok) throw new Error("日本語フォントの読み込みに失敗しました")
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  fontBase64Cache = btoa(binary)
  return fontBase64Cache
}

function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * ブラウザだけで PDF を生成（UIプレビュー / API 不通時も動作）
 * 日本語は必ずバンドル済みフォントを埋め込み（読み込み失敗で化けるのを防止）
 */
export async function exportManualPdfClient(
  project: Project,
  sections: ManualSection[],
  options?: { includeImages?: boolean; includeFlow?: boolean; template?: string },
): Promise<void> {
  const includeImages = options?.includeImages ?? true
  const theme = resolveExportTheme(options?.template)
  const fontB64 = await loadFontBase64()

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 18
  const contentW = pageW - margin * 2

  doc.addFileToVFS(`${FONT_NAME}.ttf`, fontB64)
  doc.addFont(`${FONT_NAME}.ttf`, FONT_NAME, "normal")
  doc.addFont(`${FONT_NAME}.ttf`, FONT_NAME, "bold")
  doc.setFont(FONT_NAME, "normal")

  const setFont = (style: "normal" | "bold", size: number) => {
    doc.setFont(FONT_NAME, style)
    doc.setFontSize(size)
  }

  let y = margin

  const ensureSpace = (need: number) => {
    if (y + need > pageH - margin) {
      doc.addPage()
      y = margin
      drawHeaderBar()
      y = margin + 8
    }
  }

  const drawHeaderBar = () => {
    doc.setFillColor(`#${theme.navy}`)
    doc.rect(0, 0, pageW, 4, "F")
  }

  const addWrapped = (text: string, size: number, style: "normal" | "bold", color = "#000000") => {
    setFont(style, size)
    doc.setTextColor(color)
    const lines = doc.splitTextToSize(text, contentW) as string[]
    for (const line of lines) {
      ensureSpace(size * 0.45 + 2)
      doc.text(line, margin, y)
      y += size * 0.42 + 1.2
    }
  }

  drawHeaderBar()
  doc.setFillColor(`#${theme.coverBg}`)
  doc.rect(0, 40, pageW, 80, "F")
  setFont("bold", 22)
  doc.setTextColor("#FFFFFF")
  const titleLines = doc.splitTextToSize(project.name, contentW) as string[]
  let ty = 70
  for (const line of titleLines) {
    doc.text(line, pageW / 2, ty, { align: "center" })
    ty += 10
  }
  setFont("normal", 12)
  doc.text("業務マニュアル", pageW / 2, ty + 8, { align: "center" })

  if (options?.includeFlow !== false && project.flow?.nodes?.length) {
    doc.addPage()
    drawHeaderBar()
    y = margin + 8
    addWrapped("業務フロー概要", 16, "bold", `#${theme.navy}`)
    y += 2
    project.flow.nodes.forEach((n, i) => {
      const label = `[${n.data?.lane ?? ""}] ${n.data?.label ?? ""}`
      addWrapped(`${i + 1}. ${label}`, 11, "normal")
    })
  }

  const outline = buildManualOutline(sections, { defaultMajorTitle: project.name })
  let lastMajor = ""
  let lastMedium = ""

  for (const major of outline) {
    for (const medium of major.mediums) {
      medium.sections.forEach((section, si) => {
        if (major.number !== lastMajor) {
          lastMajor = major.number
          lastMedium = ""
          doc.addPage()
          drawHeaderBar()
          y = margin + 8
          addWrapped(formatMajorTitle(major.number, major.title), 18, "bold", `#${theme.frame}`)
          y += 3
          doc.setDrawColor(`#${theme.accent}`)
          doc.setLineWidth(0.6)
          doc.line(margin, y, pageW - margin, y)
          y += 6
        }
        if (medium.number !== lastMedium) {
          lastMedium = medium.number
          ensureSpace(12)
          addWrapped(
            medium.title ? `${medium.number}　${medium.title}` : medium.number,
            14,
            "bold",
            "#333333",
          )
          y += 2
        }

        const num = resolveLeafSectionNumber(section, medium.number, si)
        const heading = formatMediumHeading(num, displaySectionTitle(section))
        ensureSpace(14)
        addWrapped(heading, 12, "bold")
        y += 1

        let stepNo = 0
        for (const block of section.blocks as ManualBlock[]) {
          if (block.type === "note") {
            const t = block.text.trim().startsWith("※") ? block.text.trim() : `※${block.text.trim()}`
            const lines = (() => {
              setFont("bold", 11)
              return doc.splitTextToSize(t, contentW - 4) as string[]
            })()
            const h = lines.length * 6 + 4
            ensureSpace(h)
            doc.setFillColor("#FFFF00")
            doc.rect(margin, y - 4, contentW, h, "F")
            setFont("bold", 11)
            doc.setTextColor("#000000")
            for (const line of lines) {
              doc.text(line, margin + 2, y)
              y += 6
            }
            y += 3
          } else if (block.type === "step") {
            stepNo += 1
            addWrapped(`・${block.text.trim()}`, 11, "normal")
            y += 1
          } else if (block.text.trim()) {
            addWrapped(block.text.trim(), 11, "normal")
            y += 1
          }

          if (includeImages && block.image?.url) {
            try {
              const props = doc.getImageProperties(block.image.url)
              const maxW = contentW
              const maxH = 90
              let iw = maxW
              let ih = (props.height / props.width) * iw
              if (ih > maxH) {
                ih = maxH
                iw = (props.width / props.height) * ih
              }
              ensureSpace(ih + 6)
              doc.addImage(block.image.url, props.fileType || "PNG", margin, y, iw, ih)
              y += ih + 6
            } catch {
              /* skip */
            }
          }
        }
        y += 4
      })
    }
  }

  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    setFont("normal", 9)
    doc.setTextColor("#666666")
    doc.text(String(i), pageW - margin, pageH - 8, { align: "right" })
  }

  const safeName = project.name.replace(/[\\/:*?"<>|]/g, "_")
  downloadPdfBlob(doc.output("blob"), `${safeName}.pdf`)
}
