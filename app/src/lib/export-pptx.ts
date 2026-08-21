import type { ManualBlock, ManualSection, Project } from "@/lib/types"
import { displaySectionTitle, resolveSectionNumber } from "@/lib/manual-outline"
import PptxGenJS from "pptxgenjs"

function blockLines(blocks: ManualBlock[], includeImages: boolean): string[] {
  const lines: string[] = []
  let step = 0
  for (const block of blocks) {
    if (block.type === "step") {
      step += 1
      lines.push(`${step}. ${block.text}`)
    } else if (block.type === "note") {
      lines.push(`※ ${block.text}`)
    } else {
      lines.push(block.text)
    }
    if (includeImages && block.image?.caption && !block.image.url) {
      lines.push(`  [画像] ${block.image.caption}`)
    }
  }
  return lines
}

/** マニュアルを PowerPoint 出力（1セクション = 1スライド） */
export async function exportManualPptx(
  project: Project,
  sections: ManualSection[],
  options?: { includeImages?: boolean; template?: string },
): Promise<void> {
  const includeImages = options?.includeImages ?? true
  const accent =
    options?.template === "training"
      ? "0D9488"
      : options?.template === "simple"
        ? "374151"
        : "1D4ED8"
  const pptx = new PptxGenJS()
  pptx.author = "ラクマニュアル"
  pptx.title = project.name
  pptx.layout = "LAYOUT_16x9"

  const titleSlide = pptx.addSlide()
  titleSlide.addText(project.name, {
    x: 0.6,
    y: 1.6,
    w: 8.8,
    h: 1.2,
    fontSize: 28,
    bold: true,
    color: accent,
    fontFace: "Meiryo",
  })
  titleSlide.addText(
    `全 ${sections.length} セクション / テンプレート: ${options?.template ?? "corporate"}`,
    {
      x: 0.6,
      y: 2.9,
      w: 8.8,
      h: 0.5,
      fontSize: 14,
      color: "6B7280",
      fontFace: "Meiryo",
    },
  )

  for (const section of sections) {
    const slide = pptx.addSlide()
    const num = resolveSectionNumber(section)
    const title = displaySectionTitle(section)
    const imageBlocks = includeImages
      ? section.blocks.filter((b) => b.image?.url)
      : []
    const hasImage = imageBlocks.length > 0
    const lines = blockLines(section.blocks, includeImages)

    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: "100%",
      h: 0.55,
      fill: { color: "F3F4F6" },
      line: { color: "E5E7EB", width: 0.5 },
    })

    if (num) {
      slide.addText(num, {
        x: 0.45,
        y: 0.12,
        w: 1.2,
        h: 0.35,
        fontSize: 11,
        bold: true,
        color: accent,
        fontFace: "Meiryo",
      })
    }

    slide.addText(title, {
      x: num ? 1.5 : 0.45,
      y: 0.08,
      w: hasImage ? 5.2 : 8.2,
      h: 0.45,
      fontSize: 18,
      bold: true,
      color: "111827",
      fontFace: "Meiryo",
    })

    // 画像あり: 左に本文、右に図（重なり回避）。複数画像は縦に積む
    slide.addText(lines.join("\n"), {
      x: 0.55,
      y: 0.85,
      w: hasImage ? 5.0 : 8.9,
      h: 4.2,
      fontSize: 13,
      color: "374151",
      valign: "top",
      fontFace: "Meiryo",
      lineSpacingMultiple: 1.15,
    })

    if (hasImage) {
      const slotH = Math.min(2.0, 4.0 / imageBlocks.length)
      imageBlocks.slice(0, 2).forEach((block, i) => {
        const img = block.image!
        const y = 0.85 + i * (slotH + 0.25)
        slide.addImage({
          data: img.url!,
          x: 5.7,
          y,
          w: 3.6,
          h: slotH,
          sizing: { type: "contain", w: 3.6, h: slotH },
        })
        if (img.caption?.trim()) {
          slide.addText(img.caption.trim(), {
            x: 5.7,
            y: y + slotH + 0.02,
            w: 3.6,
            h: 0.28,
            fontSize: 10,
            color: "6B7280",
            fontFace: "Meiryo",
            align: "center",
          })
        }
      })
    }
  }

  const safeName = project.name.replace(/[\\/:*?"<>|]/g, "_")
  await pptx.writeFile({ fileName: `${safeName}.pptx` })
}
