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
    if (includeImages && block.image?.caption) {
      lines.push(`  [画像] ${block.image.caption}`)
    }
  }
  return lines
}

/** マニュアルを PowerPoint 出力（1セクション = 1スライド） */
export async function exportManualPptx(
  project: Project,
  sections: ManualSection[],
  options?: { includeImages?: boolean },
): Promise<void> {
  const includeImages = options?.includeImages ?? true
  const pptx = new PptxGenJS()
  pptx.author = "RakuManual"
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
    color: "1F2937",
  })
  titleSlide.addText(`全 ${sections.length} セクション`, {
    x: 0.6,
    y: 2.9,
    w: 8.8,
    h: 0.5,
    fontSize: 14,
    color: "6B7280",
  })

  for (const section of sections) {
    const slide = pptx.addSlide()
    const num = resolveSectionNumber(section)
    const title = displaySectionTitle(section)
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
        color: "B91C1C",
        fontFace: "Arial",
      })
    }

    slide.addText(title, {
      x: num ? 1.5 : 0.45,
      y: 0.08,
      w: 8.2,
      h: 0.45,
      fontSize: 18,
      bold: true,
      color: "111827",
      fontFace: "Arial",
    })

    slide.addText(lines.join("\n"), {
      x: 0.55,
      y: 0.85,
      w: 8.9,
      h: 4.2,
      fontSize: 13,
      color: "374151",
      valign: "top",
      fontFace: "Arial",
      lineSpacingMultiple: 1.15,
    })

    if (includeImages) {
      const imageBlock = section.blocks.find((b) => b.image?.url)
      if (imageBlock?.image?.url) {
        slide.addImage({
          data: imageBlock.image.url,
          x: 5.8,
          y: 2.8,
          w: 3.5,
          h: 2.2,
          sizing: { type: "contain", w: 3.5, h: 2.2 },
        })
      }
    }
  }

  const safeName = project.name.replace(/[\\/:*?"<>|]/g, "_")
  await pptx.writeFile({ fileName: `${safeName}.pptx` })
}
