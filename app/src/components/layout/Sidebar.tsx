import {
  BookOpenText,
  FolderKanban,
  LayoutDashboard,
  MessageCircleQuestion,
  Palette,
} from "lucide-react"
import logo from "@/assets/logo.png"
import type { Project, View } from "@/lib/types"
import { ACCENT_OPTIONS, type AccentId } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface SidebarProps {
  view: View
  setView: (v: View) => void
  projects: Project[]
  accent: AccentId
  setAccent: (a: AccentId) => void
}

export function Sidebar({ view, setView, projects, accent, setAccent }: SidebarProps) {
  const navItems = [
    { id: "projects", label: "プロジェクト一覧", icon: FolderKanban, active: view.name === "projects" || view.name === "project" },
    { id: "qa", label: "業務QAチャット", icon: MessageCircleQuestion, active: view.name === "qa" },
    { id: "dashboard", label: "KPIダッシュボード", icon: LayoutDashboard, active: view.name === "dashboard" },
  ] as const

  const recentProjects = [...projects]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4)

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
      {/* ロゴ */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        <img
          src={logo}
          alt="RakuManual ロゴ"
          className="size-9"
        />
        <div>
          <div className="text-sm font-bold tracking-tight">RakuManual</div>
          <div className="text-[10px] text-muted-foreground">業務マニュアル自動作成AI</div>
        </div>
      </div>
      <Separator />

      {/* ナビゲーション */}
      <nav className="flex flex-col gap-1 p-3">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView({ name: item.id } as View)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              item.active
                ? "bg-primary/10 text-primary"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </button>
        ))}
      </nav>

      <Separator />

      {/* 最近のプロジェクト */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="px-3 pb-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
          最近のプロジェクト
        </div>
        <div className="flex flex-col gap-0.5">
          {recentProjects.map((p) => (
            <button
              key={p.id}
              onClick={() => setView({ name: "project", projectId: p.id, tab: "overview" })}
              className={cn(
                "flex items-center gap-2 truncate rounded-md px-3 py-1.5 text-left text-[13px] transition-colors",
                view.name === "project" && view.projectId === p.id
                  ? "bg-sidebar-accent font-medium text-sidebar-foreground"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <BookOpenText className="size-3.5 shrink-0" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* アクセントカラー + ユーザー */}
      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2.5 text-sidebar-foreground/70">
              <Palette className="size-4" />
              アクセントカラー
              <span
                className="ml-auto size-3.5 rounded-full border"
                style={{ background: ACCENT_OPTIONS.find((o) => o.id === accent)?.swatch }}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>テーマカラーを選択</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ACCENT_OPTIONS.map((opt) => (
              <DropdownMenuItem key={opt.id} onClick={() => setAccent(opt.id)} className="gap-2.5">
                <span className="size-3.5 rounded-full border" style={{ background: opt.swatch }} />
                {opt.label}
                {accent === opt.id && <span className="ml-auto text-xs text-primary">✓</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mt-2 flex items-center gap-2.5 rounded-md px-2 py-1.5">
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">山</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium">山田 太郎</div>
            <div className="truncate text-[10px] text-muted-foreground">SSOログイン済み(社内)</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
