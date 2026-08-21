import { useEffect, useRef, useState } from "react"
import { Camera, Trash2, UserRound } from "lucide-react"
import type { AuthUser } from "@/lib/api/auth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const MAX_AVATAR_BYTES = 512 * 1024
const AVATAR_ACCEPT = "image/jpeg,image/png,image/gif,image/webp"

async function readAvatarFile(file: File): Promise<string> {
  if (!AVATAR_ACCEPT.split(",").includes(file.type)) {
    throw new Error("JPEG / PNG / GIF / WebP のみ選択できます")
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("画像は 512KB 以下にしてください")
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"))
    reader.readAsDataURL(file)
  })
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AuthUser
  onSave: (patch: { name: string; avatarUrl: string | null }) => Promise<void>
}

export function ProfileEditDialog({ open, onOpenChange, user, onSave }: Props) {
  const [name, setName] = useState(user.name)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl ?? null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(user.name)
    setAvatarUrl(user.avatarUrl ?? null)
    setError(null)
  }, [open, user])

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    try {
      setError(null)
      setAvatarUrl(await readAvatarFile(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像の読み込みに失敗しました")
    }
  }

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError("表示名を入力してください")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: trimmed, avatarUrl })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>プロフィール</DialogTitle>
          <DialogDescription>表示名とアイコンを変更できます。</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <Avatar className="size-20" size="lg">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-primary-subtle text-xl font-semibold text-primary">
              {name.trim().slice(0, 1) || <UserRound className="size-8" />}
            </AvatarFallback>
          </Avatar>
          <input
            ref={fileRef}
            type="file"
            accept={AVATAR_ACCEPT}
            className="hidden"
            onChange={(e) => void onPickFile(e)}
          />
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="size-3.5" />
              画像を選ぶ
            </Button>
            {avatarUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => setAvatarUrl(null)}
              >
                <Trash2 className="size-3.5" />
                アイコンをリセット
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="profile-name">表示名</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="例: 山田 太郎"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            キャンセル
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? "保存中…" : "保存する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
