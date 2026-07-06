import type { Project, View } from "@/lib/types"
import type { AccentId } from "@/lib/mock-data"
import { SidebarContent } from "@/components/layout/SidebarContent"

interface SidebarProps {
  view: View
  setView: (v: View) => void
  projects: Project[]
  accent: AccentId
  setAccent: (a: AccentId) => void
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-sidebar-border md:flex">
      <SidebarContent {...props} className="w-full" />
    </aside>
  )
}
