import PDFDocument from "pdfkit"
import fs from "node:fs"
import path from "node:path"
import { finished } from "node:stream/promises"
import { UPLOADS_DIR } from "../db.js"
import type { Project } from "../types.js"
import type { ExportOptions } from "./manual-html.js"

function resolveJapaneseFont(): string | null {
  const candidates = [
    // リポジトリ同梱（環境差で化けるのを防ぐ）
    path.resolve(import.meta.dirname, "../../../app/public/fonts/NotoSansJP-Regular.ttf"),
    path.resolve(process.cwd(), "app/public/fonts/NotoSansJP-Regular.ttf"),
    path.resolve(process.cwd(), "../app/public/fonts/NotoSansJP-Regular.ttf"),
    path.resolve(process.cwd(), "public/fonts/NotoSansJP-Regular.ttf"),
    // システム（メイリオが入っている環境）
    "/Library/Fonts/Microsoft/Meiryo.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  ]
  for (const p of candidates) {
    if (p.endsWith(".ttf") && fs.existsSync(p)) return p
  }
  return null
}

interface BlockImage {
  url?: string
  storageKey?: string
  caption?: string
}

type SectionRow = {
  id: string
  title?: string
  sectionNumber?: string
  majorTitle?: string
  mediumTitle?: string
  blocks?: Array<{ type?: string; text?: string; image?: BlockImage }>
}

const UPLOADS_ROOT = path.resolve(UPLOADS_DIR)
const UPLOADS_PREFIX = "/api/uploads/"

/** data URL とサーバー保存済みアップロードの両方を読み込む */
function loadImageBuffer(image: BlockImage): Buffer | null {
  const url = image.url ?? ""
  if (url.startsWith("data:")) {
    const marker = url.indexOf("base64,")
    if (marker < 0) return null
    try {
      return Buffer.from(url.slice(marker + "base64,".length), "base64")
    } catch {
      return null
    }
  }

  const key =
    image.storageKey ?? (url.startsWith(UPLOADS_PREFIX) ? url.slice(UPLOADS_PREFIX.length) : null)
  if (!key) return null
  const resolved = path.resolve(UPLOADS_ROOT, decodeURIComponent(key))
  if (resolved !== UPLOADS_ROOT && !resolved.startsWith(`${UPLOADS_ROOT}${path.sep}`)) return null
  if (!fs.existsSync(resolved)) return null
  try {
    return fs.readFileSync(resolved)
  } catch {
    return null
  }
}

export async function buildManualPdf(project: Project, options: ExportOptions = {}): Promise<Buffer> {
  const allSections = (project.sections ?? []) as SectionRow[]
  const sections =
    options.sectionIds && options.sectionIds.length > 0
      ? allSections.filter((s) => options.sectionIds!.includes(s.id))
      : allSections
  const imageMode = options.imageMode ?? "expand"

  const doc = new PDFDocument({ margin: 50, size: "A4", autoFirstPage: true })
  const chunks: Buffer[] = []
  doc.on("data", (chunk: Buffer) => chunks.push(chunk))

  const fontPath = resolveJapaneseFont()
  try {
    if (fontPath) doc.font(fontPath)
    else doc.font("Helvetica")
  } catch {
    doc.font("Helvetica")
  }

  const drawImage = (image: BlockImage) => {
    const buffer = loadImageBuffer(image)
    if (!buffer) return false
    try {
      const pageInner = doc.page.width - doc.page.margins.left - doc.page.margins.right
      doc.image(buffer, {
        fit: [Math.min(460, pageInner), 320],
        align: "center",
      })
      // 手順出力ではキャプションは出さない（説明は本文側）
      doc.moveDown(0.45)
      return true
    } catch {
      return false
    }
  }

  const appendix: BlockImage[] = []

  const template = options.template ?? "corporate"
  doc.fontSize(20).text(project.name)
  doc.moveDown(0.5)
  doc.fontSize(10).fillColor("#555555").text(
    `出力日 ${new Date().toISOString().slice(0, 10)} / テンプレート: ${template}`,
  )
  doc.fillColor("#000000")
  doc.moveDown()

  if (options.includeFlow !== false && (project.flow as { nodes?: unknown[] })?.nodes?.length) {
    doc.fontSize(14).text("業務フロー概要", { underline: true })
    doc.moveDown(0.3)
    const nodes = (project.flow as { nodes: Array<{ data?: { label?: string; lane?: string } }> }).nodes
    doc.fontSize(11)
    nodes.forEach((n, i) => {
      doc.text(`${i + 1}. [${n.data?.lane ?? ""}] ${n.data?.label ?? ""}`)
    })
    doc.moveDown()
  }

  let lastMajor = ""
  let lastMedium = ""

  for (const section of sections) {
    const major = section.majorTitle?.trim() ?? ""
    const medium = section.mediumTitle?.trim() ?? ""

    if (major && major !== lastMajor) {
      doc.fontSize(16).fillColor("#2563eb").text(major)
      doc.fillColor("#000000")
      doc.moveDown(0.3)
      lastMajor = major
      lastMedium = ""
    }
    if (medium && medium !== lastMedium) {
      doc.fontSize(13).text(medium)
      doc.moveDown(0.2)
      lastMedium = medium
    }
    const num = section.sectionNumber ? `${section.sectionNumber} ` : ""
    doc.fontSize(12).text(`${num}${section.title ?? ""}`, { underline: true })
    doc.moveDown(0.3)
    doc.fontSize(11)
    let stepNo = 0
    for (const block of section.blocks ?? []) {
      if (block.type === "step") {
        stepNo += 1
        doc.text(`${stepNo}. ${block.text ?? ""}`, { indent: 12 })
      } else if (block.type === "note") {
        doc.text(`※ ${block.text ?? ""}`)
      } else {
        doc.text(block.text ?? "")
      }
      doc.moveDown(0.2)
      if (block.image && imageMode !== "none") {
        if (imageMode === "appendix") appendix.push(block.image)
        else drawImage(block.image)
      }
    }
    doc.moveDown(0.5)
  }

  if (appendix.length > 0) {
    doc.addPage()
    doc.fontSize(14).text("巻末: 添付画像", { underline: true })
    doc.moveDown(0.5)
    doc.fontSize(11)
    for (const image of appendix) {
      if (!drawImage(image) && image.caption) {
        doc.fontSize(9).fillColor("#555555").text(`（画像を読み込めませんでした）${image.caption}`)
        doc.fillColor("#000000").fontSize(11)
        doc.moveDown(0.3)
      }
    }
  }

  doc.end()
  await finished(doc)
  return Buffer.concat(chunks)
}
