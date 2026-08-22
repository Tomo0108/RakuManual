import { useState } from "react"
import { CalendarClock, FolderOpen, Plus, Search, Sparkles, Trash2, User } from "lucide-react"
import type { Project, ProjectTab } from "@/lib/types"
import { STATUS_LABEL } from "@/lib/types"
import { STATUS_BADGE, STATUS_TAB, projectProgress, uid, today, formatUpdatedAt } from "@/lib/project-utils"
import { useAppSession } from "@/lib/api/use-app-session"
import { actorName } from "@/lib/actor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/EmptyState"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface Props {
  projects: Project[]
  onOpen: (id: string, tab?: ProjectTab) => void
  onCreate: (p: Project) => void
  onDelete?: (id: string) => void
  onSeedSamples?: () => void
  seeding?: boolean
  readOnly?: boolean
}

export function ProjectList({
  projects,
  onOpen,
  onCreate,
  onDelete,
  onSeedSamples,
  seeding,
  readOnly,
}: Props) {
  const [query, setQuery] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const { user } = useAppSession()

  const filtered = projects.filter(
    (p) => p.name.includes(query) || p.description.includes(query) || p.owner.includes(query),
  )

  const handleCreate = () => {
    if (!newName.trim()) return
    const id = uid("P")
    onCreate({
      id,
      name: newName.trim(),
      owner: actorName(user),
      ownerId: user?.id,
      updatedAt: today(),
      status: "hearing",
      description: newDesc.trim() || "",
      hearingAnswers: [],
      flow: { lanes: [], nodes: [], edges: [] },
      deepdive: [],
      sections: [],
      history: [],
    })
    setDialogOpen(false)
    setNewName("")
    setNewDesc("")
    // 「3クリック以内でヒアリング開始」要件: 作成後すぐヒアリングへ
    onOpen(id, "hearing")
  }

  return (
    <div className="scroll-touch h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
        <PageHeader
          title="プロジェクト一覧"
          actions={
            !readOnly ? (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full gap-1.5 sm:w-auto">
                  <Plus className="size-4" />
                  新規プロジェクト
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>新規プロジェクトの作成</DialogTitle>
                  <DialogDescription>
                    作成後、すぐにAIヒアリングが始まります。業務名だけ決めれば OK です。
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-name">マニュアル名(業務名)</Label>
                    <Input
                      id="new-name"
                      placeholder="例: 出張旅費の精算業務"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-desc">説明(任意)</Label>
                    <Textarea
                      id="new-desc"
                      placeholder="どんな業務のマニュアルか、ひとことで"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    キャンセル
                  </Button>
                  <Button onClick={handleCreate} disabled={!newName.trim()}>
                    作成してヒアリング開始
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            ) : undefined
          }
        />

        <div className="relative mt-6">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="プロジェクト名・説明・オーナーで検索"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="プロジェクトを検索"
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((p) => (
            <Card
              key={p.id}
              className="group cursor-pointer gap-4 transition-shadow hover:shadow-md"
              onClick={() => onOpen(p.id)}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug group-hover:text-primary">
                    {p.name}
                  </CardTitle>
                  <Badge variant="outline" className={STATUS_BADGE[p.status]}>
                    {STATUS_LABEL[p.status]}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-2">{p.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>進捗</span>
                  <span className="font-medium tabular-nums text-foreground">{projectProgress(p)}%</span>
                </div>
                <Progress value={projectProgress(p)} className="mt-1.5 h-2" />
              </CardContent>
              <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <User className="size-3.5" />
                    {p.owner}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CalendarClock className="size-3.5" />
                    更新 {formatUpdatedAt(p.updatedAt)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 w-full gap-1 sm:w-auto"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpen(p.id, STATUS_TAB[p.status])
                    }}
                  >
                    続きから →
                  </Button>
                  {!readOnly && onDelete && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label={`${p.name} を削除`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget(p)
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>
          ))}
          {filtered.length === 0 && (
            <EmptyState
              className="col-span-full"
              icon={query ? Search : FolderOpen}
              title={query ? "該当するプロジェクトがありません" : "プロジェクトがまだありません"}
              description={
                query
                  ? readOnly
                    ? "検索条件を変えてみてください。"
                    : "検索条件を変えるか、新規プロジェクトを作成してください。"
                  : readOnly
                    ? "共有されたプロジェクトがここに表示されます。担当者から公開・共有されるまでお待ちください。"
                    : "最初のマニュアルを作成して、AIヒアリングを始めましょう。"
              }
              action={
                !query && !readOnly
                  ? { label: "新規プロジェクトを作成", onClick: () => setDialogOpen(true) }
                  : undefined
              }
            >
              {!query && !readOnly && onSeedSamples && (
                <Button
                  variant="outline"
                  className="gap-1.5"
                  disabled={seeding}
                  onClick={onSeedSamples}
                >
                  <Sparkles className="size-4" />
                  {seeding ? "投入中…" : "サンプルデータを投入"}
                </Button>
              )}
            </EmptyState>
          )}
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>プロジェクトを削除しますか?</DialogTitle>
            <DialogDescription>
              「{deleteTarget?.name}」のヒアリング回答・フロー図・マニュアル本文がすべて削除されます。
              この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) onDelete?.(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
