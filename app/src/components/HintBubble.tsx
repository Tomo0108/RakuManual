import { useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  message: string
  onDismiss: () => void
  placement?: "bottom" | "top"
  align?: "center" | "start" | "end"
}

/** 操作案内の吹き出し（ボタン付近に表示） */
export function HintBubble({
  anchorRef,
  open,
  message,
  onDismiss,
  placement = "bottom",
  align = "center",
}: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null)
      return
    }

    const update = () => {
      const el = anchorRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const gap = 10
      const top = placement === "bottom" ? rect.bottom + gap : rect.top - gap
      const left =
        align === "center"
          ? rect.left + rect.width / 2
          : align === "end"
            ? rect.right
            : rect.left
      setPos({ top, left })
    }

    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [open, anchorRef, placement, align])

  if (!open || !pos) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100]" onClick={onDismiss} aria-hidden />
      <div
        className={cn(
          "fixed z-[101] w-max max-w-[min(90vw,320px)] rounded-lg border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-lg",
          align === "center" && "-translate-x-1/2",
          align === "end" && "-translate-x-full",
          placement === "top" && "-translate-y-full",
        )}
        style={{ top: pos.top, left: pos.left }}
        role="status"
      >
        <div
          className={cn(
            "absolute size-2.5 rotate-45 border bg-popover",
            placement === "bottom" && "-top-[5px] border-b-0 border-r-0",
            align === "center" && "left-1/2 -translate-x-1/2",
            align === "end" && "right-3",
            align === "start" && "left-3",
            placement === "top" && "-bottom-[5px] border-l-0 border-t-0",
          )}
          aria-hidden
        />
        <div className="flex items-center gap-1.5">
          <p className="whitespace-nowrap">{message}</p>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="閉じる"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
