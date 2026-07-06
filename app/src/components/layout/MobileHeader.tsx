import { Menu } from "lucide-react"
import logo from "@/assets/logo.png"
import type { Project, View } from "@/lib/types"
import { Button } from "@/components/ui/button"

interface MobileHeaderProps {
  view: View
  projects: Project[]
  onMenuOpen: () => void
}

function pageTitle(view: View, projects: Project[]): string {
  switch (view.name) {
    case "projects":
      return "プロジェクト一覧"
    case "qa":
      return "業務QAチャット"
    case "dashboard":
      return "KPIダッシュボード"
    case "project":
      return projects.find((p) => p.id === view.projectId)?.name ?? "プロジェクト"
    default:
      return "RakuManual"
  }
}

export function MobileHeader({ view, projects, onMenuOpen }: MobileHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-3 pt-[env(safe-area-inset-top)] md:hidden">
      <Button
        variant="ghost"
        size="icon"
        className="size-10 shrink-0"
        onClick={onMenuOpen}
        aria-label="メニューを開く"
      >
        <Menu className="size-5" />
      </Button>
      <img src={logo} alt="" className="size-8 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{pageTitle(view, projects)}</div>
        <div className="truncate text-[10px] text-muted-foreground">RakuManual</div>
      </div>
    </header>
  )
}
