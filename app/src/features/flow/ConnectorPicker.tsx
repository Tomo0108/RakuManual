import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import type { FlowConnector } from "./flow-connectors"
import {
  CONNECTOR_CATEGORIES,
  FREQUENT_CONNECTORS,
  connectorsForInsert,
  filterConnectors,
  type ConnectorCategory,
} from "./flow-connectors"
import type { ConnectorInsertMode } from "./flow-interaction-context"
import type { StepKind } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface ConnectorPickerProps {
  mode?: ConnectorInsertMode
  targetKind?: StepKind
  onSelect: (connector: FlowConnector) => void
  onDragStart?: (e: React.DragEvent, connector: FlowConnector) => void
  compact?: boolean
  className?: string
}

export function ConnectorPicker({
  mode = "append",
  targetKind,
  onSelect,
  onDragStart,
  compact = false,
  className,
}: ConnectorPickerProps) {
  const [query, setQuery] = useState("")
  const available = useMemo(
    () => connectorsForInsert(mode, targetKind),
    [mode, targetKind],
  )
  const filtered = useMemo(() => filterConnectors(available, query), [available, query])
  const frequent = useMemo(
    () => filterConnectors(FREQUENT_CONNECTORS.filter((c) => available.some((a) => a.id === c.id)), query),
    [available, query],
  )

  const byCategory = useMemo(() => {
    const map = new Map<ConnectorCategory, FlowConnector[]>()
    for (const cat of CONNECTOR_CATEGORIES) map.set(cat.id, [])
    for (const c of filtered) {
      if (!frequent.some((f) => f.id === c.id)) {
        map.get(c.category)?.push(c)
      }
    }
    return map
  }, [filtered, frequent])

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className={cn("shrink-0", compact ? "px-2 pt-2" : "px-3 pt-3")}>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="コネクタを検索…"
            className={cn("h-8 pl-8 text-xs", compact && "h-9 text-sm")}
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className={cn("space-y-3 pb-3", compact ? "px-2" : "px-3")}>
          {frequent.length > 0 && (
            <ConnectorSection title="よく使う">
              {frequent.map((c) => (
                <ConnectorTile
                  key={c.id}
                  connector={c}
                  onSelect={onSelect}
                  onDragStart={onDragStart}
                  compact={compact}
                  draggable={!!onDragStart}
                />
              ))}
            </ConnectorSection>
          )}
          {CONNECTOR_CATEGORIES.map((cat) => {
            const items = byCategory.get(cat.id) ?? []
            if (items.length === 0) return null
            return (
              <ConnectorSection key={cat.id} title={cat.label}>
                {items.map((c) => (
                  <ConnectorTile
                    key={c.id}
                    connector={c}
                    onSelect={onSelect}
                    onDragStart={onDragStart}
                    compact={compact}
                    draggable={!!onDragStart}
                  />
                ))}
              </ConnectorSection>
            )
          })}
          {filtered.length === 0 && (
            <p className="px-1 py-4 text-center text-xs text-muted-foreground">
              該当するコネクタがありません
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function ConnectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 px-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function ConnectorTile({
  connector,
  onSelect,
  compact,
  draggable,
  onDragStart,
}: {
  connector: FlowConnector
  onSelect: (connector: FlowConnector) => void
  compact?: boolean
  draggable?: boolean
  onDragStart?: (e: React.DragEvent, connector: FlowConnector) => void
}) {
  const Icon = connector.icon
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={draggable && onDragStart ? (e) => onDragStart(e, connector) : undefined}
      onClick={() => onSelect(connector)}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md border border-transparent px-2 py-2 text-left transition-colors",
        "hover:border-border hover:bg-accent/60 active:bg-accent",
        compact ? "py-2.5" : "py-2",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium leading-tight">{connector.label}</span>
        {!compact && (
          <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
            {connector.description}
          </span>
        )}
      </span>
    </button>
  )
}

export { ConnectorTile }
