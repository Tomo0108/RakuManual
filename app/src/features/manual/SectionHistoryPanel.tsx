import { useState } from "react"
import { History, RotateCcw } from "lucide-react"
import type { Project } from "@/lib/types"
import {
  REVISION_REASON_LABEL,
  restoreSection,
  revisionsForSection,
} from "@/lib/manual-version"
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
  const revisions = revisionsForSection(project, sectionId)

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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            "flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0",
            isMobile ? "w-[calc(100%-1rem)]" : "sm:max-w-md",
          )}
        >
          <DialogHeader className="shrink-0 border-b px-4 py-3">
            <DialogTitle className="text-base">セクション版履歴</DialogTitle>
            <DialogDescription className="text-xs">
              過去版を選んで復元できます。復元前の内容も履歴に残ります。
            </DialogDescription>
          </DialogHeader>
          <div className="scroll-touch min-h-0 flex-1 overflow-y-auto p-3">
            {revisions.length === 0 ? (
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
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn("gap-1 shrink-0", isMobile && "h-10 w-full")}
                      onClick={() => {
                        const next = restoreSection(project, sectionId, rev.id, "山田 太郎")
                        onRestore(next)
                        setOpen(false)
                      }}
                    >
                      <RotateCcw className="size-3.5" />
                      復元
                    </Button>
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
