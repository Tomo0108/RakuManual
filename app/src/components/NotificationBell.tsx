import { useEffect, useState } from "react"
import { Bell } from "lucide-react"
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/api/admin"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([])

  const reload = () => {
    void fetchNotifications()
      .then(setItems)
      .catch(() => setItems([]))
  }

  useEffect(() => {
    reload()
    const t = window.setInterval(reload, 60_000)
    return () => window.clearInterval(t)
  }, [])

  const unread = items.filter((i) => !i.read).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative mb-1 h-10 w-full justify-start gap-2.5 px-3 text-[13px] text-sidebar-foreground/55"
        >
          <Bell className="size-3.5 shrink-0" />
          通知
          {unread > 0 && (
            <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
              {unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>通知</span>
          {unread > 0 && (
            <button
              type="button"
              className="text-xs font-normal text-primary"
              onClick={() => void markAllNotificationsRead().then(reload)}
            >
              すべて既読
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">通知はありません</div>
        )}
        {items.slice(0, 8).map((n) => (
          <DropdownMenuItem
            key={n.id}
            className="flex flex-col items-start gap-0.5 py-2"
            onClick={() => {
              if (!n.read) void markNotificationRead(n.id).then(reload)
            }}
          >
            <span className={`text-xs ${n.read ? "text-muted-foreground" : "font-medium"}`}>
              {n.title}
            </span>
            <span className="line-clamp-2 text-[11px] text-muted-foreground">{n.body}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
