import { ArrowLeft, BookOpenText, Search } from "lucide-react"
import type { ManualSection, Project } from "@/lib/types"
import { compareSectionNumbers, displaySectionTitle, resolveSectionNumber } from "@/lib/manual-outline"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ManualDocument } from "@/features/manual/ManualDocument"
import { useEffect, useMemo, useState } from "react"

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

function sectionSearchHaystack(s: ManualSection): string {
  const captions = s.blocks.map((b) => b.image?.caption ?? "").join(" ")
  return `${displaySectionTitle(s)} ${s.blocks.map((b) => b.text).join(" ")} ${captions}`.toLowerCase()
}

export function ManualViewerPage({ project, sectionId, onBack }: Props) {
  const [query, setQuery] = useState("")
  const sections = useMemo(
    () =>
      [...viewerSections(project)].sort((a, b) =>
        compareSectionNumbers(resolveSectionNumber(a), resolveSectionNumber(b)),
      ),
    [project],
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sections
    return sections.filter((s) => sectionSearchHaystack(s).includes(q))
  }, [sections, query])

  useEffect(() => {
    if (!sectionId) return
    document.getElementById(`viewer-section-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [sectionId, filtered])

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

      <div className="canvas-surface scroll-touch min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto mb-5 max-w-3xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="マニュアル内を検索（本文・図の説明）…"
              className="pl-9"
            />
          </div>
        </div>

        <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border/40 bg-card px-5 py-8 shadow-sm md:px-12 md:py-12">
          {query.trim() && filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">検索に一致するセクションがありません。</p>
          ) : (
            <ManualDocument
              sections={filtered}
              coverTitle={project.name}
              showCover={!query.trim()}
              emptyTitle="閲覧可能なセクションがありません"
              emptyDescription="承認済みのセクション、または公開版データがありません。"
            />
          )}
        </div>
      </div>
    </div>
  )
}
