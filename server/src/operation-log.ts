import { getDb } from "./db.js"

export type OperationActionType =
  | "hearing"
  | "edit"
  | "generate"
  | "approve"
  | "publish"
  | "export"
  | "qa"
  | "view"
  | "csat"
  | "admin"

export function recordOperationLog(input: {
  userId: string
  actionType: OperationActionType
  projectId?: string
  payload?: Record<string, unknown>
}) {
  getDb()
    .prepare(
      `INSERT INTO operation_logs (id, user_id, project_id, action_type, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      input.userId,
      input.projectId ?? null,
      input.actionType,
      JSON.stringify(input.payload ?? {}),
      Date.now(),
    )
}

export function countOperations(
  userId: string,
  actionType?: OperationActionType,
  sinceMs?: number,
): number {
  const since = sinceMs ?? 0
  if (actionType) {
    const row = getDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM operation_logs
         WHERE user_id = ? AND action_type = ? AND created_at >= ?`,
      )
      .get(userId, actionType, since) as { c: number }
    return row.c
  }
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM operation_logs WHERE user_id = ? AND created_at >= ?`,
    )
    .get(userId, since) as { c: number }
  return row.c
}
