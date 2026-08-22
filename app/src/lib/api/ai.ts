import { apiFetch, ApiError } from "./client"
import { apiUrl } from "./base"
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

    const es = new EventSource(apiUrl(`/jobs/${jobId}/stream`), { withCredentials: true })
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

export async function aiApplyManualRegen(
  projectId: string,
  choices: Record<string, string>,
): Promise<{ sections: ManualSection[]; meta?: { provider?: string; tokens?: number } }> {
  return apiFetch(`/projects/${projectId}/ai/manual/regenerate-batch`, {
    method: "POST",
    body: JSON.stringify({ choices }),
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

export type StreamTokenHandler = (delta: string, fullText: string) => void

/** LLM トークンストリーミング（SSE）。失敗時は null */
export async function streamAiCompletion(
  projectId: string,
  prompt: string,
  onToken: StreamTokenHandler,
  opts?: { system?: string; action?: string; signal?: AbortSignal },
): Promise<{ text: string; tokens: number; provider: string; ms: number } | null> {
  const res = await fetch(apiUrl(`/projects/${projectId}/ai/complete/stream`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      system: opts?.system,
      action: opts?.action ?? "llm_stream",
    }),
    signal: opts?.signal,
  })
  if (!res.ok || !res.body) return null

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let text = ""
  let donePayload: { text: string; tokens: number; provider: string; ms: number } | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split("\n\n")
    buffer = parts.pop() ?? ""
    for (const part of parts) {
      const lines = part.split("\n")
      let event = "message"
      let data = ""
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim()
        if (line.startsWith("data:")) data += line.slice(5).trim()
      }
      if (!data) continue
      try {
        const json = JSON.parse(data) as Record<string, unknown>
        if (event === "token" && typeof json.delta === "string") {
          text += json.delta
          onToken(json.delta, text)
        } else if (event === "done") {
          donePayload = {
            text: String(json.text ?? text),
            tokens: Number(json.tokens ?? 0),
            provider: String(json.provider ?? "mock"),
            ms: Number(json.ms ?? 0),
          }
        } else if (event === "error") {
          return null
        }
      } catch {
        /* ignore */
      }
    }
  }
  return donePayload
}
