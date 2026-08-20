import { apiFetch, ApiError } from "./client"
import type { FlowState, HearingQuestion, ManualSection } from "@/lib/types"

export interface JobStatusResponse<T = unknown> {
  id: string
  type: string
  status: "queued" | "running" | "completed" | "failed"
  progress: number
  result: T | null
  error: string | null
}

export type JobProgressHandler = (progress: number, status: string) => void

async function waitForJob<T>(
  jobId: string,
  onProgress?: JobProgressHandler,
  timeoutMs = 60_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    let settled = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }

    const poll = async () => {
      try {
        const job = await apiFetch<JobStatusResponse<T>>(`/jobs/${jobId}`)
        onProgress?.(job.progress, job.status)
        if (job.status === "completed") {
          const result = job.result
          if (result == null) finish(() => reject(new ApiError("Job completed without result", 500)))
          else finish(() => resolve(result))
          return
        }
        if (job.status === "failed") {
          finish(() => reject(new ApiError(job.error ?? "Job failed", 500)))
          return
        }
        if (Date.now() - started > timeoutMs) {
          finish(() => reject(new ApiError("Job timed out", 504)))
          return
        }
        setTimeout(() => void poll(), 300)
      } catch (e) {
        finish(() => reject(e))
      }
    }

    const es = new EventSource(`/api/jobs/${jobId}/stream`, { withCredentials: true })
    es.addEventListener("progress", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as JobStatusResponse<T>
        onProgress?.(data.progress, data.status)
        if (data.status === "completed") {
          es.close()
          const result = data.result
          if (result == null) finish(() => reject(new ApiError("Job completed without result", 500)))
          else finish(() => resolve(result))
        } else if (data.status === "failed") {
          es.close()
          finish(() => reject(new ApiError(data.error ?? "Job failed", 500)))
        }
      } catch {
        /* ignore malformed event */
      }
    })
    es.onerror = () => {
      es.close()
      void poll()
    }

    setTimeout(() => {
      if (!settled) {
        es.close()
        void poll()
      }
    }, 2000)
  })
}

export async function aiGenerateFlow(
  projectId: string,
  onProgress?: JobProgressHandler,
): Promise<{ flow: FlowState }> {
  const { jobId } = await apiFetch<{ jobId: string }>(`/projects/${projectId}/ai/flow/generate`, {
    method: "POST",
  })
  return waitForJob<{ flow: FlowState }>(jobId, onProgress)
}

export async function aiGenerateManualSections(
  projectId: string,
  onProgress?: JobProgressHandler,
): Promise<{ sections: ManualSection[] }> {
  const { jobId } = await apiFetch<{ jobId: string }>(`/projects/${projectId}/ai/manual/generate`, {
    method: "POST",
  })
  return waitForJob<{ sections: ManualSection[] }>(jobId, onProgress)
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
  question: HearingQuestion | null
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
