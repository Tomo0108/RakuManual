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

export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  return apiFetch("/metrics/dashboard")
}
