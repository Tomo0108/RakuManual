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

/** 同時実行の上限（OpenRouter 429 予防） */
const MAX_PARALLEL = 2
/** 1ジョブの最大実行時間 */
const JOB_TIMEOUT_MS = 3 * 60 * 1000

export function registerJobHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler)
}

/** 起動時: running のまま残ったジョブを failed に戻す */
export function recoverStaleJobs() {
  const now = Date.now()
  const result = getDb()
    .prepare(
      `UPDATE jobs SET status = 'failed', error = ?, progress = 100, updated_at = ?
       WHERE status = 'running'`,
    )
    .run("サーバー再起動により中断されました。再実行してください。", now)
  if (result.changes > 0) {
    console.warn(`[jobs] recovered ${result.changes} stale running job(s)`)
  }
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/** queued → running を原子的に取得（競合時は null） */
function claimNextQueuedJob(): string | null {
  const row = getDb()
    .prepare(`SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`)
    .get() as { id: string } | undefined
  if (!row) return null
  const claimed = getDb()
    .prepare(
      `UPDATE jobs SET status = 'running', progress = 5, updated_at = ? WHERE id = ? AND status = 'queued'`,
    )
    .run(Date.now(), row.id)
  if (claimed.changes === 0) return null
  return row.id
}

async function executeClaimedJob(jobId: string) {
  running.add(jobId)
  try {
    const job = getJob(jobId)
    if (!job) return
    const handler = handlers.get(job.type)
    if (!handler) {
      setJobState(job.id, { status: "failed", error: `Unknown job type: ${job.type}`, progress: 100 })
      return
    }
    const result = await withTimeout(
      handler(job, (progress) => {
        setJobState(job.id, { progress: Math.max(0, Math.min(99, progress)), status: "running" })
      }),
      JOB_TIMEOUT_MS,
      `Job ${job.type}`,
    )
    setJobState(job.id, { status: "completed", progress: 100, result, error: null })
  } catch (err) {
    setJobState(jobId, {
      status: "failed",
      progress: 100,
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    running.delete(jobId)
    queueMicrotask(() => void processNext())
  }
}

async function processNext() {
  while (running.size < MAX_PARALLEL) {
    const jobId = claimNextQueuedJob()
    if (!jobId) return
    void executeClaimedJob(jobId)
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
