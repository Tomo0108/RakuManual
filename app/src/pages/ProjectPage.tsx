import { ArrowLeft, ChevronRight } from "lucide-react"
import type { Project, ProjectTab } from "@/lib/types"
import { STATUS_LABEL } from "@/lib/types"
import { STATUS_BADGE } from "@/lib/project-utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ProjectProcessNav } from "@/components/ProjectProcessNav"
import { OverviewTab } from "@/features/overview/OverviewTab"
import { HearingTab } from "@/features/hearing/HearingTab"
import { FlowEditorTab } from "@/features/flow/FlowEditorTab"
import { DeepDiveTab } from "@/features/deepdive/DeepDiveTab"
import { ManualTab } from "@/features/manual/ManualTab"
import { ExportTab } from "@/features/export/ExportTab"
import { cn } from "@/lib/utils"

export type UpdateProject = (id: string, updater: (p: Project) => Project) => void

interface Props {
  project: Project
  tab: ProjectTab
  setTab: (t: ProjectTab) => void
  updateProject: UpdateProject
  onBack: () => void
}

export function ProjectPage({ project, tab, setTab, updateProject, onBack }: Props) {
  return (
    <div className="flex h-full flex-col">
      <header className="page-header px-4 pt-2 pb-2 md:px-6 md:pt-4 md:pb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" className="-ml-2 h-8 shrink-0 gap-1 px-2" onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            <span className="hidden sm:inline">プロジェクト一覧</span>
            <span className="sm:hidden">戻る</span>
          </Button>
          <ChevronRight className="hidden size-3.5 shrink-0 sm:block" />
          <span className="hidden min-w-0 truncate font-medium text-foreground sm:inline">{project.name}</span>
          <Badge variant="outline" className={cn("ml-auto shrink-0 sm:ml-0", STATUS_BADGE[project.status])}>
            {STATUS_LABEL[project.status]}
          </Badge>
        </div>
        <ProjectProcessNav tab={tab} status={project.status} onSelect={setTab} />
      </header>

      <div className="min-h-0 flex-1">
        {tab === "overview" && <OverviewTab project={project} setTab={setTab} />}
        {tab === "hearing" && <HearingTab project={project} updateProject={updateProject} setTab={setTab} />}
        {tab === "flow" && <FlowEditorTab project={project} updateProject={updateProject} setTab={setTab} />}
        {tab === "deepdive" && <DeepDiveTab project={project} updateProject={updateProject} setTab={setTab} />}
        {tab === "manual" && <ManualTab project={project} updateProject={updateProject} setTab={setTab} />}
        {tab === "export" && <ExportTab project={project} />}
      </div>
    </div>
  )
}
