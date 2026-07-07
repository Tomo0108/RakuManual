import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import type { FlowConnector } from "./flow-connectors"
import { ConnectorPicker } from "./ConnectorPicker"
import type { ConnectorInsertMode } from "./flow-interaction-context"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Props {
  collapsed: boolean
  onToggleCollapse: () => void
  onSelect: (connector: FlowConnector) => void
  onDragStart: (e: React.DragEvent, connector: FlowConnector) => void
  disabled?: boolean
}

export function FlowConnectorPanel({
  collapsed,
  onToggleCollapse,
  onSelect,
  onDragStart,
  disabled,
}: Props) {
  if (collapsed) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center border-r bg-muted/30 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onToggleCollapse}
          aria-label="コネクタパネルを開く"
        >
          <PanelLeftOpen className="size-4" />
        </Button>
      </div>
    )
  }

  return (
    <aside
      className={cn(
        "flex w-[248px] shrink-0 flex-col border-r bg-muted/20",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <div>
          <h3 className="text-xs font-semibold">コネクタ</h3>
          <p className="text-[10px] text-muted-foreground">ドラッグまたはクリックで追加</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onToggleCollapse}
          aria-label="コネクタパネルを閉じる"
        >
          <PanelLeftClose className="size-3.5" />
        </Button>
      </div>
      <ConnectorPicker
        mode={"append" satisfies ConnectorInsertMode}
        onSelect={onSelect}
        onDragStart={onDragStart}
        className="min-h-0 flex-1"
      />
      <div className="shrink-0 border-t px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
        線やノードの <span className="font-mono text-primary">+</span> からも挿入できます
      </div>
    </aside>
  )
}

/** モバイル用: ドラッグ対応のコネクタリスト */
export function FlowConnectorPanelBody({
  onSelect,
  mode = "append",
}: {
  onSelect: (connector: FlowConnector) => void
  mode?: ConnectorInsertMode
}) {
  return <ConnectorPicker mode={mode} onSelect={onSelect} className="max-h-[60vh]" />
}
