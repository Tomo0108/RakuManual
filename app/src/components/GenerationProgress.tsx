import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface Props {
  /** 0-100 の進捗率 */
  value: number
  /** 何を生成しているか（例: フロー図を生成しています） */
  label: string
  /** 補足説明（任意） */
  description?: string
  className?: string
}

const clampPercent = (v: number) => Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0))

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

/**
 * SSE から届く進捗は飛び飛びなので、表示値を毎フレーム目標値へ近づけて滑らかに見せる。
 */
function useSmoothPercent(target: number) {
  const targetRef = useRef(clampPercent(target))
  const shownRef = useRef(clampPercent(target))
  const [shown, setShown] = useState(shownRef.current)

  targetRef.current = clampPercent(target)

  useEffect(() => {
    if (prefersReducedMotion()) {
      shownRef.current = targetRef.current
      setShown(targetRef.current)
      return
    }

    let frame = 0
    let prev = performance.now()

    const tick = (time: number) => {
      const dt = Math.min(time - prev, 120)
      prev = time
      const current = shownRef.current
      const goal = targetRef.current
      const diff = goal - current
      if (Math.abs(diff) < 0.05) {
        if (current !== goal) {
          shownRef.current = goal
          setShown(goal)
        }
      } else {
        // 指数移動: 大きな飛びは速く、仕上げはゆっくり詰める
        const next = current + diff * (1 - Math.exp(-dt / 220))
        shownRef.current = next
        setShown(next)
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return shown
}

/** AI生成の進捗パネル（数値カウントアップ + 進捗バー） */
export function GenerationProgress({ value, label, description, className }: Props) {
  const shown = useSmoothPercent(value)
  const percent = Math.round(shown)
  // 開始直後でも「動いている」ことが伝わるよう、塗りに下限を持たせる
  const fillWidth = Math.max(shown, 4)

  return (
    <div
      className={cn(
        "w-full rounded-xl border border-border bg-card px-4 py-3.5 text-left shadow-sm",
        className,
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%`}
      aria-label={label}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="progress-beacon relative flex size-2 shrink-0 rounded-full bg-primary" aria-hidden />
          <span className="truncate text-[13px] font-medium text-foreground">{label}</span>
        </div>
        <span className="shrink-0 text-primary tabular-nums">
          <span className="text-xl font-bold leading-none">{percent}</span>
          <span className="ml-0.5 text-xs font-semibold">%</span>
        </span>
      </div>

      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-primary-muted">
        <div
          className="relative h-full rounded-full bg-primary"
          style={{ width: `${fillWidth}%`, willChange: "width" }}
        >
          <div
            className="progress-sheen absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-primary-foreground/50 to-transparent"
            aria-hidden
          />
        </div>
      </div>

      {description && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
    </div>
  )
}
