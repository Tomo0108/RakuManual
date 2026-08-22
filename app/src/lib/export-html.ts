import type { FlowState, ManualSection, Project } from "@/lib/types"
import {
  buildManualOutline,
  displaySectionTitle,
  resolveLeafSectionNumber,
  shouldShowLeafNumber,
} from "@/lib/manual-outline"
import { resolveExportTheme } from "@/lib/export-theme"
import { resolveImageDataUrl } from "@/lib/resolve-export-image"
import { downloadHtmlFile } from "@/lib/api/export"

export interface ClientHtmlExportOptions {
  includeImages?: boolean
  includeFlow?: boolean
  template?: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function flowOverviewHtml(flow: FlowState): string {
  const nodes = flow.nodes ?? []
  if (nodes.length === 0) return ""
  const items = nodes
    .map((n) => {
      const lane = escapeHtml(n.data?.lane ?? "")
      const label = escapeHtml(n.data?.label ?? "")
      return `<li><strong>${lane}</strong>: ${label}</li>`
    })
    .join("")
  return `<section class="flow"><h2>業務フロー概要</h2><ol>${items}</ol></section>`
}

/**
 * PDF/PPTX と同様にクライアントで HTML を生成し、画像は data URL 埋め込み。
 * UIプレビュー・オフライン閲覧でも開ける単一ファイルになる。
 */
export async function exportManualHtml(
  project: Project,
  sections: ManualSection[],
  options: ClientHtmlExportOptions = {},
): Promise<{ imageFailures: number }> {
  const includeImages = options.includeImages !== false
  const includeFlow = options.includeFlow !== false
  const theme = resolveExportTheme(options.template)
  const accent = `#${theme.accent}`
  const outline = buildManualOutline(sections)

  let imageFailures = 0
  let body = ""

  for (const group of outline) {
    body += `<h1 class="major">${escapeHtml(group.title || "（大項目）")}</h1>`
    for (const medium of group.mediums) {
      if (medium.title?.trim()) {
        body += `<h2 class="medium">${escapeHtml(medium.title)}</h2>`
      }
      for (let i = 0; i < medium.sections.length; i++) {
        const section = medium.sections[i]!
        const leaf = resolveLeafSectionNumber(
          section,
          medium.number,
          i,
          medium.sections.length,
        )
        const showLeaf = shouldShowLeafNumber(leaf, medium.number, medium.sections.length)
        const title = displaySectionTitle(section)
        const heading = showLeaf ? `${leaf} ${title}` : title
        body += `<h3 class="section">${escapeHtml(heading)}</h3>`

        let stepNo = 0
        for (const block of section.blocks ?? []) {
          const text = escapeHtml(block.text ?? "")
          if (block.type === "step") {
            stepNo += 1
            body += `<p class="step"><span class="step-no">${stepNo}</span> ${text}</p>`
          } else if (block.type === "note") {
            body += `<aside class="note">${text}</aside>`
          } else if (block.text?.trim()) {
            body += `<p>${text}</p>`
          }

          const imageUrl = block.image?.url
          if (includeImages && imageUrl) {
            const dataUrl = await resolveImageDataUrl(imageUrl)
            if (!dataUrl) {
              imageFailures += 1
              body += `<p class="img-missing">（画像を埋め込めませんでした）</p>`
              continue
            }
            const caption = (block.image?.caption ?? "").trim()
            const alt = escapeHtml(caption || "手順の参考画像")
            const captionHtml = caption
              ? `<figcaption>${escapeHtml(caption)}</figcaption>`
              : ""
            body += `<figure><img src="${dataUrl}" alt="${alt}" />${captionHtml}</figure>`
          }
        }
      }
    }
  }

  const flowBlock = includeFlow ? flowOverviewHtml(project.flow) : ""
  const today = new Date().toISOString().slice(0, 10)
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(project.name)}</title>
  <style>
    @page { margin: 20mm; }
    body { font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", Meiryo, sans-serif; color: #1a1a1a; line-height: 1.7; max-width: 960px; margin: 0 auto; padding: 24px; }
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
    .img-missing { color: #b45309; font-size: 0.875rem; }
    .flow ol { padding-left: 1.25rem; }
    .meta { font-size: 0.85rem; color: #666; margin-bottom: 2rem; }
  </style>
</head>
<body>
  <p class="meta">${escapeHtml(project.name)} — 出力日 ${today} / テンプレート: ${escapeHtml(options.template ?? "corporate")}</p>
  ${flowBlock}
  ${body}
</body>
</html>`

  downloadHtmlFile(html, `${project.name}.html`)
  return { imageFailures }
}
