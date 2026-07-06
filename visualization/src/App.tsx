import { useEffect, useState } from "react"
import { FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { DocumentContent } from "@/components/DocumentContent"
import { SidebarNav } from "@/components/layout/SidebarNav"
import { NAV_ITEMS } from "@/data/navigation"

export default function App() {
  const [activeId, setActiveId] = useState("meta")

  useEffect(() => {
    const ids = NAV_ITEMS.flatMap((item) => [
      item.id,
      ...(item.children?.map((c) => c.id) ?? []),
    ])

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id)
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0, 0.25, 0.5] },
    )

    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg border bg-muted">
              <FileText className="size-4 text-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">
                ラクマニュアル
              </h1>
              <p className="text-xs text-muted-foreground">要件定義書 v0.1.0</p>
            </div>
          </div>
          <Badge variant="outline" className="hidden sm:inline-flex">
            ドラフト(承認待ち)
          </Badge>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-10">
          <p className="text-sm font-medium text-muted-foreground">
            業務マニュアル自動作成AIツール
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            要件定義書
          </h2>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted-foreground">
            社内向けAIマニュアル作成プロダクトの要件を定義するドキュメントです。
            UXを最優先に設計し、実利用レベルの出力品質と更新可能な運用を目指します。
          </p>
        </div>

        <Separator className="mb-8" />

        <div className="flex gap-8">
          <SidebarNav items={NAV_ITEMS} activeId={activeId} />
          <main className="min-w-0 flex-1 pb-16">
            <DocumentContent />
          </main>
        </div>
      </div>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        ラクマニュアル 要件定義書 · 2026-07-05 · PIC: (氏名を記載)
      </footer>
    </div>
  )
}
