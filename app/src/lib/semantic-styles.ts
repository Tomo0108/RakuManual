/** セマンティックステータス — CSS トークンに準拠した Tailwind クラス */

export const SEMANTIC = {
  success: "semantic-success border",
  warning: "semantic-warning border",
  info: "semantic-info border",
  danger: "semantic-danger border",
  muted: "bg-muted text-muted-foreground border-transparent",
} as const

/** マニュアル・深掘り等のレビュー系ステータス */
export const REVIEW_STATUS = {
  draft: SEMANTIC.muted,
  review: SEMANTIC.info,
  approved: SEMANTIC.success,
  "not-started": SEMANTIC.muted,
  "in-progress": SEMANTIC.info,
  done: SEMANTIC.success,
  recheck: SEMANTIC.warning,
} as const

/** 警告テキスト（本文内） */
export const WARNING_TEXT = "text-[var(--semantic-warning-fg)]"
export const SUCCESS_TEXT = "text-[var(--semantic-success-fg)]"
export const DANGER_TEXT = "text-[var(--semantic-danger-fg)]"

/** 警告ボックス（アラート・要確認ブロック） */
export const WARNING_BOX = "semantic-warning border rounded-lg"
export const WARNING_SUBTLE =
  "bg-[color-mix(in_oklch,var(--semantic-warning-bg)_75%,transparent)] ring-1 ring-[var(--semantic-warning-border)]"
export const SUCCESS_BOX = "semantic-success border rounded-lg"
