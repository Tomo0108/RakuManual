import { apiFetch } from "./client"

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

export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  return apiFetch("/metrics/dashboard")
}
