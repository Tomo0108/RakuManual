import { apiFetch } from "./client"

export interface ExportHtmlOptions {
  template?: string
  includeFlow?: boolean
  imageMode?: "expand" | "appendix" | "none"
  sectionIds?: string[]
}

export async function exportProjectHtml(
  projectId: string,
  options: ExportHtmlOptions,
): Promise<{ html: string; filename: string }> {
  return apiFetch(`/projects/${projectId}/export/html`, {
    method: "POST",
    body: JSON.stringify(options),
  })
}

export function downloadHtmlFile(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".html") ? filename : `${filename}.html`
  a.click()
  URL.revokeObjectURL(url)
}
