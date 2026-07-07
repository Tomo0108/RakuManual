import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import type { FlowConnector } from "./flow-connectors"
import { ConnectorPicker } from "./ConnectorPicker"
import type { ConnectorInsertMode } from "./flow-interaction-context"
import { AXIS_HEADER_HEIGHT } from "./flow-layout"
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
      <div className="flex w-10 shrink-0 flex-col border-r bg-muted/30">
        <div
          className="flex shrink-0 items-center justify-center border-b bg-muted/50"
          style={{ height: AXIS_HEADER_HEIGHT }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onToggleCollapse}
            aria-label="コネクタパネルを開く"
          >
            <PanelLeftOpen className="size-3.5" />
          </Button>
        </div>
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
      <div
        className="flex shrink-0 items-center justify-between border-b bg-muted/50 px-2"
        style={{ height: AXIS_HEADER_HEIGHT }}
      >
        <h3 className="text-[10px] font-semibold text-muted-foreground">コネクタ</h3>
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
