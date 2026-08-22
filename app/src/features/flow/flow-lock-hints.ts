const INTRO_KEY = "rakumanual.flow.lockIntroSeen"
const CANVAS_HINT_KEY = "rakumanual.flow.lockCanvasHintCount"
const MAX_CANVAS_HINTS = 2

export function hasSeenLockIntro(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === "1"
  } catch {
    return false
  }
}

export function markLockIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_KEY, "1")
  } catch {
    /* ignore */
  }
}

export function getLockCanvasHintCount(): number {
  try {
    const raw = localStorage.getItem(CANVAS_HINT_KEY)
    const n = raw ? Number.parseInt(raw, 10) : 0
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

export function incrementLockCanvasHintCount(): number {
  const next = Math.min(getLockCanvasHintCount() + 1, MAX_CANVAS_HINTS)
  try {
    localStorage.setItem(CANVAS_HINT_KEY, String(next))
  } catch {
    /* ignore */
  }
  return next
}

export function canShowLockCanvasHint(): boolean {
  return getLockCanvasHintCount() < MAX_CANVAS_HINTS
}

/** フロー図ロック案内などのチュートリアル状態を初期化 */
export function resetLockHints(): void {
  try {
    localStorage.removeItem(INTRO_KEY)
    localStorage.removeItem(CANVAS_HINT_KEY)
  } catch {
    /* ignore */
  }
}
