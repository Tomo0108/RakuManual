import { apiFetch, ApiError } from "./client"
import type { FlowState, ManualSection } from "@/lib/types"

export interface JobStatusResponse<T = unknown> {
  id: string
  type: string
  status: "queued" | "running" | "completed" | "failed"
  progress: number
  result: T | null
  error: string | null
}

async function waitForJob<T>(jobId: string, timeoutMs = 60_000): Promise<T> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const job = await apiFetch<JobStatusResponse<T>>(`/jobs/${jobId}`)
    if (job.status === "completed") {
      if (job.result == null) throw new ApiError("Job completed without result", 500)
      return job.result
    }
    if (job.status === "failed") {
      throw new ApiError(job.error ?? "Job failed", 500)
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new ApiError("Job timed out", 504)
}

export async function aiGenerateFlow(projectId: string): Promise<{ flow: FlowState }> {
  const { jobId } = await apiFetch<{ jobId: string }>(`/projects/${projectId}/ai/flow/generate`, {
    method: "POST",
  })
  return waitForJob<{ flow: FlowState }>(jobId)
}

export async function aiGenerateManualSections(
  projectId: string,
): Promise<{ sections: ManualSection[] }> {
  const { jobId } = await apiFetch<{ jobId: string }>(`/projects/${projectId}/ai/manual/generate`, {
    method: "POST",
  })
  return waitForJob<{ sections: ManualSection[] }>(jobId)
}

export async function aiProposeFlowNl(
  projectId: string,
  instruction: string,
  flow: FlowState,
): Promise<{ description: string; previewFlow: FlowState; appliedFlow: FlowState }> {
  return apiFetch(`/projects/${projectId}/ai/flow/nl-edit`, {
    method: "POST",
    body: JSON.stringify({ instruction, flow }),
  })
}

export async function aiRegenerateFlow(
  projectId: string,
  flow: FlowState,
): Promise<{ flow: FlowState }> {
  return apiFetch(`/projects/${projectId}/ai/flow/regenerate`, {
    method: "POST",
    body: JSON.stringify({ flow }),
  })
}

export async function aiRegenerateSection(
  projectId: string,
  sectionId: string,
): Promise<{ section: ManualSection }> {
  return apiFetch(`/projects/${projectId}/ai/sections/${sectionId}/regenerate`, {
    method: "POST",
  })
}

export async function fetchNextHearingQuestion(projectId: string): Promise<{
  question: { id: string; text: string; type: string } | null
  done: boolean
  contradictionHint: string | null
}> {
  return apiFetch(`/projects/${projectId}/hearing/next-question`, { method: "POST" })
}

export async function fetchDeepdiveQuestions(
  projectId: string,
  stepId: string,
): Promise<{ questions: string[] }> {
  return apiFetch(`/projects/${projectId}/deepdive/${stepId}/questions`, { method: "POST" })
}
