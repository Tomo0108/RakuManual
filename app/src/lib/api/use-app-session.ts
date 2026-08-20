import { useCallback, useEffect, useRef, useState } from "react"
import type { Project } from "@/lib/types"
import { INITIAL_PROJECTS } from "@/lib/mock-data"
import { today } from "@/lib/project-utils"
import { ApiError } from "@/lib/api/client"
import { fetchMe, login as apiLogin, loginWithOidcCode, logout as apiLogout, type AuthUser } from "@/lib/api/auth"
import { createProject, fetchProjects, updateProjectApi } from "@/lib/api/projects"

const PERSIST_MS = 500

async function apiReachable(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { credentials: "include" })
    return res.ok
  } catch {
    return false
  }
}

async function loadOrSeedProjects(): Promise<Project[]> {
  const existing = await fetchProjects()
  if (existing.length > 0) return existing
  for (const p of INITIAL_PROJECTS) {
    await createProject(p)
  }
  return fetchProjects()
}

export function useAppSession() {
  const [booting, setBooting] = useState(true)
  const [apiAvailable, setApiAvailable] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginBusy, setLoginBusy] = useState(false)

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

      if (!reachable) {
        setProjects(INITIAL_PROJECTS)
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
          const list = await loadOrSeedProjects()
          if (cancelled) return
          setProjects(list)
        } else {
          const me = await fetchMe()
          if (cancelled) return
          setUser(me)
          const list = await loadOrSeedProjects()
          if (cancelled) return
          setProjects(list)
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setUser(null)
        } else {
          setProjects(INITIAL_PROJECTS)
          setApiAvailable(false)
        }
      } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => {
      cancelled = true
    }
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

  const login = useCallback(async (userId = "user-yamada") => {
    setLoginBusy(true)
    setLoginError(null)
    try {
      const me = await apiLogin(userId)
      setUser(me)
      const list = await loadOrSeedProjects()
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
    needsLogin: apiAvailable && !user,
    user,
    projects,
    saveError,
    loginError,
    loginBusy,
    login,
    logout,
    updateProject,
    addProject,
    retrySave,
  }
}
