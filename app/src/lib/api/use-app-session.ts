import { useCallback, useEffect, useRef, useState } from "react"
import type { Project } from "@/lib/types"
import { INITIAL_PROJECTS } from "@/lib/mock-data"
import { today } from "@/lib/project-utils"
import { ApiError } from "@/lib/api/client"
import { apiUrl } from "@/lib/api/base"
import { fetchMe, login as apiLogin, loginWithOidcCode, logout as apiLogout, type AuthUser } from "@/lib/api/auth"
import {
  createProject,
  deleteProjectApi,
  fetchProject,
  fetchProjects,
  updateProjectApi,
} from "@/lib/api/projects"

const PERSIST_MS = 500

const CONFLICT_MESSAGE = "他で更新されました。再読み込みしてください"

async function apiReachable(): Promise<boolean> {
  try {
    const res = await fetch(apiUrl("/health"), { credentials: "include" })
    if (!res.ok) return false
    const ct = res.headers.get("content-type") ?? ""
    // Vercel の SPA rewrite で HTML が返ると「繋がっている」と誤判定しない
    if (!ct.includes("application/json")) return false
    const body = (await res.json()) as { status?: string }
    return body.status === "ok"
  } catch {
    return false
  }
}

export function useAppSession() {
  const [booting, setBooting] = useState(true)
  const [bootAttempt, setBootAttempt] = useState(0)
  const [apiAvailable, setApiAvailable] = useState(false)
  const [apiOffline, setApiOffline] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginBusy, setLoginBusy] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const projectsRef = useRef(projects)
  const persistTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const persistQueue = useRef(new Map<string, Project>())

  useEffect(() => {
    projectsRef.current = projects
  }, [projects])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const reachable = await apiReachable()
      if (cancelled) return
      setApiAvailable(reachable)

      // API に到達できない場合はモックデータを編集させない（保存できない編集を防ぐ）
      if (!reachable) {
        setProjects([])
        setApiOffline(true)
        setBooting(false)
        return
      }

      try {
        const params = new URLSearchParams(window.location.search)
        if (params.get("sso") === "callback" && params.get("code")) {
          const me = await loginWithOidcCode(params.get("code")!)
          if (cancelled) return
          setUser(me)
          window.history.replaceState({}, "", window.location.pathname)
          const list = await fetchProjects()
          if (cancelled) return
          setProjects(list)
        } else {
          const me = await fetchMe()
          if (cancelled) return
          setUser(me)
          const list = await fetchProjects()
          if (cancelled) return
          setProjects(list)
        }
        if (!cancelled) setApiOffline(false)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          setUser(null)
          setApiOffline(false)
        } else {
          // 401 以外はデモデータへフォールバックせず接続エラーとして扱う
          setProjects([])
          setApiOffline(true)
        }
      } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bootAttempt])

  const retryConnection = useCallback(() => {
    setBooting(true)
    setApiOffline(false)
    setSaveError(null)
    setBootAttempt((n) => n + 1)
  }, [])

  const flushPersist = useCallback(async (id: string) => {
    const project = persistQueue.current.get(id) ?? projectsRef.current.find((p) => p.id === id)
    if (!project) return
    persistQueue.current.delete(id)
    try {
      const saved = await updateProjectApi(project)
      setProjects((prev) => prev.map((p) => (p.id === id ? saved : p)))
      setSaveError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // 保存競合: サーバー側の最新を取り込み、ユーザーに再読み込みを促す
        try {
          const latest = await fetchProject(id)
          setProjects((prev) => prev.map((p) => (p.id === id ? latest : p)))
        } catch {
          /* 取得失敗時はローカル状態を維持 */
        }
        setSaveError(CONFLICT_MESSAGE)
        return
      }
      setSaveError(err instanceof Error ? err.message : "保存に失敗しました")
    }
  }, [])

  const schedulePersist = useCallback(
    (project: Project) => {
      if (!apiAvailable || !user) return
      persistQueue.current.set(project.id, project)
      const prev = persistTimers.current.get(project.id)
      if (prev) clearTimeout(prev)
      persistTimers.current.set(
        project.id,
        setTimeout(() => {
          persistTimers.current.delete(project.id)
          void flushPersist(project.id)
        }, PERSIST_MS),
      )
    },
    [apiAvailable, user, flushPersist],
  )

  const updateProject = useCallback(
    (id: string, updater: (p: Project) => Project) => {
      setProjects((prev) => {
        const next = prev.map((p) => {
          if (p.id !== id) return p
          const updated = { ...updater(p), updatedAt: today() }
          schedulePersist(updated)
          return updated
        })
        return next
      })
    },
    [schedulePersist],
  )

  /**
   * 専用エンドポイントで既に永続化済みの変更を画面へ反映する。
   * 全体 PUT を発行しないため、サーバー側で追記された履歴を消さない。
   */
  const updateProjectLocal = useCallback(
    (id: string, updater: (p: Project) => Project) => {
      setProjects((prev) => prev.map((p) => (p.id === id ? updater(p) : p)))
    },
    [],
  )

  const addProject = useCallback(
    (project: Project) => {
      setProjects((prev) => [project, ...prev])
      if (!apiAvailable || !user) return
      void createProject(project)
        .then((saved) => {
          setProjects((prev) => prev.map((p) => (p.id === project.id ? saved : p)))
          setSaveError(null)
        })
        .catch((err: unknown) => {
          setProjects((prev) => prev.filter((p) => p.id !== project.id))
          setSaveError(err instanceof Error ? err.message : "作成に失敗しました")
        })
    },
    [apiAvailable, user],
  )

  const removeProject = useCallback(
    async (id: string) => {
      const snapshot = projectsRef.current
      setProjects((prev) => prev.filter((p) => p.id !== id))
      const timer = persistTimers.current.get(id)
      if (timer) clearTimeout(timer)
      persistTimers.current.delete(id)
      persistQueue.current.delete(id)
      try {
        await deleteProjectApi(id)
        setSaveError(null)
      } catch (err) {
        setProjects(snapshot)
        setSaveError(err instanceof Error ? err.message : "削除に失敗しました")
      }
    },
    [],
  )

  /** サンプルデータの手動投入（自動シードは行わない） */
  const seedSamples = useCallback(async () => {
    setSeeding(true)
    try {
      const created: Project[] = []
      for (const sample of INITIAL_PROJECTS) {
        created.push(await createProject({ ...sample, id: `${sample.id}-${Date.now()}` }))
      }
      setProjects((prev) => [...created, ...prev])
      setSaveError(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "サンプル投入に失敗しました")
    } finally {
      setSeeding(false)
    }
  }, [])

  const login = useCallback(async (userId = "user-yamada") => {
    setLoginBusy(true)
    setLoginError(null)
    try {
      const me = await apiLogin(userId)
      setUser(me)
      const list = await fetchProjects()
      setProjects(list)
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "ログインに失敗しました")
    } finally {
      setLoginBusy(false)
    }
  }, [])

  const logout = useCallback(async () => {
    persistTimers.current.forEach((t) => clearTimeout(t))
    persistTimers.current.clear()
    try {
      await apiLogout()
    } catch {
      /* ignore */
    }
    setUser(null)
    setProjects([])
  }, [])

  const retrySave = useCallback(() => {
    const ids = [...persistQueue.current.keys()]
    if (ids.length === 0) {
      const first = projectsRef.current[0]
      if (first) void flushPersist(first.id)
      return
    }
    for (const id of ids) void flushPersist(id)
  }, [flushPersist])

  return {
    booting,
    apiAvailable,
    apiOffline,
    needsLogin: apiAvailable && !apiOffline && !user,
    user,
    projects,
    saveError,
    loginError,
    loginBusy,
    seeding,
    login,
    logout,
    updateProject,
    updateProjectLocal,
    addProject,
    removeProject,
    seedSamples,
    retrySave,
    retryConnection,
  }
}
