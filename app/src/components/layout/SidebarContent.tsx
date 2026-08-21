import { useState } from "react"
import {
  BookOpenText,
  FolderKanban,
  LayoutDashboard,
  MessageCircleQuestion,
  LogOut,
  Settings,
  Settings2,
  UserRound,
} from "lucide-react"
import logo from "@/assets/logo.png"
import type { Project, View } from "@/lib/types"
import type { AuthUser } from "@/lib/api/auth"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { NotificationBell } from "@/components/NotificationBell"
import { ProfileEditDialog } from "@/components/ProfileEditDialog"

export interface SidebarContentProps {
  view: View
  setView: (v: View) => void
  projects: Project[]
  user?: AuthUser | null
  onUpdateProfile?: (patch: { name: string; avatarUrl: string | null }) => Promise<void>
  onLogout?: () => void
  onNavigate?: () => void
  className?: string
}

export function SidebarContent({
  view,
  setView,
  projects,
  user,
  onUpdateProfile,
  onLogout,
  onNavigate,
  className,
}: SidebarContentProps) {
  const [profileOpen, setProfileOpen] = useState(false)
  const userName = user?.name ?? "ユーザー"
  const userRole = user?.role
  const avatarUrl = user?.avatarUrl

  const primaryNav = [
    {
      id: "projects" as const,
      label: "プロジェクト一覧",
      icon: FolderKanban,
      active: view.name === "projects" || view.name === "project",
    },
    {
      id: "qa" as const,
      label: "業務QAチャット",
      icon: MessageCircleQuestion,
      active: view.name === "qa",
    },
  ]

  const recentProjects = [...projects]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4)

  const go = (next: View) => {
    setView(next)
    onNavigate?.()
  }

  return (
    <div className={cn("flex h-full flex-col bg-sidebar", className)}>
      <div className="flex items-center gap-2.5 px-4 py-4">
        <img src={logo} alt="Rakumanual ロゴ" className="size-9" />
        <div>
          <div className="text-sm font-bold tracking-tight">Rakumanual</div>
          <div className="text-[10px] text-muted-foreground">業務マニュアル自動作成AI</div>
        </div>
      </div>
      <Separator />

      <nav className="flex flex-col gap-1 p-3">
        {primaryNav.map((item) => (
          <button
            key={item.id}
            onClick={() => go({ name: item.id })}
            className={cn(
              "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              item.active
                ? "bg-primary-subtle text-primary"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </button>
        ))}
      </nav>

      <Separator />

      <div className="scroll-touch min-h-0 flex-1 overflow-y-auto p-3">
        <div className="px-3 pb-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
          最近のプロジェクト
        </div>
        <div className="flex flex-col gap-0.5">
          {recentProjects.length === 0 ? (
            <p className="px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
              まだありません。一覧から作成できます。
            </p>
          ) : (
            recentProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => go({ name: "project", projectId: p.id, tab: "overview" })}
                className={cn(
                  "flex min-h-10 items-center gap-2 truncate rounded-md px-3 py-2 text-left text-[13px] transition-colors",
                  view.name === "project" && view.projectId === p.id
                    ? "bg-sidebar-accent font-medium text-sidebar-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <BookOpenText className="size-3.5 shrink-0" />
                <span className="truncate">{p.name}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <NotificationBell />
        <button
          type="button"
          onClick={() => go({ name: "dashboard" })}
          className={cn(
            "mb-1 flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors",
            view.name === "dashboard"
              ? "bg-primary-subtle font-medium text-primary"
              : "text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          )}
        >
          <LayoutDashboard className="size-3.5 shrink-0" />
          KPIダッシュボード
        </button>
        <button
          type="button"
          onClick={() => go({ name: "admin" })}
          className={cn(
            "mb-1 flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors",
            view.name === "admin"
              ? "bg-primary-subtle font-medium text-primary"
              : "text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          )}
        >
          <Settings className="size-3.5 shrink-0" />
          設定
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="mt-1 h-auto w-full justify-start gap-2.5 px-2 py-2 text-sidebar-foreground/70"
            >
              <Avatar className="size-7">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                <AvatarFallback className="bg-primary-subtle text-[11px] font-semibold text-primary">
                  {userName.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-[13px] font-medium text-sidebar-foreground">{userName}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {userRole ?? "SSOログイン済み"}
                </div>
              </div>
              <Settings2 className="size-3.5 shrink-0 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem
              className="gap-2.5"
              onClick={() => setProfileOpen(true)}
              disabled={!user || !onUpdateProfile}
            >
              <UserRound className="size-3.5" />
              プロフィールを編集
            </DropdownMenuItem>
            {onLogout && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="gap-2.5">
                  <LogOut className="size-3.5" />
                  ログアウト
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {user && onUpdateProfile && (
        <ProfileEditDialog
          open={profileOpen}
          onOpenChange={setProfileOpen}
          user={user}
          onSave={onUpdateProfile}
        />
      )}
    </div>
  )
}
