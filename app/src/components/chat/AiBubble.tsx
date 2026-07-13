import logo from "@/assets/logo.png"
import { cn } from "@/lib/utils"

interface AiBubbleProps {
  children: React.ReactNode
  hint?: string
  variant?: "default" | "warning"
  className?: string
}

export function AiBubble({ children, hint, variant = "default", className }: AiBubbleProps) {
  return (
    <div className={cn("flex gap-3", className)}>
      <img src={logo} alt="AI" className="size-8 shrink-0 rounded-xl shadow-xs" />
      <div className="max-w-[85%]">
        <div
          className={cn(
            "rounded-2xl rounded-tl-sm border border-border/70 bg-card px-4 py-3 text-sm leading-relaxed shadow-xs",
            variant === "warning" && "semantic-warning",
          )}
        >
          {children}
        </div>
        {hint && <div className="mt-1 pl-1 text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  )
}

export function UserBubble({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground",
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function TypingIndicator() {
  return (
    <div className="flex gap-1 pl-11">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:120ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:240ms]" />
    </div>
  )
}
