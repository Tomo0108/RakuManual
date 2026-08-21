import type { Project, View } from "@/lib/types"
import type { AuthUser } from "@/lib/api/auth"
import { SidebarContent } from "@/components/layout/SidebarContent"

interface SidebarProps {
  view: View
  setView: (v: View) => void
  projects: Project[]
  user?: AuthUser | null
  onUpdateProfile?: (patch: { name: string; avatarUrl: string | null }) => Promise<void>
  onLogout?: () => void
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-sidebar-border md:flex">
      <SidebarContent {...props} className="w-full" />
    </aside>
  )
}
