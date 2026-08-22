import { useEffect, useState } from "react"
import { Bell, Palette, RotateCcw, Settings } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  resetClientSettingsToDefault,
  resetTutorialHints,
} from "@/lib/client-settings"
import { ACCENT_OPTIONS, type AccentId } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import {
  deleteTemplate,
  fetchAdminSettings,
  fetchAdminUsers,
  fetchAuditLogs,
  fetchNotificationSettings,
  fetchTemplates,
  updateAdminSettings,
  updateAdminUserRole,
  updateNotificationSettings,
  upsertTemplate,
  type AdminUser,
  type AuditLogItem,
  type DesignTemplate,
  type NotificationSettings,
} from "@/lib/api/admin"
import type { UserRole } from "@/lib/api/auth"

interface Props {
  isAdmin: boolean
  accent: AccentId
  setAccent: (a: AccentId) => void
}

export function AdminSettingsPage({ isAdmin, accent, setAccent }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [templates, setTemplates] = useState<DesignTemplate[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([])
  const [budget, setBudget] = useState(50000)
  const [provider, setProvider] = useState("mock")
  const [llmModel, setLlmModel] = useState("mock")
  const [notify, setNotify] = useState<NotificationSettings>({
    reviewDeadline: true,
    qaUnanswered: true,
    llmBudget: true,
  })
  const [tplName, setTplName] = useState("")
  const [tplId, setTplId] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    setError(null)
    try {
      const [tpls, prefs] = await Promise.all([fetchTemplates(), fetchNotificationSettings()])
      setTemplates(tpls)
      setNotify(prefs)
      if (isAdmin) {
        const [u, settings, logs] = await Promise.all([
          fetchAdminUsers(),
          fetchAdminSettings(),
          fetchAuditLogs({ limit: 30 }),
        ])
        setUsers(u)
        setBudget(settings.llmBudgetYen)
        setProvider(settings.llmProvider)
        setLlmModel(settings.llmModel ?? "")
        setAuditLogs(logs)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました")
    }
  }

  useEffect(() => {
    void reload()
  }, [isAdmin])

  return (
    <div className="scroll-touch h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
        <PageHeader title="設定" icon={<Settings className="size-5" />} />
        <p className="mt-2 text-sm text-muted-foreground">
          見た目・通知・テンプレート{isAdmin ? "・ユーザー権限・LLM予算" : ""}を設定します。
        </p>
        {message && <p className="mt-3 text-sm text-[var(--semantic-success-fg)]">{message}</p>}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Palette className="size-4" />
              アクセントカラー
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
              アプリ全体のアクセントカラーを切り替えます。この端末に保存されます。
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ACCENT_OPTIONS.map((opt) => {
                const selected = accent === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setAccent(opt.id)
                      setMessage("アクセントカラーを変更しました")
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary-subtle/60 ring-1 ring-primary/30"
                        : "hover:bg-muted/50",
                    )}
                  >
                    <span
                      className="size-5 shrink-0 rounded-full border shadow-xs"
                      style={{ background: opt.swatch }}
                    />
                    <span className="min-w-0 flex-1 font-medium">{opt.label}</span>
                    {selected && <span className="text-xs font-medium text-primary">選択中</span>}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bell className="size-4" />
              通知設定
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {(
              [
                {
                  key: "reviewDeadline" as const,
                  label: "見直し期限の接近",
                  hint: "マニュアルの見直し期限が近づいたときに知らせます",
                },
                {
                  key: "qaUnanswered" as const,
                  label: "QA未回答・根拠なし",
                  hint: "未回答のQAや根拠が不足している項目を知らせます",
                },
                {
                  key: "llmBudget" as const,
                  label: "LLMコスト閾値",
                  hint: "月間LLM利用額が閾値に達したときに知らせます",
                },
              ]
            ).map(({ key, label, hint }) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 rounded-lg px-1 py-3 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor={`notify-${key}`} className="cursor-pointer text-[13px] font-medium">
                    {label}
                  </Label>
                  <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
                </div>
                <Switch
                  id={`notify-${key}`}
                  checked={notify[key]}
                  onCheckedChange={(checked) => {
                    const next = { ...notify, [key]: checked }
                    setNotify(next)
                    void updateNotificationSettings(next)
                      .then(() => setMessage("通知設定を保存しました"))
                      .catch((err) => setError(err instanceof Error ? err.message : "保存失敗"))
                  }}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <RotateCcw className="size-4" />
              リセット
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-[11px] leading-snug text-muted-foreground">
              操作案内の再表示や、見た目・通知の初期化ができます。
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="sm:flex-1"
                onClick={() => {
                  resetTutorialHints()
                  setError(null)
                  setMessage("チュートリアルをリセットしました")
                }}
              >
                チュートリアルをリセット
              </Button>
              <Button
                type="button"
                variant="outline"
                className="sm:flex-1"
                onClick={() => {
                  setError(null)
                  void resetClientSettingsToDefault()
                    .then(({ accent: nextAccent, notify: nextNotify }) => {
                      setAccent(nextAccent)
                      setNotify(nextNotify)
                      setMessage("設定をデフォルトに戻しました")
                    })
                    .catch((err) =>
                      setError(err instanceof Error ? err.message : "リセットに失敗しました"),
                    )
                }}
              >
                設定をデフォルトに戻す
              </Button>
            </div>
            <ul className="space-y-1 text-[11px] leading-snug text-muted-foreground">
              <li>・チュートリアル: フロー図ロック案内・深掘りの戻るボタン案内などを再表示します</li>
              <li>・設定: アクセントカラーと通知設定を初期状態に戻します</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">デザインテンプレート</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-full border" style={{ background: t.color }} />
                    <span className="truncate text-sm font-medium">{t.name}</span>
                    <Badge variant="outline">{t.theme}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{t.description}</p>
                </div>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void deleteTemplate(t.id)
                        .then(reload)
                        .then(() => setMessage("テンプレートを削除しました"))
                        .catch((err) => setError(err instanceof Error ? err.message : "削除失敗"))
                    }
                  >
                    削除
                  </Button>
                )}
              </div>
            ))}
            {isAdmin && (
              <div className="mt-2 grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="tpl-id">ID</Label>
                  <Input id="tpl-id" value={tplId} onChange={(e) => setTplId(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="tpl-name">名称</Label>
                  <Input id="tpl-name" value={tplName} onChange={(e) => setTplName(e.target.value)} />
                </div>
                <Button
                  className="sm:col-span-3"
                  disabled={!tplId.trim() || !tplName.trim()}
                  onClick={() =>
                    void upsertTemplate(tplId.trim(), {
                      name: tplName.trim(),
                      theme: tplId.trim(),
                      description: "カスタムテンプレート",
                    })
                      .then(() => {
                        setTplId("")
                        setTplName("")
                        return reload()
                      })
                      .then(() => setMessage("テンプレートを保存しました"))
                      .catch((err) => setError(err instanceof Error ? err.message : "保存失敗"))
                  }
                >
                  テンプレートを追加/更新
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <>
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">LLMコスト予算</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="min-w-[10rem] flex-1">
                  <Label htmlFor="budget">月間予算 (円)</Label>
                  <Input
                    id="budget"
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                  />
                </div>
                <Badge variant="outline">
                  {provider}
                  {llmModel ? ` / ${llmModel}` : ""}
                </Badge>
                <Button
                  onClick={() =>
                    void updateAdminSettings({ llmBudgetYen: budget })
                      .then((s) => {
                        setBudget(s.llmBudgetYen)
                        setProvider(s.llmProvider)
                        setLlmModel(s.llmModel ?? "")
                        setMessage("予算を更新しました")
                      })
                      .catch((err) => setError(err instanceof Error ? err.message : "更新失敗"))
                  }
                >
                  予算を保存
                </Button>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">ユーザー権限</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {users.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                    <select
                      className="rounded-md border bg-background px-2 py-1 text-sm"
                      value={u.role}
                      onChange={(e) =>
                        void updateAdminUserRole(u.id, e.target.value as UserRole)
                          .then((updated) => {
                            setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                            setMessage(`${updated.name} の権限を更新しました`)
                          })
                          .catch((err) => setError(err instanceof Error ? err.message : "更新失敗"))
                      }
                    >
                      <option value="viewer">viewer</option>
                      <option value="creator">creator</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">監査ログ（直近）</CardTitle>
              </CardHeader>
              <CardContent className="max-h-64 space-y-2 overflow-y-auto text-xs">
                {auditLogs.length === 0 && (
                  <p className="text-muted-foreground">ログがありません</p>
                )}
                {auditLogs.map((log) => (
                  <div key={log.id} className="rounded border px-2 py-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{log.actionType}</span>
                      <span className="text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {log.userId}
                      {log.projectId ? ` / ${log.projectId}` : ""}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
