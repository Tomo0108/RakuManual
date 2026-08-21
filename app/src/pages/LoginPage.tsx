import { useState } from "react"
import { BookOpenText, ChevronDown, ShieldCheck } from "lucide-react"
import logo from "@/assets/logo.png"
import { Button } from "@/components/ui/button"
import { oidcAuthorizeUrl } from "@/lib/api/auth"

const DEMO_USERS = [
  { id: "user-yamada", name: "山田 太郎", role: "作成者" },
  { id: "user-sato", name: "佐藤 太郎", role: "閲覧者" },
  { id: "user-admin", name: "管理 花子", role: "管理者" },
  { id: "user-pilot1", name: "鈴木 一郎", role: "作成者(パイロット)" },
  { id: "user-pilot2", name: "高橋 美咲", role: "作成者(パイロット)" },
] as const

interface Props {
  busy: boolean
  error: string | null
  onLogin: (userId: string) => void
}

export function LoginPage({ busy, error, onLogin }: Props) {
  const [showDemo, setShowDemo] = useState(false)
  const primary = DEMO_USERS[0]

  return (
    <div className="canvas-surface flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card/95 p-8 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col items-center text-center">
          <img src={logo} alt="" className="size-16 rounded-2xl" />
          <h1 className="mt-5 text-2xl font-bold tracking-tight">ラクマニュアル</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            業務マニュアルを、ヒアリングから公開まで一気通貫で整える
          </p>
        </div>
        {error && (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-8 flex flex-col gap-2">
          <Button
            className="h-11 w-full gap-2"
            disabled={busy}
            onClick={() => onLogin(primary.id)}
          >
            <BookOpenText className="size-4" />
            {busy ? "ログイン中…" : "はじめる"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={busy}
            onClick={() => {
              window.location.href = oidcAuthorizeUrl(primary.id)
            }}
          >
            <ShieldCheck className="size-4" />
            社内SSOでログイン
          </Button>
        </div>

        <div className="mt-6">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowDemo((v) => !v)}
          >
            開発用アカウント
            <ChevronDown className={`size-3.5 transition-transform ${showDemo ? "rotate-180" : ""}`} />
          </button>
          {showDemo && (
            <div className="mt-3 flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
              {DEMO_USERS.map((u) => (
                <Button
                  key={u.id}
                  variant="ghost"
                  size="sm"
                  className="h-9 justify-between px-2 text-xs"
                  disabled={busy}
                  onClick={() => onLogin(u.id)}
                >
                  <span>{u.name}</span>
                  <span className="text-muted-foreground">{u.role}</span>
                </Button>
              ))}
              <p className="pt-1 text-center text-[10px] text-muted-foreground">
                本番は社内IdP（SAML/OIDC）に接続します
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
