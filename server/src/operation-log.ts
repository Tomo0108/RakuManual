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
    .prepare(`SELECT COUNT(*) AS c FROM operation_logs WHERE user_id = ? AND created_at >= ?`)
    .get(userId, since) as { c: number }
  return row.c
}

export function listOperationLogs(opts?: {
  limit?: number
  userId?: string
  actionType?: OperationActionType
}): Array<{
  id: string
  userId: string
  projectId: string | null
  actionType: string
  payload: Record<string, unknown>
  createdAt: number
}> {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500)
  let rows: Array<{
    id: string
    user_id: string
    project_id: string | null
    action_type: string
    payload: string
    created_at: number
  }>
  if (opts?.userId && opts?.actionType) {
    rows = getDb()
      .prepare(
        `SELECT id, user_id, project_id, action_type, payload, created_at
         FROM operation_logs WHERE user_id = ? AND action_type = ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(opts.userId, opts.actionType, limit) as typeof rows
  } else if (opts?.userId) {
    rows = getDb()
      .prepare(
        `SELECT id, user_id, project_id, action_type, payload, created_at
         FROM operation_logs WHERE user_id = ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(opts.userId, limit) as typeof rows
  } else if (opts?.actionType) {
    rows = getDb()
      .prepare(
        `SELECT id, user_id, project_id, action_type, payload, created_at
         FROM operation_logs WHERE action_type = ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(opts.actionType, limit) as typeof rows
  } else {
    rows = getDb()
      .prepare(
        `SELECT id, user_id, project_id, action_type, payload, created_at
         FROM operation_logs ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as typeof rows
  }
  return rows.map((r) => {
    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(r.payload) as Record<string, unknown>
    } catch {
      payload = {}
    }
    return {
      id: r.id,
      userId: r.user_id,
      projectId: r.project_id,
      actionType: r.action_type,
      payload,
      createdAt: r.created_at,
    }
  })
}
