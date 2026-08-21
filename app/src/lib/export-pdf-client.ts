/**
 * PDF 出力は PowerPoint と同じワイドスライドデザインを使う。
 * （固有の A4 縦レイアウトは廃止）
 */
export { exportManualPdfSlides as exportManualPdfClient, buildManualPdfBlob } from "@/lib/export-pptx"
