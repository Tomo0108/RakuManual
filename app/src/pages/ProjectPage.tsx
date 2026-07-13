import { ArrowLeft, ChevronRight } from "lucide-react"
import type { Project, ProjectTab } from "@/lib/types"
import { STATUS_LABEL } from "@/lib/types"
import { STATUS_BADGE } from "@/lib/project-utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PipelineStepper } from "@/components/PipelineStepper"
import { TabScrollContainer } from "@/components/TabScrollContainer"
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

const TAB_ITEMS: { id: ProjectTab; label: string }[] = [
  { id: "overview", label: "概要" },
  { id: "hearing", label: "骨組みヒアリング" },
  { id: "flow", label: "フロー図" },
  { id: "deepdive", label: "深掘りヒアリング" },
  { id: "manual", label: "マニュアル" },
  { id: "export", label: "出力・活用" },
]

export function ProjectPage({ project, tab, setTab, updateProject, onBack }: Props) {
  return (
    <div className="flex h-full flex-col">
      {/* ヘッダー */}
      <header className="page-header px-4 pt-3 md:px-6 md:pt-4">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" className="-ml-2 h-8 shrink-0 gap-1 px-2" onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            <span className="hidden sm:inline">プロジェクト一覧</span>
            <span className="sm:hidden">戻る</span>
          </Button>
          <ChevronRight className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate font-medium text-foreground">{project.name}</span>
          <Badge variant="outline" className={cn("shrink-0", STATUS_BADGE[project.status])}>
            {STATUS_LABEL[project.status]}
          </Badge>
        </div>
        <div className="mt-3 hidden sm:block">
          <PipelineStepper project={project} activeTab={tab} onSelect={setTab} />
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as ProjectTab)} className="mt-2 md:mt-3">
          <TabScrollContainer>
            <TabsList className="h-auto w-max min-w-full justify-start gap-1 rounded-lg bg-secondary/70 p-1 flex-nowrap md:w-full">
              {TAB_ITEMS.map((t) => (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className="shrink-0 rounded-md px-3 py-2 text-[12px] font-medium text-muted-foreground shadow-none transition-colors hover:bg-accent hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm md:px-4 md:text-[13px]"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </TabScrollContainer>
        </Tabs>
      </header>

      {/* コンテンツ */}
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
