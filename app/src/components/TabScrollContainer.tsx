import { useCallback, useEffect, useRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface TabScrollContainerProps {
  children: ReactNode
  className?: string
}

/**
 * 横スクロール＋端フェード。
 * 擬似要素の色重ねだとアクティブタブの塗りが濁るため、mask で端を透過させる。
 */
export function TabScrollContainer({ children, className }: TabScrollContainerProps) {
  const ref = useRef<HTMLDivElement>(null)

  const updateFade = useCallback(() => {
    const el = ref.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    const canScroll = scrollWidth > clientWidth + 2
    const fadeLeft = canScroll && scrollLeft > 4 ? "1.25rem" : "0px"
    const fadeRight = canScroll && scrollLeft + clientWidth < scrollWidth - 4 ? "1.25rem" : "0px"
    el.style.setProperty("--scroll-fade-left", fadeLeft)
    el.style.setProperty("--scroll-fade-right", fadeRight)
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
