import type { ManualBlock, ManualSection } from "@/lib/types"
import { buildManualOutline, displaySectionTitle, resolveLeafSectionNumber } from "@/lib/manual-outline"
import { EmptyState } from "@/components/EmptyState"
import { BookOpenText } from "lucide-react"
import { cn } from "@/lib/utils"

interface ManualDocumentProps {
  sections: ManualSection[]
  /** 大項目のフォールバックタイトル（業務名） */
  coverTitle?: string
  /** 冒頭に業務名カバーを出す */
  showCover?: boolean
  className?: string
  emptyTitle?: string
  emptyDescription?: string
}

/** 閲覧・プレビュー用のマニュアル紙面（編集画面の章立てに揃える） */
export function ManualDocument({
  sections,
  coverTitle,
  showCover = true,
  className,
  emptyTitle = "閲覧できるセクションがありません",
  emptyDescription = "マニュアルを生成すると、ここに内容が表示されます。",
}: ManualDocumentProps) {
  const outline = buildManualOutline(sections, { defaultMajorTitle: coverTitle })

  if (sections.length === 0) {
    return (
      <div className={cn("py-8", className)}>
        <EmptyState icon={BookOpenText} title={emptyTitle} description={emptyDescription} />
      </div>
    )
  }

  return (
    <article className={cn("manual-prose", className)}>
      {showCover && coverTitle && (
        <header className="mb-12 border-b border-border/70 pb-8">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            業務マニュアル
          </p>
          <h1 className="mt-2 text-[1.75rem] font-bold leading-tight tracking-tight md:text-[2rem]">
            {coverTitle}
          </h1>
        </header>
      )}

      {outline.map((major) => (
        <section key={major.key} className="mb-14 last:mb-0">
          <header className="mb-10">
            <p className="font-mono text-[13px] font-semibold tracking-wide text-primary">{major.number}</p>
            <h2 className="mt-1.5 text-[1.5rem] font-bold leading-tight tracking-tight md:text-[1.75rem]">
              {major.title ?? coverTitle ?? "—"}
            </h2>
          </header>

          {major.mediums.map((medium) => (
            <div key={medium.key} className="mb-12 last:mb-0">
              <h3 className="text-xl font-semibold leading-snug tracking-tight md:text-[1.35rem]">
                <span className="mr-2.5 font-mono text-[0.95em] font-semibold text-muted-foreground">
                  {medium.number}
                </span>
                {medium.title ?? "—"}
              </h3>
              <div className="mt-3 mb-6 h-px bg-border/70" />

              <div className="flex flex-col gap-10">
                {medium.sections.map((section, si) => (
                  <ManualSectionView
                    key={section.id}
                    section={section}
                    leafNumber={resolveLeafSectionNumber(section, medium.number, si)}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </article>
  )
}

function ManualSectionView({
  section,
  leafNumber,
}: {
  section: ManualSection
  leafNumber: string
}) {
  let stepNo = 0

  return (
    <section id={`viewer-section-${section.id}`} className="scroll-mt-20">
      <h4 className="text-base font-bold tracking-tight md:text-[1.05rem]">
        {leafNumber && <span className="mr-2 font-mono text-primary">{leafNumber}</span>}
        {displaySectionTitle(section)}
      </h4>
      <div className="mt-4 flex flex-col gap-4">
        {section.blocks.map((block) => {
          const thisStep = block.type === "step" ? ++stepNo : undefined
          return <ManualBlockView key={block.id} block={block} stepNo={thisStep} />
        })}
      </div>
    </section>
  )
}

function ManualBlockView({ block, stepNo }: { block: ManualBlock; stepNo?: number }) {
  return (
    <div>
      <div className="flex items-start gap-3">
        {stepNo !== undefined && (
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border/80 bg-background text-[12px] font-semibold tabular-nums text-muted-foreground">
            {stepNo}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {block.type === "note" ? (
            <aside className="rounded-lg border border-[var(--semantic-warning-border)]/40 bg-[color-mix(in_oklch,var(--semantic-warning-bg)_40%,transparent)] px-3 py-2 text-[13.5px] leading-relaxed text-muted-foreground">
              {block.text}
            </aside>
          ) : (
            <p className="text-[15px] leading-[1.8] text-foreground/95">{block.text}</p>
          )}
        </div>
      </div>
      {/* 画像は手順番号の外・ブロック全幅 */}
      <ManualFigure image={block.image} />
    </div>
  )
}

function ManualFigure({
  image,
}: {
  image?: { url?: string; caption?: string; color?: string } | null
}) {
  if (!image?.url) return null
  const caption = image.caption?.trim()

  return (
    <figure className="manual-figure mt-3">
      <img src={image.url} alt={caption || "手順の参考画像"} className="manual-figure-img" />
      {caption && <figcaption className="manual-figcaption">{caption}</figcaption>}
    </figure>
  )
}
