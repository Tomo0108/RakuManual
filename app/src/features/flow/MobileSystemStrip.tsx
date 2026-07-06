import { ExternalLink } from "lucide-react"
import type { ColumnSystemEntry } from "@/lib/types"

interface Props {
  columnSystems: ColumnSystemEntry[]
}

/** スマホ向け: 利用システムを横スクロールの1行で表示 */
export function MobileSystemStrip({ columnSystems }: Props) {
  if (columnSystems.length === 0) return null

  return (
    <div className="shrink-0 border-t bg-card">
      <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground">利用システム</div>
      <div className="scrollbar-none scroll-touch flex gap-1.5 overflow-x-auto px-2 pb-2">
        {columnSystems.map((entry, i) => {
          const href = entry.url?.trim()
          const label = entry.label || "—"
          return (
            <div
              key={i}
              className="shrink-0 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1.5 text-[10px] leading-snug"
            >
              <span className="mr-1 text-[9px] text-muted-foreground">列{i + 1}</span>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 font-medium text-primary"
                >
                  <ExternalLink className="size-2.5" />
                  {label}
                </a>
              ) : (
                <span className="font-medium">{label}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
