import { useCallback, useEffect, useState } from "react"
import type { Project, View } from "@/lib/types"
import { INITIAL_PROJECTS, type AccentId } from "@/lib/mock-data"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt"
import { Sidebar } from "@/components/layout/Sidebar"
import { ProjectList } from "@/pages/ProjectList"
import { ProjectPage } from "@/pages/ProjectPage"
import { QAChatPage } from "@/pages/QAChatPage"
import { DashboardPage } from "@/pages/DashboardPage"

export default function App() {
  const [view, setView] = useState<View>({ name: "projects" })
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS)
  const [accent, setAccent] = useState<AccentId>("red")

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent)
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
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar
          view={view}
          setView={setView}
          projects={projects}
          accent={accent}
          setAccent={setAccent}
        />
        <main className="min-w-0 flex-1 overflow-hidden">
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
      <PwaUpdatePrompt />
    </TooltipProvider>
  )
}
