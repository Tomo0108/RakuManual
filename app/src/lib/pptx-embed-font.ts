import JSZip from "jszip"

const FONT_FACE = "Noto Sans JP"
const FONT_PATH_IN_PPTX = "ppt/fonts/NotoSansJP-Regular.ttf"
const FONT_PUBLIC_URL = "/fonts/NotoSansJP-Regular.ttf"

let fontBytesCache: ArrayBuffer | null = null

async function loadFontBytes(): Promise<ArrayBuffer | null> {
  if (fontBytesCache) return fontBytesCache
  try {
    const res = await fetch(FONT_PUBLIC_URL)
    if (!res.ok) return null
    fontBytesCache = await res.arrayBuffer()
    return fontBytesCache
  } catch {
    return null
  }
}

/** theme / slide XML の typeface を Noto Sans JP に揃える */
function rewriteTypefaces(xml: string): string {
  return xml
    .replace(/typeface="[^"]*"/g, `typeface="${FONT_FACE}"`)
    .replace(/typeface='[^']*'/g, `typeface='${FONT_FACE}'`)
}

/**
 * pptxgenjs 出力に Noto Sans JP を埋め込み、東アジア用 typeface を置換する。
 * PowerPoint は埋め込みフォントを認識し、未インストール環境でも日本語が欠けにくくなる。
 */
export async function embedJapaneseFontInPptx(pptxBinary: ArrayBuffer): Promise<Blob> {
  const fontBytes = await loadFontBytes()
  const zip = await JSZip.loadAsync(pptxBinary)

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    if (!name.endsWith(".xml")) continue
    if (
      !name.includes("theme") &&
      !name.includes("slide") &&
      !name.includes("slideMaster") &&
      !name.includes("slideLayout") &&
      name !== "ppt/presentation.xml"
    ) {
      continue
    }
    const text = await entry.async("string")
    if (!text.includes("typeface=")) continue
    zip.file(name, rewriteTypefaces(text))
  }

  if (fontBytes) {
    zip.file(FONT_PATH_IN_PPTX, fontBytes)
    const ctPath = "[Content_Types].xml"
    const ctEntry = zip.file(ctPath)
    if (ctEntry) {
      let ct = await ctEntry.async("string")
      if (!ct.includes(FONT_PATH_IN_PPTX)) {
        ct = ct.replace(
          "</Types>",
          `  <Override PartName="/${FONT_PATH_IN_PPTX}" ContentType="application/x-font-ttf"/>\n</Types>`,
        )
        zip.file(ctPath, ct)
      }
    }
  }

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  })
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export { FONT_FACE }
