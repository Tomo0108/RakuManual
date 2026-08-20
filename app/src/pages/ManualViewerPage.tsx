import { ArrowLeft, BookOpenText } from "lucide-react"
import type { ManualSection, Project } from "@/lib/types"
import { compareSectionNumbers, displaySectionTitle, resolveSectionNumber } from "@/lib/manual-outline"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useEffect } from "react"

interface Props {
  project: Project
  sectionId?: string
  onBack: () => void
}

function viewerSections(project: Project): ManualSection[] {
  if (project.status === "published" && project.publishedSections?.length) {
    return project.publishedSections
  }
  return project.sections.filter((s) => s.status === "approved")
}

export function ManualViewerPage({ project, sectionId, onBack }: Props) {
  const sections = [...viewerSections(project)].sort((a, b) =>
    compareSectionNumbers(resolveSectionNumber(a), resolveSectionNumber(b)),
  )

  useEffect(() => {
    if (!sectionId) return
    document.getElementById(`viewer-section-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [sectionId])

  return (
    <div className="flex h-full flex-col">
      <header className="page-header flex shrink-0 items-center gap-3 px-4 py-3 md:px-6">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="戻る">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 truncate text-lg font-bold tracking-tight">
            <BookOpenText className="size-5 shrink-0 text-primary" />
            {project.name}
          </h1>
          <p className="text-xs text-muted-foreground">閲覧専用（編集不可）</p>
        </div>
        {project.status === "published" && (
          <Badge variant="secondary" className="shrink-0">
            公開版
          </Badge>
        )}
      </header>

      <div className="scroll-touch min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <article className="mx-auto max-w-3xl">
          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">閲覧可能なセクションがありません。</p>
          ) : (
            sections.map((section) => {
              const num = resolveSectionNumber(section)
              return (
                <section
                  key={section.id}
                  id={`viewer-section-${section.id}`}
                  className="mb-10 scroll-mt-16 border-b border-border/60 pb-8 last:border-b-0"
                >
                  <h2 className="text-base font-bold tracking-tight">
                    {num && <span className="mr-2 font-mono text-primary">{num}</span>}
                    {displaySectionTitle(section)}
                  </h2>
                  <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-foreground/90">
                    {section.blocks.map((block) => (
                      <div key={block.id}>
                        {block.type === "step" ? (
                          <p className="border-l-2 border-primary/40 pl-3">{block.text}</p>
                        ) : block.type === "note" ? (
                          <aside className="rounded-lg bg-muted/50 px-3 py-2 text-muted-foreground">{block.text}</aside>
                        ) : (
                          <p>{block.text}</p>
                        )}
                        {block.image?.url && (
                          <figure className="mt-2">
                            <img
                              src={block.image.url}
                              alt={block.image.caption}
                              className="max-h-64 rounded-md border object-contain"
                            />
                            {block.image.caption && (
                              <figcaption className="mt-1 text-xs text-muted-foreground">{block.image.caption}</figcaption>
                            )}
                          </figure>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )
            })
          )}
        </article>
      </div>
    </div>
  )
}
