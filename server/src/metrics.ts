import { getDb, listProjectsForUser } from "./db.js"

export interface DashboardMetrics {
  publishedCount: number
  projectCount: number
  qaQuestionCount: number
  qaUpCount: number
  qaDownCount: number
  completionRate: number
  llmCostYen: number
  llmBudgetYen: number
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
         SUM(CASE WHEN feedback = 'up' THEN 1 ELSE 0 END) AS up_count,
         SUM(CASE WHEN feedback = 'down' THEN 1 ELSE 0 END) AS down_count
       FROM qa_feedback WHERE user_id = ?`,
    )
    .get(userId, userId) as { total: number; up_count: number | null; down_count: number | null }

  return {
    publishedCount,
    projectCount,
    qaQuestionCount: qaStats?.total ?? 0,
    qaUpCount: qaStats?.up_count ?? 0,
    qaDownCount: qaStats?.down_count ?? 0,
    completionRate,
    llmCostYen: 31200,
    llmBudgetYen: 50000,
  }
}
