/**
 * 図キャプションの品質チェック（公開・出力前）
 * app/src/lib/caption-quality.ts と同ロジック
 */

export interface CaptionIssue {
  sectionId: string
  sectionTitle: string
  blockId: string
  kind: "empty" | "filename_like"
  message: string
}

type BlockLike = {
  id: string
  image?: { url?: string; caption?: string; name?: string } | null
}

type SectionLike = {
  id: string
  title?: string
  blocks?: BlockLike[]
}

export function isFilenameLikeCaption(caption: string, fileName?: string): boolean {
  const c = caption.trim()
  if (!c) return false
  if (/\.(jpe?g|png|gif|webp|bmp|heic|svg)$/i.test(c)) return true
  if (/^(IMG|DSC|DCIM|Screenshot|スクリーンショット)[-_\s.]?\d*/i.test(c)) return true
  if (fileName) {
    const base = fileName.replace(/\.[^.]+$/, "").trim()
    if (base && c === base) return true
  }
  return false
}

export function findCaptionIssues(sections: SectionLike[]): CaptionIssue[] {
  const issues: CaptionIssue[] = []
  for (const section of sections) {
    for (const block of section.blocks ?? []) {
      const image = block.image
      if (!image?.url) continue
      const caption = image.caption?.trim() ?? ""
      if (!caption) {
        issues.push({
          sectionId: section.id,
          sectionTitle: section.title ?? section.id,
          blockId: block.id,
          kind: "empty",
          message: "画像に図の説明（キャプション）がありません",
        })
        continue
      }
      if (isFilenameLikeCaption(caption, image.name)) {
        issues.push({
          sectionId: section.id,
          sectionTitle: section.title ?? section.id,
          blockId: block.id,
          kind: "filename_like",
          message: "図の説明がファイル名のままです。操作内容が分かる文言に書き換えてください",
        })
      }
    }
  }
  return issues
}
