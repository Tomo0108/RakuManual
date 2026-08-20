import PDFDocument from "pdfkit"
import fs from "node:fs"
import { finished } from "node:stream/promises"
import type { Project } from "../types.js"
import type { ExportOptions } from "./manual-html.js"

function resolveJapaneseFont(): string | null {
  const candidates = [
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  ]
  for (const p of candidates) {
    if (p.endsWith(".ttf") && fs.existsSync(p)) return p
  }
  return null
}

type SectionRow = {
  id: string
  title?: string
  sectionNumber?: string
  majorTitle?: string
  mediumTitle?: string
  blocks?: Array<{ type?: string; text?: string }>
}

export async function buildManualPdf(project: Project, options: ExportOptions = {}): Promise<Buffer> {
  const allSections = (project.sections ?? []) as SectionRow[]
  const sections =
    options.sectionIds && options.sectionIds.length > 0
      ? allSections.filter((s) => options.sectionIds!.includes(s.id))
      : allSections

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

  for (const section of sections) {
    if (section.majorTitle) {
      doc.fontSize(16).fillColor("#2563eb").text(section.majorTitle)
      doc.fillColor("#000000")
      doc.moveDown(0.3)
    }
    if (section.mediumTitle) {
      doc.fontSize(13).text(section.mediumTitle)
      doc.moveDown(0.2)
    }
    const num = section.sectionNumber ? `${section.sectionNumber} ` : ""
    doc.fontSize(12).text(`${num}${section.title ?? ""}`, { underline: true })
    doc.moveDown(0.3)
    doc.fontSize(11)
    for (const block of section.blocks ?? []) {
      const prefix = block.type === "step" ? "▸ " : block.type === "note" ? "※ " : ""
      doc.text(`${prefix}${block.text ?? ""}`, { indent: block.type === "step" ? 12 : 0 })
      doc.moveDown(0.2)
    }
    doc.moveDown(0.5)
  }

  doc.end()
  await finished(doc)
  return Buffer.concat(chunks)
}
