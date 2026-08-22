const STEP_LIST_BACK_INTRO_KEY = "rakumanual.deepdive.stepListBackIntroSeen"

export function hasSeenDeepdiveStepListBackIntro(): boolean {
  try {
    return localStorage.getItem(STEP_LIST_BACK_INTRO_KEY) === "1"
  } catch {
    return false
  }
}

export function markDeepdiveStepListBackIntroSeen(): void {
  try {
    localStorage.setItem(STEP_LIST_BACK_INTRO_KEY, "1")
  } catch {
    /* ignore */
  }
}

export function resetDeepdiveHints(): void {
  try {
    localStorage.removeItem(STEP_LIST_BACK_INTRO_KEY)
  } catch {
    /* ignore */
  }
}
