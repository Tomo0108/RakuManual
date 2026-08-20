import { useMemo, useState } from "react"
import { Eye, History, RotateCcw } from "lucide-react"
import type { Project } from "@/lib/types"
import {
  REVISION_REASON_LABEL,
  restoreSection,
  revisionsForSection,
} from "@/lib/manual-version"
import { blocksToText, diffLines } from "@/lib/text-diff"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export function SectionHistoryButton({
  project,
  sectionId,
  onRestore,
  isMobile,
}: {
  project: Project
  sectionId: string
  onRestore: (next: Project) => void
  isMobile?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [diffRevId, setDiffRevId] = useState<string | null>(null)
  const revisions = revisionsForSection(project, sectionId)
  const current = project.sections.find((s) => s.id === sectionId)
  const diffRev = revisions.find((r) => r.id === diffRevId) ?? null

  const diff = useMemo(() => {
    if (!current || !diffRev) return []
    return diffLines(blocksToText(diffRev.blocks), blocksToText(current.blocks))
  }, [current, diffRev])

  return (
    <>
      <Button
        variant="outline"
        size={isMobile ? "default" : "sm"}
        className={cn("gap-1 border bg-background", isMobile && "h-10 flex-1")}
        onClick={() => setOpen(true)}
        disabled={revisions.length === 0}
      >
        <History className="size-3.5" />
        履歴{revisions.length > 0 ? `(${revisions.length})` : ""}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) setDiffRevId(null)
        }}
      >
        <DialogContent
          className={cn(
            "flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0",
            isMobile ? "w-[calc(100%-1rem)]" : diffRevId ? "sm:max-w-2xl" : "sm:max-w-md",
          )}
        >
          <DialogHeader className="shrink-0 border-b px-4 py-3">
            <DialogTitle className="text-base">
              {diffRevId ? "版差分（過去 → 現行）" : "セクション版履歴"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {diffRevId
                ? "追加は緑、削除は赤で表示します。ワンクリックで過去版に復元できます。"
                : "過去版を選んで差分確認・復元できます。復元前の内容も履歴に残ります。"}
            </DialogDescription>
          </DialogHeader>
          <div className="scroll-touch min-h-0 flex-1 overflow-y-auto p-3">
            {diffRevId && diffRev ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDiffRevId(null)}>
                    一覧へ戻る
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => {
                      const next = restoreSection(project, sectionId, diffRev.id, "山田 太郎")
                      onRestore(next)
                      setOpen(false)
                      setDiffRevId(null)
                    }}
                  >
                    <RotateCcw className="size-3.5" />
                    この版に復元
                  </Button>
                </div>
                <pre className="overflow-x-auto rounded-md border bg-muted/20 p-3 font-mono text-[11px] leading-relaxed">
                  {diff.map((line, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        line.type === "add" && "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
                        line.type === "del" && "bg-red-500/15 text-red-800 line-through dark:text-red-200",
                        line.type === "same" && "text-muted-foreground",
                      )}
                    >
                      <span className="mr-2 inline-block w-3 select-none opacity-60">
                        {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                      </span>
                      {line.text || " "}
                    </div>
                  ))}
                </pre>
              </div>
            ) : revisions.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                まだ版履歴がありません
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {revisions.map((rev) => (
                  <li
                    key={rev.id}
                    className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        v{rev.version} · {REVISION_REASON_LABEL[rev.reason]}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {rev.savedAt} · {rev.savedBy}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {rev.title}（{rev.blocks.length} ブロック）
                      </div>
                    </div>
                    <div className={cn("flex shrink-0 gap-1", isMobile && "w-full flex-col")}>
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn("gap-1", isMobile && "h-10 w-full")}
                        onClick={() => setDiffRevId(rev.id)}
                      >
                        <Eye className="size-3.5" />
                        差分
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn("gap-1", isMobile && "h-10 w-full")}
                        onClick={() => {
                          const next = restoreSection(project, sectionId, rev.id, "山田 太郎")
                          onRestore(next)
                          setOpen(false)
                        }}
                      >
                        <RotateCcw className="size-3.5" />
                        復元
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
