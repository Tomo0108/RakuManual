import { useCallback, useEffect, useState } from "react"
import type { View } from "@/lib/types"
import type { AccentId } from "@/lib/mock-data"
import { loadAccent, saveAccent } from "@/lib/accent-storage"
import { useAppSession } from "@/lib/api/use-app-session"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt"
import { Sidebar } from "@/components/layout/Sidebar"
import { SidebarContent } from "@/components/layout/SidebarContent"
import { MobileHeader } from "@/components/layout/MobileHeader"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ProjectList } from "@/pages/ProjectList"
import { ProjectPage } from "@/pages/ProjectPage"
import { QAChatPage } from "@/pages/QAChatPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { ManualViewerPage } from "@/pages/ManualViewerPage"
import { LoginPage } from "@/pages/LoginPage"
import { AdminSettingsPage } from "@/pages/AdminSettingsPage"

export default function App() {
  const [view, setView] = useState<View>({ name: "projects" })
  const [accent, setAccentState] = useState<AccentId>(() => loadAccent())
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const session = useAppSession()

  const setAccent = useCallback((next: AccentId) => {
    setAccentState(next)
    saveAccent(next)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent)
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute(
      "content",
      getComputedStyle(document.documentElement).getPropertyValue("--background").trim() || "#faf8f6",
    )
  }, [accent])

  const { projects, updateProject, addProject } = session

  const currentProject =
    view.name === "project" || view.name === "viewer"
      ? projects.find((p) => p.id === view.projectId)
      : undefined

  if (session.booting) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        読み込み中…
      </div>
    )
  }

  if (session.needsLogin) {
    return (
      <LoginPage
        busy={session.loginBusy}
        error={session.loginError}
        onLogin={(userId) => void session.login(userId)}
      />
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh bg-background text-foreground">
        <Sidebar
          view={view}
          setView={setView}
          projects={projects}
          accent={accent}
          setAccent={setAccent}
          userName={session.user?.name ?? "山田 太郎"}
          userRole={session.user?.role}
          onLogout={session.apiAvailable ? () => void session.logout() : undefined}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <MobileHeader
            view={view}
            projects={projects}
            onMenuOpen={() => setMobileMenuOpen(true)}
          />
          {session.saveError && (
            <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive">
              <span className="min-w-0 flex-1">保存に失敗しました: {session.saveError}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 shrink-0"
                onClick={() => session.retrySave()}
              >
                再試行
              </Button>
            </div>
          )}
          <main className="canvas-surface min-h-0 flex-1 overflow-hidden">
            {view.name === "projects" && (
              <ProjectList
                projects={projects}
                readOnly={session.user?.role === "viewer"}
                onOpen={(id, tab) => {
                  const p = projects.find((x) => x.id === id)
                  if (session.user?.role === "viewer" && p?.status === "published") {
                    setView({ name: "viewer", projectId: id })
                    return
                  }
                  setView({ name: "project", projectId: id, tab: tab ?? "overview" })
                }}
                onCreate={addProject}
              />
            )}
            {view.name === "qa" && (
              <QAChatPage
                onOpenSource={(projectId, sectionId) =>
                  setView({ name: "viewer", projectId, sectionId })
                }
              />
            )}
            {view.name === "dashboard" && <DashboardPage projects={projects} />}
            {view.name === "admin" && (
              <AdminSettingsPage isAdmin={session.user?.role === "admin"} />
            )}
            {view.name === "viewer" && currentProject && (
              <ManualViewerPage
                project={currentProject}
                sectionId={view.sectionId}
                onBack={() => setView({ name: "qa" })}
              />
            )}
            {view.name === "project" && currentProject && session.user?.role === "viewer" && (
              <ManualViewerPage
                project={currentProject}
                onBack={() => setView({ name: "projects" })}
              />
            )}
            {view.name === "project" && currentProject && session.user?.role !== "viewer" && (
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
            userName={session.user?.name ?? "山田 太郎"}
            userRole={session.user?.role}
            onLogout={session.apiAvailable ? () => void session.logout() : undefined}
            onNavigate={() => setMobileMenuOpen(false)}
            className="h-full"
          />
        </SheetContent>
      </Sheet>

      <PwaUpdatePrompt />
    </TooltipProvider>
  )
}
