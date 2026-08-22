import type { Project } from "../types.js"

export interface ExportOptions {
  template?: string
  includeFlow?: boolean
  imageMode?: "expand" | "appendix" | "none"
  sectionIds?: string[]
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function templateAccent(template: string): string {
  if (template === "simple") return "#333"
  if (template === "training") return "#0d9488"
  return "#2563eb"
}

export function buildManualHtml(project: Project, options: ExportOptions = {}): string {
  const template = options.template ?? "corporate"
  const accent = templateAccent(template)
  const includeFlow = options.includeFlow !== false
  const imageMode = options.imageMode ?? "expand"

  const allSections = (project.sections ?? []) as Array<{
    id: string
    title?: string
    sectionNumber?: string
    majorTitle?: string
    mediumTitle?: string
    blocks?: Array<{ type?: string; text?: string; image?: { url?: string; caption?: string } }>
  }>

  const sections =
    options.sectionIds && options.sectionIds.length > 0
      ? allSections.filter((s) => options.sectionIds!.includes(s.id))
      : allSections

  const appendixImages: string[] = []

  let body = ""
  let lastMajor = ""
  let lastMedium = ""

  for (const section of sections) {
    const major = section.majorTitle?.trim() ?? ""
    const medium = section.mediumTitle?.trim() ?? ""
    const num = section.sectionNumber ? `${section.sectionNumber} ` : ""

    // 連続する同一の大/中項目見出しは重複出力しない
    if (major && major !== lastMajor) {
      body += `<h1 class="major">${escapeHtml(major)}</h1>`
      lastMajor = major
      lastMedium = ""
    }
    if (medium && medium !== lastMedium) {
      body += `<h2 class="medium">${escapeHtml(medium)}</h2>`
      lastMedium = medium
    }
    body += `<h3 class="section">${escapeHtml(num + (section.title ?? ""))}</h3>`

    let stepNo = 0
    for (const block of section.blocks ?? []) {
      const text = escapeHtml(block.text ?? "")
      if (block.type === "step") {
        stepNo += 1
        body += `<p class="step"><span class="step-no">${stepNo}</span> ${text}</p>`
      } else if (block.type === "note") {
        body += `<aside class="note">${text}</aside>`
      } else {
        body += `<p>${text}</p>`
      }
      if (block.image?.url && imageMode !== "none") {
        const caption = block.image.caption?.trim() ?? ""
        const alt = escapeHtml(caption || "手順の参考画像")
        const captionHtml = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""
        const img = `<figure><img src="${escapeHtml(block.image.url)}" alt="${alt}" />${captionHtml}</figure>`
        if (imageMode === "appendix") appendixImages.push(img)
        else body += img
      }
    }
  }

  if (appendixImages.length > 0) {
    body += `<h2 class="medium">巻末: 添付画像</h2>${appendixImages.join("")}`
  }

  let flowBlock = ""
  if (includeFlow && (project.flow as { nodes?: unknown[] })?.nodes?.length) {
    const nodes = (project.flow as { nodes: Array<{ data?: { label?: string; lane?: string } }> }).nodes
    flowBlock = `<section class="flow"><h2>業務フロー概要</h2><ol>${nodes
      .map((n) => `<li><strong>${escapeHtml(n.data?.lane ?? "")}</strong>: ${escapeHtml(n.data?.label ?? "")}</li>`)
      .join("")}</ol></section>`
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(project.name)}</title>
  <style>
    @page { margin: 20mm; }
    body { font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; color: #1a1a1a; line-height: 1.7; max-width: 960px; margin: 0 auto; padding: 24px; }
    h1.major { color: ${accent}; font-size: 1.5rem; border-bottom: 2px solid ${accent}; padding-bottom: 0.25rem; }
    h2.medium { font-size: 1.15rem; margin-top: 1.5rem; color: #444; }
    h3.section { font-size: 1rem; margin-top: 1.25rem; }
    p.step { padding-left: 0.25rem; }
    p.step .step-no { display: inline-flex; align-items: center; justify-content: center; min-width: 1.4em; margin-right: 0.35rem; font-weight: 700; color: ${accent}; }
    aside.note { background: #f5f5f5; padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.9rem; }
    figure { margin: 1.25rem 0; text-align: center; }
    figure img {
      display: block;
      width: auto;
      max-width: 100%;
      max-height: 70vh;
      height: auto;
      margin: 0 auto;
      object-fit: contain;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    figcaption { margin-top: 0.5rem; font-size: 0.875rem; color: #444; text-align: left; }
    .flow ol { padding-left: 1.25rem; }
    .meta { font-size: 0.85rem; color: #666; margin-bottom: 2rem; }
  </style>
</head>
<body>
  <p class="meta">${escapeHtml(project.name)} — 出力日 ${new Date().toISOString().slice(0, 10)} / テンプレート: ${escapeHtml(template)}</p>
  ${flowBlock}
  ${body}
</body>
</html>`
}
