import { ArrowLeft, ChevronRight } from "lucide-react"
import type { Project, ProjectTab } from "@/lib/types"
import { STATUS_LABEL } from "@/lib/types"
import { STATUS_BADGE } from "@/lib/project-utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OverviewTab } from "@/features/overview/OverviewTab"
import { HearingTab } from "@/features/hearing/HearingTab"
import { FlowEditorTab } from "@/features/flow/FlowEditorTab"
import { DeepDiveTab } from "@/features/deepdive/DeepDiveTab"
import { ManualTab } from "@/features/manual/ManualTab"
import { ExportTab } from "@/features/export/ExportTab"

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
      <header className="border-b bg-background px-6 pt-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" className="-ml-2 h-7 gap-1 px-2" onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            プロジェクト一覧
          </Button>
          <ChevronRight className="size-3.5" />
          <span className="font-medium text-foreground">{project.name}</span>
          <Badge variant="outline" className={STATUS_BADGE[project.status]}>
            {STATUS_LABEL[project.status]}
          </Badge>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as ProjectTab)} className="mt-3">
          <TabsList className="h-auto w-full justify-start gap-1 rounded-lg bg-muted/40 p-1">
            {TAB_ITEMS.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="rounded-md px-4 py-2 text-[13px] font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:bg-primary/85 data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
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
