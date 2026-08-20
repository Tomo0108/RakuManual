import { BookOpenText } from "lucide-react"
import logo from "@/assets/logo.png"
import { Button } from "@/components/ui/button"

const DEMO_USERS = [
  { id: "user-yamada", name: "山田 太郎", role: "作成者" },
  { id: "user-sato", name: "佐藤 太郎", role: "閲覧者" },
  { id: "user-admin", name: "管理 花子", role: "管理者" },
] as const

interface Props {
  busy: boolean
  error: string | null
  onLogin: (userId: string) => void
}

export function LoginPage({ busy, error, onLogin }: Props) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <img src={logo} alt="" className="size-14 rounded-xl" />
          <h1 className="mt-4 text-xl font-bold tracking-tight">ラクマニュアル</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            社内SSOでログインし、業務マニュアルの作成を続けます。
          </p>
        </div>
        {error && (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3">
          {DEMO_USERS.map((u) => (
            <div key={u.id} className="flex flex-col gap-1">
              <Button
                className="w-full gap-2"
                variant={u.id === "user-yamada" ? "default" : "outline"}
                disabled={busy}
                onClick={() => onLogin(u.id)}
              >
                <BookOpenText className="size-4" />
                {busy ? "ログイン中…" : `${u.name} としてログイン`}
              </Button>
              <span className="text-center text-[10px] text-muted-foreground">{u.role}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          開発環境のSSOモックです。ユーザー間でプロジェクトは見えません。
        </p>
      </div>
    </div>
  )
}
