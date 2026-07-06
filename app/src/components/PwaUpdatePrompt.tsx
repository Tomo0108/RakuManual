import { useRegisterSW } from "virtual:pwa-register/react"
import { RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"

/** 新バージョン検出時に更新を促すバナー */
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) {
        setInterval(() => registration.update(), 60 * 60 * 1000)
      }
    },
  })

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-[100] flex max-w-sm items-center gap-3 rounded-lg border bg-background px-4 py-3 shadow-lg"
    >
      <p className="flex-1 text-sm leading-snug">
        新しいバージョンが利用できます
      </p>
      <Button
        size="sm"
        className="shrink-0 gap-1"
        onClick={() => updateServiceWorker(true)}
      >
        <RefreshCw className="size-3.5" />
        更新
      </Button>
      <button
        type="button"
        className="rounded p-1 text-muted-foreground hover:bg-muted"
        aria-label="閉じる"
        onClick={() => setNeedRefresh(false)}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
