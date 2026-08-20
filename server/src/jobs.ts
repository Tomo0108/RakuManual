import { getDb } from "./db.js"

export type JobStatus = "queued" | "running" | "completed" | "failed"

export interface JobRecord {
  id: string
  userId: string
  projectId: string | null
  type: string
  status: JobStatus
  progress: number
  result: unknown | null
  error: string | null
  createdAt: number
  updatedAt: number
}

type JobHandler = (job: JobRecord, update: (progress: number, message?: string) => void) => Promise<unknown>

const handlers = new Map<string, JobHandler>()
const running = new Set<string>()

export function registerJobHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler)
}

export function createJob(input: {
  userId: string
  projectId?: string
  type: string
  payload?: Record<string, unknown>
}): JobRecord {
  const id = `job-${crypto.randomUUID()}`
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO jobs (id, user_id, project_id, type, status, progress, payload, result, error, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 0, ?, NULL, NULL, ?, ?)`,
    )
    .run(
      id,
      input.userId,
      input.projectId ?? null,
      input.type,
      JSON.stringify(input.payload ?? {}),
      now,
      now,
    )
  queueMicrotask(() => void processNext())
  return getJob(id)!
}

export function getJob(id: string): JobRecord | null {
  const row = getDb()
    .prepare(
      `SELECT id, user_id AS userId, project_id AS projectId, type, status, progress,
              result, error, created_at AS createdAt, updated_at AS updatedAt
       FROM jobs WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string
        userId: string
        projectId: string | null
        type: string
        status: JobStatus
        progress: number
        result: string | null
        error: string | null
        createdAt: number
        updatedAt: number
      }
    | undefined
  if (!row) return null
  return {
    ...row,
    result: row.result ? (JSON.parse(row.result) as unknown) : null,
  }
}

function setJobState(
  id: string,
  patch: Partial<{ status: JobStatus; progress: number; result: unknown; error: string | null }>,
) {
  const current = getJob(id)
  if (!current) return
  getDb()
    .prepare(
      `UPDATE jobs SET status = ?, progress = ?, result = ?, error = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      patch.status ?? current.status,
      patch.progress ?? current.progress,
      patch.result !== undefined
        ? patch.result == null
          ? null
          : JSON.stringify(patch.result)
        : current.result == null
          ? null
          : JSON.stringify(current.result),
      patch.error !== undefined ? patch.error : current.error,
      Date.now(),
      id,
    )
}

async function processNext() {
  const row = getDb()
    .prepare(
      `SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`,
    )
    .get() as { id: string } | undefined
  if (!row || running.has(row.id)) return
  running.add(row.id)
  try {
    const job = getJob(row.id)
    if (!job) return
    const handler = handlers.get(job.type)
    if (!handler) {
      setJobState(job.id, { status: "failed", error: `Unknown job type: ${job.type}`, progress: 100 })
      return
    }
    setJobState(job.id, { status: "running", progress: 5 })
    const result = await handler(job, (progress) => {
      setJobState(job.id, { progress: Math.max(0, Math.min(99, progress)), status: "running" })
    })
    setJobState(job.id, { status: "completed", progress: 100, result, error: null })
  } catch (err) {
    setJobState(row.id, {
      status: "failed",
      progress: 100,
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    running.delete(row.id)
    queueMicrotask(() => void processNext())
  }
}

export function getJobPayload(jobId: string): Record<string, unknown> {
  const row = getDb().prepare(`SELECT payload FROM jobs WHERE id = ?`).get(jobId) as
    | { payload: string }
    | undefined
  if (!row?.payload) return {}
  try {
    return JSON.parse(row.payload) as Record<string, unknown>
  } catch {
    return {}
  }
}
