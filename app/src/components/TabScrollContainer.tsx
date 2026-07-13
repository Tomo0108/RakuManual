import { useCallback, useEffect, useRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface TabScrollContainerProps {
  children: ReactNode
  className?: string
}

/** 横スクロールタブに左右フェードヒントを付与 */
export function TabScrollContainer({ children, className }: TabScrollContainerProps) {
  const ref = useRef<HTMLDivElement>(null)

  const updateFade = useCallback(() => {
    const el = ref.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    el.style.setProperty("--scroll-fade-left", scrollLeft > 4 ? "1" : "0")
    el.style.setProperty("--scroll-fade-right", scrollLeft + clientWidth < scrollWidth - 4 ? "1" : "0")
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    updateFade()
    el.addEventListener("scroll", updateFade, { passive: true })
    const ro = new ResizeObserver(updateFade)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", updateFade)
      ro.disconnect()
    }
  }, [updateFade])

  return (
    <div ref={ref} className={cn("tab-scroll-fade scrollbar-none scroll-touch overflow-x-auto", className)}>
      {children}
    </div>
  )
}
