import { useCallback, useEffect, useState } from "react"
import type { Project, View } from "@/lib/types"
import { INITIAL_PROJECTS, type AccentId } from "@/lib/mock-data"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt"
import { Sidebar } from "@/components/layout/Sidebar"
import { SidebarContent } from "@/components/layout/SidebarContent"
import { MobileHeader } from "@/components/layout/MobileHeader"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { ProjectList } from "@/pages/ProjectList"
import { ProjectPage } from "@/pages/ProjectPage"
import { QAChatPage } from "@/pages/QAChatPage"
import { DashboardPage } from "@/pages/DashboardPage"

export default function App() {
  const [view, setView] = useState<View>({ name: "projects" })
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS)
  const [accent, setAccent] = useState<AccentId>("red")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent)
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--background").trim() || "#faf8f6")
  }, [accent])

  const updateProject = useCallback(
    (id: string, updater: (p: Project) => Project) => {
      setProjects((prev) => prev.map((p) => (p.id === id ? updater(p) : p)))
    },
    [],
  )

  const addProject = useCallback((project: Project) => {
    setProjects((prev) => [project, ...prev])
  }, [])

  const currentProject =
    view.name === "project"
      ? projects.find((p) => p.id === view.projectId)
      : undefined

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh bg-background text-foreground">
        <Sidebar
          view={view}
          setView={setView}
          projects={projects}
          accent={accent}
          setAccent={setAccent}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <MobileHeader
            view={view}
            projects={projects}
            onMenuOpen={() => setMobileMenuOpen(true)}
          />
          <main className="canvas-surface min-h-0 flex-1 overflow-hidden">
            {view.name === "projects" && (
              <ProjectList
                projects={projects}
                onOpen={(id, tab) => setView({ name: "project", projectId: id, tab: tab ?? "overview" })}
                onCreate={addProject}
              />
            )}
            {view.name === "qa" && <QAChatPage onOpenProject={(id) => setView({ name: "project", projectId: id, tab: "manual" })} />}
            {view.name === "dashboard" && <DashboardPage projects={projects} />}
            {view.name === "project" && currentProject && (
              <ProjectPage
                key={currentProject.id}
                project={currentProject}
                tab={view.tab}
                setTab={(tab) => setView({ name: "project", projectId: currentProject.id, tab })}
                updateProject={updateProject}
                onBack={() => setView({ name: "projects" })}
              />
            )}
          </main>
        </div>
      </div>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[min(18rem,85vw)] p-0 [&>button]:text-foreground">
          <SidebarContent
            view={view}
            setView={setView}
            projects={projects}
            accent={accent}
            setAccent={setAccent}
            onNavigate={() => setMobileMenuOpen(false)}
            className="h-full"
          />
        </SheetContent>
      </Sheet>

      <PwaUpdatePrompt />
    </TooltipProvider>
  )
}
