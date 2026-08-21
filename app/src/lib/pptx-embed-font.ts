import JSZip from "jszip"

/**
 * マニュアル出力フォントは「メイリオ」固定。
 * 参考資料（ROS発注マニュアル）と同じくシステムフォント参照とし、
 * 不完全な TTF 埋め込みは行わない（開くたびに化ける／直る症状の主因だったため）。
 */
export const FONT_FACE = "メイリオ"

/** theme / slide XML の typeface をメイリオに揃える（埋め込みファイルは追加しない） */
function rewriteTypefaces(xml: string): string {
  return xml
    .replace(/typeface="[^"]*"/g, `typeface="${FONT_FACE}"`)
    .replace(/typeface='[^']*'/g, `typeface='${FONT_FACE}'`)
}

/**
 * pptxgenjs 出力のフォント指定をメイリオに統一する。
 * フォントバイナリの同梱はしない（PowerPoint が正しく解釈できない不完全埋め込みを避ける）。
 */
export async function applyMeiryoFontToPptx(pptxBinary: ArrayBuffer): Promise<Blob> {
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

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  })
}

/** @deprecated 互換エイリアス — applyMeiryoFontToPptx を使用 */
export const embedJapaneseFontInPptx = applyMeiryoFontToPptx

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
