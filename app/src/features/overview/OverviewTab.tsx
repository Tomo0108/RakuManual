import { useEffect, useState } from "react"
import {
  ArrowRight,
  BookCheck,
  CalendarClock,
  Eye,
  History,
  ListChecks,
  MessagesSquare,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react"
import type { Project, ProjectTab } from "@/lib/types"
import type { UpdateProject } from "@/pages/ProjectPage"
import { countManualReviewNeeded, buildUnplacedCandidates } from "@/lib/manual-impact"
import {
  addProjectMember,
  fetchDirectoryUsers,
  fetchProjectMembers,
  transferProjectOwner,
  updateProjectMeta,
} from "@/lib/api/projects"
import type { AuthUser } from "@/lib/api/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface Props {
  project: Project
  setTab: (t: ProjectTab) => void
  updateProject: UpdateProject
}

export function OverviewTab({ project, setTab, updateProject }: Props) {
  const answered = project.hearingAnswers.filter((a) => a.status === "answered").length
  const deepdiveDone = project.deepdive.filter((d) => d.status === "done").length
  const needsConfirm = project.sections.reduce(
    (acc, s) => acc + s.blocks.filter((b) => b.needsConfirm).length,
    0,
  )
  const syncReview =
    countManualReviewNeeded(project.sections) +
    buildUnplacedCandidates(project.flow, project.sections).length

  const statusToTab: Record<string, ProjectTab> = {
    hearing: "hearing",
    flow: "flow",
    deepdive: "deepdive",
    manual: "manual",
    published: "export",
  }
  const currentTab = statusToTab[project.status] ?? "overview"

  const steps: {
    tab: ProjectTab
    icon: typeof MessagesSquare
    title: string
    stat: string
    done: boolean
    current: boolean
  }[] = [
    {
      tab: "hearing",
      icon: MessagesSquare,
      title: "骨組みヒアリング",
      stat: `${answered} / 10 問回答済み`,
      done: answered >= 10 && project.status !== "hearing",
      current: currentTab === "hearing",
    },
    {
      tab: "flow",
      icon: Workflow,
      title: "フロー図の生成・編集",
      stat: project.flow.nodes.length > 0 ? `${project.flow.nodes.length} ステップ` : "未生成",
      done: project.flow.nodes.length > 0 && project.status !== "flow" && project.status !== "hearing",
      current: currentTab === "flow",
    },
    {
      tab: "deepdive",
      icon: ListChecks,
      title: "深掘りヒアリング",
      stat:
        project.deepdive.length > 0
          ? `${deepdiveDone} / ${project.deepdive.length} ステップ完了`
          : "未着手",
      done: project.deepdive.length > 0 && deepdiveDone === project.deepdive.length,
      current: currentTab === "deepdive",
    },
    {
      tab: "manual",
      icon: BookCheck,
      title: "マニュアル生成・編集",
      stat:
        project.sections.length > 0
          ? `${project.sections.length} セクション` +
            (needsConfirm > 0 ? ` ・ 要確認 ${needsConfirm} 件` : " ・ 要確認なし") +
            (syncReview > 0 ? ` ・ フロー見直し ${syncReview} 件` : "")
          : "未生成",
      done: project.sections.length > 0 && needsConfirm === 0,
      current: currentTab === "manual",
    },
  ]

  const currentStep = steps.find((s) => s.current)
  const [deadline, setDeadline] = useState(project.reviewDeadline ?? "")
  const [members, setMembers] = useState<Array<{ userId: string; permission: string }>>([])
  const [directory, setDirectory] = useState<AuthUser[]>([])
  const [memberUserId, setMemberUserId] = useState("user-sato")
  const [transferUserId, setTransferUserId] = useState("user-admin")
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null)
  const [settingsErr, setSettingsErr] = useState<string | null>(null)

  useEffect(() => {
    setDeadline(project.reviewDeadline ?? "")
  }, [project.reviewDeadline])

  useEffect(() => {
    void fetchProjectMembers(project.id)
      .then(setMembers)
      .catch(() => setMembers([]))
    void fetchDirectoryUsers().then(setDirectory)
  }, [project.id])

  const saveDeadline = async () => {
    setSettingsErr(null)
    try {
      const next = await updateProjectMeta(project.id, {
        reviewDeadline: deadline.trim() ? deadline.trim() : null,
      })
      updateProject(project.id, () => next)
      setSettingsMsg("見直し期限を保存しました")
    } catch (e) {
      setSettingsErr(e instanceof Error ? e.message : "保存に失敗しました")
    }
  }

  const inviteMember = async () => {
    setSettingsErr(null)
    try {
      const next = await addProjectMember(project.id, memberUserId, "view")
      setMembers(next)
      setSettingsMsg("メンバーを追加しました")
    } catch (e) {
      setSettingsErr(e instanceof Error ? e.message : "追加に失敗しました")
    }
  }

  const doTransfer = async () => {
    setSettingsErr(null)
    try {
      const next = await transferProjectOwner(project.id, transferUserId)
      updateProject(project.id, () => next)
      setSettingsMsg(`オーナーを ${next.owner} に変更しました`)
    } catch (e) {
      setSettingsErr(e instanceof Error ? e.message : "オーナー変更に失敗しました")
    }
  }

  return (
    <div className="scroll-touch h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8">
        <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm md:p-6">
          <p className="text-[15px] leading-relaxed text-foreground/90">{project.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4 text-sm">
            <Users className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">オーナー</span>
            <Badge variant="secondary">{project.owner}</Badge>
          </div>
        </section>

        {currentStep && project.status !== "published" && (
          <section className="mt-5 flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between md:mt-6 md:pb-6">
            <div className="min-w-0">
              <div className="text-[11px] tracking-wide text-muted-foreground">現在の工程</div>
              <div className="mt-1 text-lg font-semibold tracking-tight">{currentStep.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{currentStep.stat}</div>
            </div>
            <Button className="shrink-0 gap-1.5" onClick={() => setTab(currentStep.tab)}>
              この工程へ進む
              <ArrowRight className="size-4" />
            </Button>
          </section>
        )}

        <section className={cn(currentStep && project.status !== "published" ? "mt-5 md:mt-6" : "mt-6 md:mt-8")}>
          <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase md:mb-4">
            作成工程
          </h2>
          <div className="flex flex-col">
            {steps.map((s) => (
              <button
                key={s.tab}
                type="button"
                onClick={() => setTab(s.tab)}
                className={cn(
                  "group flex w-full items-center gap-3 border-b border-border/50 px-1 py-3.5 text-left transition-colors last:border-b-0 sm:gap-4 sm:py-4",
                  s.current ? "bg-muted/40" : "hover:bg-muted/25",
                )}
              >
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-md",
                    s.current
                      ? "bg-foreground text-background"
                      : s.done
                        ? "bg-foreground/8 text-foreground/70"
                        : "bg-transparent text-muted-foreground",
                  )}
                >
                  <s.icon className="size-4.5" />
                </div>
                <div
                  className={cn(
                    "min-w-0 flex-1 border-l-2 pl-3 sm:pl-4",
                    s.current ? "border-l-primary" : "border-l-transparent",
                  )}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span
                      className={cn(
                        "text-sm leading-snug",
                        s.current ? "font-semibold text-foreground" : "font-medium text-foreground/90",
                      )}
                    >
                      {s.title}
                    </span>
                    {s.current && <span className="text-[11px] text-primary">進行中</span>}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.stat}</div>
                </div>
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1 text-sm",
                    s.current ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  {s.done && !s.current ? (
                    <>
                      <Eye className="size-3.5" />
                      <span className="hidden sm:inline">確認</span>
                    </>
                  ) : (
                    <>
                      <span className="hidden sm:inline">{s.current ? "続ける" : "開く"}</span>
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>

        <Card className="mt-6 gap-0 py-0 sm:mt-8">
          <CardHeader className="border-b border-border/60 px-4 py-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarClock className="size-4 text-muted-foreground" />
              見直し期限・権限
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="space-y-2">
                <Label htmlFor="deadline">見直し期限</Label>
                <Input
                  id="deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button className="sm:mt-7" onClick={() => void saveDeadline()}>
                期限を保存
              </Button>
            </div>

            <div className="grid gap-3 border-t border-border/60 pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="space-y-2">
                <Label htmlFor="member">メンバー招待</Label>
                <select
                  id="member"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={memberUserId}
                  onChange={(e) => setMemberUserId(e.target.value)}
                >
                  {directory
                    .filter((u) => u.id !== project.ownerId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                </select>
                {members.length > 0 && (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {members.map((m) => {
                      const name = directory.find((u) => u.id === m.userId)?.name ?? m.userId
                      const perm =
                        m.permission === "edit"
                          ? "編集可"
                          : m.permission === "admin"
                            ? "管理者"
                            : "閲覧"
                      return (
                        <li key={m.userId}>
                          {name}
                          <span className="text-muted-foreground/80"> · {perm}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <Button
                variant="outline"
                className="gap-1.5 sm:mt-7"
                onClick={() => void inviteMember()}
              >
                <UserPlus className="size-4" />
                招待
              </Button>
            </div>

            <div className="grid gap-3 border-t border-border/60 pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="space-y-2">
                <Label htmlFor="transfer">オーナー変更</Label>
                <select
                  id="transfer"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={transferUserId}
                  onChange={(e) => setTransferUserId(e.target.value)}
                >
                  {directory
                    .filter((u) => u.id !== project.ownerId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </div>
              <Button
                variant="destructive"
                className="sm:mt-7"
                onClick={() => {
                  if (
                    !window.confirm(
                      `オーナーを変更します。変更後、現在のアカウントの編集権限が失われる場合があります。よろしいですか？`,
                    )
                  ) {
                    return
                  }
                  void doTransfer()
                }}
              >
                オーナー変更
              </Button>
            </div>

            {settingsMsg && <p className="text-sm text-[var(--semantic-success-fg)]">{settingsMsg}</p>}
            {settingsErr && <p className="text-sm text-destructive">{settingsErr}</p>}
          </CardContent>
        </Card>

        <Card className="mt-6 gap-0 py-0 sm:mt-8">
          <CardHeader className="border-b border-border/60 px-4 py-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-sm">
              <History className="size-4 text-muted-foreground" />
              更新履歴
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-4 sm:px-6 sm:py-5">
            {project.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">まだ履歴がありません</p>
            ) : (
              <ol className="relative flex flex-col gap-4 border-l border-border/80 pl-5">
                {project.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary/60 ring-2 ring-card" />
                    <div className="text-[13px] leading-relaxed">{h.action}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {h.date} ・ {h.user}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
