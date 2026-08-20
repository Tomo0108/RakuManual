import { getDb } from "./db.js"
import { createNotification } from "./notifications.js"

const DEFAULT_BUDGET_YEN = 50_000
/** 概算: 1K tokens ≈ ¥0.3（デモ用） */
const YEN_PER_1K_TOKENS = 0.3

export function getLlmBudgetYen(): number {
  const row = getDb()
    .prepare(`SELECT value FROM app_settings WHERE key = 'llm_budget_yen'`)
    .get() as { value: string } | undefined
  if (!row) return DEFAULT_BUDGET_YEN
  const n = Number(row.value)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BUDGET_YEN
}

export function setLlmBudgetYen(yen: number) {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES ('llm_budget_yen', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(String(Math.round(yen)))
}

export function monthStartMs(now = Date.now()): number {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

export function getMonthlyLlmUsageYen(userId?: string): {
  tokens: number
  costYen: number
  budgetYen: number
  usagePercent: number
} {
  const since = monthStartMs()
  const budgetYen = getLlmBudgetYen()
  const row = userId
    ? (getDb()
        .prepare(
          `SELECT COALESCE(SUM(tokens), 0) AS tokens, COALESCE(SUM(cost_yen), 0) AS cost
           FROM llm_usage WHERE user_id = ? AND created_at >= ?`,
        )
        .get(userId, since) as { tokens: number; cost: number })
    : (getDb()
        .prepare(
          `SELECT COALESCE(SUM(tokens), 0) AS tokens, COALESCE(SUM(cost_yen), 0) AS cost
           FROM llm_usage WHERE created_at >= ?`,
        )
        .get(since) as { tokens: number; cost: number })

  const costYen = Math.round(row.cost)
  const usagePercent = budgetYen === 0 ? 0 : Math.round((costYen / budgetYen) * 100)
  return { tokens: row.tokens, costYen, budgetYen, usagePercent }
}

export function estimateCostYen(tokens: number): number {
  return Math.max(1, Math.round((tokens / 1000) * YEN_PER_1K_TOKENS * 100) / 100)
}

export function recordLlmUsage(input: {
  userId: string
  projectId?: string
  action: string
  tokens: number
}) {
  const costYen = estimateCostYen(input.tokens)
  getDb()
    .prepare(
      `INSERT INTO llm_usage (id, user_id, project_id, action, tokens, cost_yen, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      input.userId,
      input.projectId ?? null,
      input.action,
      input.tokens,
      costYen,
      Date.now(),
    )

  const usage = getMonthlyLlmUsageYen(input.userId)
  if (usage.usagePercent >= 100) {
    createNotification({
      userId: input.userId,
      type: "llm_budget",
      title: "LLMコスト上限に到達",
      body: "今月の予算を使い切りました。新規生成は一時制限されます（閲覧・編集は継続できます）。",
    })
  } else if (usage.usagePercent >= 80) {
    createNotification({
      userId: input.userId,
      type: "llm_budget",
      title: "LLMコストが予算の80%に到達",
      body: `今月の利用額は約 ¥${usage.costYen.toLocaleString()} / ¥${usage.budgetYen.toLocaleString()} です。`,
    })
  }

  return { ...usage, costYen }
}

/** 100% 到達時は新規生成を拒否。閲覧・編集は許可。 */
export function assertGenerationAllowed(userId: string): { ok: true } | { ok: false; error: string } {
  const usage = getMonthlyLlmUsageYen(userId)
  if (usage.usagePercent >= 100) {
    return {
      ok: false,
      error:
        "LLMコスト上限に到達したため、新規生成を一時制限しています。閲覧・編集・出力は継続できます。",
    }
  }
  return { ok: true }
}
