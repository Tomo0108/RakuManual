import { getDb } from "./db.js"

export type NotificationType =
  | "review_deadline"
  | "qa_unanswered"
  | "llm_budget"
  | "csat"
  | "system"

export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  read: boolean
  createdAt: number
}

export function createNotification(input: {
  userId: string
  type: NotificationType
  title: string
  body: string
}) {
  // 同種の未読が直近1時間内にあれば重複作成しない
  const recent = getDb()
    .prepare(
      `SELECT id FROM notifications
       WHERE user_id = ? AND type = ? AND read = 0 AND created_at > ?
       LIMIT 1`,
    )
    .get(input.userId, input.type, Date.now() - 60 * 60 * 1000) as { id: string } | undefined
  if (recent) return

  getDb()
    .prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(
      crypto.randomUUID(),
      input.userId,
      input.type,
      input.title,
      input.body,
      Date.now(),
    )
}

export function listNotifications(userId: string, limit = 50): AppNotification[] {
  const rows = getDb()
    .prepare(
      `SELECT id, user_id AS userId, type, title, body, read, created_at AS createdAt
       FROM notifications WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId, limit) as Array<{
    id: string
    userId: string
    type: NotificationType
    title: string
    body: string
    read: number
    createdAt: number
  }>
  return rows.map((r) => ({ ...r, read: Boolean(r.read) }))
}

export function markNotificationRead(userId: string, id: string): boolean {
  const result = getDb()
    .prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`)
    .run(id, userId)
  return result.changes > 0
}

export function markAllNotificationsRead(userId: string) {
  getDb().prepare(`UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0`).run(userId)
}

export function getNotificationSettings(userId: string): {
  reviewDeadline: boolean
  qaUnanswered: boolean
  llmBudget: boolean
} {
  const row = getDb()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(`notify_prefs:${userId}`) as { value: string } | undefined
  if (!row) {
    return { reviewDeadline: true, qaUnanswered: true, llmBudget: true }
  }
  try {
    return JSON.parse(row.value) as {
      reviewDeadline: boolean
      qaUnanswered: boolean
      llmBudget: boolean
    }
  } catch {
    return { reviewDeadline: true, qaUnanswered: true, llmBudget: true }
  }
}

export function setNotificationSettings(
  userId: string,
  prefs: { reviewDeadline: boolean; qaUnanswered: boolean; llmBudget: boolean },
) {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(`notify_prefs:${userId}`, JSON.stringify(prefs))
}
