import { useState } from "react"
import { CircleHelp } from "lucide-react"
import { WARNING_BOX } from "@/lib/semantic-styles"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface Props {
  isMobile: boolean
  isLocked: boolean
}

/** フロー編集の操作説明 */
export function FlowHelpButton({ isMobile, isLocked }: Props) {
  const [open, setOpen] = useState(false)

  const tips = isMobile
    ? [
        "ピンチで拡大・縮小できます",
        "左上の＋ボタンでコネクタを追加できます",
        "下部バーでフロー図を左右に移動できます",
        "ノードをタップすると右上に担当部署が表示されます",
      ]
    : [
        "左パネル・線の＋・右クリックでコネクタを追加できます",
        "ノードを選択すると右パネルで担当・システム・項番を編集できます",
        "Shift＋クリックで複数選択、Shift＋ドラッグで範囲選択できます",
        "担当チーム列をダブルクリックで改名、下部の＋でレーン追加できます",
        "ノードをダブルクリックするとラベルをその場編集できます",
        "下部バーでフロー図を左右に移動できます",
      ]

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => setOpen(true)}
            aria-label="操作のヒント"
          >
            <CircleHelp className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">操作のヒント</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">フロー図の操作</DialogTitle>
          </DialogHeader>
          <ul className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
            {tips.map((tip) => (
              <li key={tip} className="flex gap-2">
                <span className="text-primary">•</span>
                <span>{tip}</span>
              </li>
            ))}
            {isLocked && (
              <li className={cn("flex gap-2 px-2.5 py-2", WARNING_BOX)}>
                <span>🔒</span>
                <span>ロック中です。編集するにはツールバーのロックを解除してください。</span>
              </li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
