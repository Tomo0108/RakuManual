import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  className?: string
}

/** トップレベルページ共通ヘッダー */
export function PageHeader({ title, description, icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-2xl">
          {icon && <span className="shrink-0 text-primary">{icon}</span>}
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}
