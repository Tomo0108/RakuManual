import type { ComponentProps, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type ButtonVariant = ComponentProps<typeof Button>["variant"]
type ButtonSize = ComponentProps<typeof Button>["size"]

interface IconActionProps {
  label: string
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  tooltipSide?: "top" | "bottom" | "left" | "right"
}

/** アイコンのみの操作ボタン(ツールチップで説明を表示) */
export function IconAction({
  label,
  onClick,
  disabled,
  children,
  variant = "ghost",
  size = "icon",
  className,
  tooltipSide = "bottom",
}: IconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            variant={variant}
            size={size}
            className={cn(size === "icon" && "size-9 shrink-0", className)}
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  )
}
