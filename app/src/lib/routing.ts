import { useCallback, useEffect, useRef, useState } from "react"
import type { ProjectTab, View } from "@/lib/types"

const PROJECT_TABS: ProjectTab[] = ["overview", "hearing", "flow", "deepdive", "manual", "export"]

function isProjectTab(value: string | undefined): value is ProjectTab {
  return !!value && (PROJECT_TABS as string[]).includes(value)
}

/** View を URL（pathname + search）へ変換する */
export function viewToUrl(view: View): string {
  switch (view.name) {
    case "projects":
      return "/projects"
    case "dashboard":
      return "/dashboard"
    case "qa":
      return "/qa"
    case "admin":
      return "/admin"
    case "project":
      return `/projects/${encodeURIComponent(view.projectId)}/${view.tab}`
    case "viewer": {
      const base = `/manuals/${encodeURIComponent(view.projectId)}`
      return view.sectionId ? `${base}?section=${encodeURIComponent(view.sectionId)}` : base
    }
  }
}

/** URL から View を復元する。未知のパスは一覧にフォールバックする */
export function urlToView(pathname: string, search = ""): View {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent)
  const [first, second, third] = segments

  switch (first) {
    case undefined:
    case "projects": {
      if (!second) return { name: "projects" }
      return {
        name: "project",
        projectId: second,
        tab: isProjectTab(third) ? third : "overview",
      }
    }
    case "manuals": {
      if (!second) return { name: "projects" }
      const sectionId = new URLSearchParams(search).get("section")
      return { name: "viewer", projectId: second, ...(sectionId ? { sectionId } : {}) }
    }
    case "qa":
      return { name: "qa" }
    case "dashboard":
      return { name: "dashboard" }
    case "admin":
      return { name: "admin" }
    default:
      return { name: "projects" }
  }
}

function currentView(): View {
  return urlToView(window.location.pathname, window.location.search)
}

/**
 * URL を単一の情報源とする view 状態。
 * setView は history を更新する薄いラッパなので、既存の呼び出し側はそのまま使える。
 */
export function useRoutedView(): [View, (next: View) => void] {
  const [view, setViewState] = useState<View>(currentView)
  const canonicalized = useRef(false)

  useEffect(() => {
    const onPopState = () => setViewState(currentView())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  // `/` や未知のパスで開かれた場合に URL を正規化する
  useEffect(() => {
    if (canonicalized.current) return
    canonicalized.current = true
    const url = viewToUrl(currentView())
    if (url !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", url)
    }
  }, [])

  const setView = useCallback((next: View) => {
    const url = viewToUrl(next)
    if (url !== window.location.pathname + window.location.search) {
      window.history.pushState(null, "", url)
    }
    setViewState(next)
  }, [])

  return [view, setView]
}
