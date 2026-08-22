import type { AccentId } from "@/lib/mock-data"
import {
  DEFAULT_ACCENT,
  applyAccentToDocument,
  saveAccent,
} from "@/lib/accent-storage"
import { updateNotificationSettings, type NotificationSettings } from "@/lib/api/admin"
import { resetLockHints } from "@/features/flow/flow-lock-hints"
import { resetDeepdiveHints } from "@/features/deepdive/deepdive-hints"

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  reviewDeadline: true,
  qaUnanswered: true,
  llmBudget: true,
}

export const TUTORIAL_RESET_EVENT = "rakumanual:tutorial-reset"

/** 操作案内・チュートリアルの表示状態をリセット */
export function resetTutorialHints(): void {
  resetLockHints()
  resetDeepdiveHints()
  window.dispatchEvent(new CustomEvent(TUTORIAL_RESET_EVENT))
}

/** 端末保存の見た目・通知設定を既定値に戻す（チュートリアルは対象外） */
export async function resetClientSettingsToDefault(): Promise<{
  accent: AccentId
  notify: NotificationSettings
}> {
  saveAccent(DEFAULT_ACCENT)
  applyAccentToDocument(DEFAULT_ACCENT)

  try {
    const notify = await updateNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS)
    return { accent: DEFAULT_ACCENT, notify }
  } catch {
    return { accent: DEFAULT_ACCENT, notify: DEFAULT_NOTIFICATION_SETTINGS }
  }
}
