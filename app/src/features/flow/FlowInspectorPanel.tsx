import { useEffect, useState } from "react"
import { Link2, SquarePen, X } from "lucide-react"
import type { FlowEdge, FlowNode, StepKind } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const KIND_OPTIONS: { value: StepKind; label: string }[] = [
  { value: "start", label: "開始" },
  { value: "process", label: "処理" },
  { value: "decision", label: "分岐" },
  { value: "end", label: "終了" },
]

export interface StepPatch {
  label?: string
  kind?: StepKind
  lane?: string
  system?: string
  sectionNumber?: string
}

interface Props {
  node?: FlowNode | null
  edge?: FlowEdge | null
  lanes: string[]
  locked?: boolean
  onLockedEditAttempt?: () => void
  onUpdateNode: (id: string, patch: StepPatch) => void
  onUpdateEdgeLabel: (id: string, label: string) => void
  onClose: () => void
  className?: string
}

export function FlowInspectorPanel({
  node,
  edge,
  lanes,
  locked,
  onLockedEditAttempt,
  onUpdateNode,
  onUpdateEdgeLabel,
  onClose,
  className,
}: Props) {
  const [label, setLabel] = useState(node?.data.label ?? "")
  const [system, setSystem] = useState(node?.data.system ?? "")
  const [edgeLabel, setEdgeLabel] = useState(
    edge && typeof edge.label === "string" ? edge.label : "",
  )

  useEffect(() => {
    setLabel(node?.data.label ?? "")
    setSystem(node?.data.system ?? "")
  }, [node?.id, node?.data.label, node?.data.system])

  useEffect(() => {
    setEdgeLabel(edge && typeof edge.label === "string" ? edge.label : "")
  }, [edge?.id, edge?.label])

  if (!node && !edge) return null

  return (
    <aside className={cn("flex w-64 shrink-0 flex-col border-l bg-card", className)}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {node ? (
          <SquarePen className="size-3.5 text-primary" />
        ) : (
          <Link2 className="size-3.5 text-primary" />
        )}
        <span className="flex-1 text-xs font-semibold">
          {node ? "ステップ詳細" : "結線詳細"}
        </span>
        <Button variant="ghost" size="icon" className="size-6" onClick={onClose} aria-label="閉じる">
          <X className="size-3.5" />
        </Button>
      </div>

      <div
        className={cn("flex flex-1 flex-col gap-3 overflow-y-auto p-3", locked && "cursor-not-allowed")}
        onClick={locked ? onLockedEditAttempt : undefined}
      >
        {node && (
          <>
            <Field label="ラベル">
              <Input
                value={label}
                disabled={locked}
                className={cn("h-8 text-xs", locked && "pointer-events-none")}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={() => {
                  if (label.trim() && label !== node.data.label) {
                    onUpdateNode(node.id, { label: label.trim() })
                  } else {
                    setLabel(node.data.label)
                  }
                }}
              />
            </Field>

            <Field label="種別">
              <Select
                value={node.data.kind}
                disabled={locked}
                onValueChange={(v) => onUpdateNode(node.id, { kind: v as StepKind })}
              >
                <SelectTrigger size="sm" className="w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="担当チーム">
              <Select
                value={node.data.lane || lanes[0] || ""}
                disabled={locked || lanes.length === 0}
                onValueChange={(v) => onUpdateNode(node.id, { lane: v })}
              >
                <SelectTrigger size="sm" className="w-full text-xs">
                  <SelectValue placeholder="レーンを選択" />
                </SelectTrigger>
                <SelectContent>
                  {lanes.map((lane) => (
                    <SelectItem key={lane} value={lane} className="text-xs">
                      {lane}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="利用システム">
              <Input
                value={system}
                disabled={locked}
                placeholder="例: 勤怠システム"
                className={cn("h-8 text-xs", locked && "pointer-events-none")}
                onChange={(e) => setSystem(e.target.value)}
                onBlur={() => {
                  const next = system.trim() || undefined
                  if (next !== node.data.system) onUpdateNode(node.id, { system: next })
                }}
              />
            </Field>

            {(node.data.kind === "process" || node.data.kind === "decision") && (
              <Field label="項番（自動）">
                <Input
                  value={node.data.sectionNumber ?? "（未採番）"}
                  disabled
                  className="h-8 text-xs"
                />
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  参考資料粒度で自動採番します。中項目は 1.1 / 2.1、同じ操作の分冊・分岐だけ 2.2.1 のように下層へ。担当レーンが変わると大項目が繰り上がります。
                </p>
              </Field>
            )}

            {node.data.manual && (
              <p className="text-[10px] text-muted-foreground">手動修正済み（再生成で保護）</p>
            )}
            {node.data.source && (
              <p className="text-[10px] text-muted-foreground">生成根拠: {node.data.source}</p>
            )}
          </>
        )}

        {edge && !node && (
          <>
            <Field label="結線ラベル">
              <Input
                value={edgeLabel}
                disabled={locked}
                placeholder="例: はい / いいえ"
                className={cn("h-8 text-xs", locked && "pointer-events-none")}
                onChange={(e) => setEdgeLabel(e.target.value)}
                onBlur={() => {
                  const current = typeof edge.label === "string" ? edge.label : ""
                  if (edgeLabel !== current) onUpdateEdgeLabel(edge.id, edgeLabel)
                }}
              />
            </Field>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              分岐の出口ラベル（はい／いいえなど）を編集できます。空にすると自動補完されます。
            </p>
          </>
        )}
      </div>
    </aside>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
