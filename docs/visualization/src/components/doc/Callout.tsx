import { Info } from "lucide-react"

type CalloutProps = {
  children: React.ReactNode
}

export function Callout({ children }: CalloutProps) {
  return (
    <div className="my-4 flex gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0 text-foreground" />
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}
