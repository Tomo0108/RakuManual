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

export async function exportProjectPdf(
  projectId: string,
  options: ExportHtmlOptions,
): Promise<{ pdfBase64: string; filename: string; mimeType: string }> {
  return apiFetch(`/projects/${projectId}/export/pdf`, {
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

export function downloadPdfBase64(pdfBase64: string, filename: string) {
  const binary = atob(pdfBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
