import { averageCsat, getDb, listProjectsForUser } from "./db.js"
import { getMonthlyLlmUsageYen } from "./llm-cost.js"
import { countOperations } from "./operation-log.js"

export interface DashboardMetrics {
  publishedCount: number
  projectCount: number
  qaQuestionCount: number
  qaUpCount: number
  qaDownCount: number
  completionRate: number
  llmCostYen: number
  llmBudgetYen: number
  llmUsagePercent: number
  generationBlocked: boolean
  csatAverage: number | null
  generateCount: number
  exportCount: number
  editCount: number
  publishCount: number
  llmProvider: "mock" | "openai"
  hearingStartCount: number
  hearingCompleteCount: number
  hearingDropoutRate: number
}

export function getDashboardMetrics(userId: string): DashboardMetrics {
  const projects = listProjectsForUser(userId)
  const publishedCount = projects.filter((p) => p.status === "published").length
  const projectCount = projects.length
  const completionRate =
    projectCount === 0 ? 0 : Math.round((publishedCount / projectCount) * 100)

  const db = getDb()
  const qaStats = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM qa_messages WHERE user_id = ?) AS total,
         COALESCE((SELECT SUM(CASE WHEN feedback = 'up' THEN 1 ELSE 0 END) FROM qa_feedback WHERE user_id = ?), 0) AS up_count,
         COALESCE((SELECT SUM(CASE WHEN feedback = 'down' THEN 1 ELSE 0 END) FROM qa_feedback WHERE user_id = ?), 0) AS down_count`,
    )
    .get(userId, userId, userId) as { total: number; up_count: number; down_count: number }

  const thirtyDays = Date.now() - 30 * 24 * 60 * 60 * 1000
  const usage = getMonthlyLlmUsageYen(userId)

  const hearingStarts = db
    .prepare(
      `SELECT COUNT(*) AS c FROM operation_logs
       WHERE user_id = ? AND action_type = 'hearing'
         AND json_extract(payload, '$.kind') = 'hearing_start'
         AND created_at >= ?`,
    )
    .get(userId, thirtyDays) as { c: number }
  const hearingCompletes = db
    .prepare(
      `SELECT COUNT(*) AS c FROM operation_logs
       WHERE user_id = ? AND action_type = 'hearing'
         AND json_extract(payload, '$.kind') = 'hearing_complete'
         AND created_at >= ?`,
    )
    .get(userId, thirtyDays) as { c: number }
  const startCount = hearingStarts?.c ?? 0
  const completeCount = hearingCompletes?.c ?? 0
  const hearingDropoutRate =
    startCount === 0 ? 0 : Math.round(((startCount - completeCount) / startCount) * 100)

  return {
    publishedCount,
    projectCount,
    qaQuestionCount: qaStats?.total ?? 0,
    qaUpCount: qaStats?.up_count ?? 0,
    qaDownCount: qaStats?.down_count ?? 0,
    completionRate,
    llmCostYen: usage.costYen,
    llmBudgetYen: usage.budgetYen,
    llmUsagePercent: usage.usagePercent,
    generationBlocked: usage.usagePercent >= 100,
    csatAverage: averageCsat(userId),
    generateCount: countOperations(userId, "generate", thirtyDays),
    exportCount: countOperations(userId, "export", thirtyDays),
    editCount: countOperations(userId, "edit", thirtyDays),
    publishCount: countOperations(userId, "publish", thirtyDays),
    llmProvider: process.env.OPENAI_API_KEY?.trim() ? "openai" : "mock",
    hearingStartCount: startCount,
    hearingCompleteCount: completeCount,
    hearingDropoutRate: Math.max(0, hearingDropoutRate),
  }
}
