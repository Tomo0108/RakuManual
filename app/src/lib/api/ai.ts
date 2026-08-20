import { apiFetch } from "./client"
import type { FlowState, ManualSection } from "@/lib/types"

export async function aiGenerateFlow(projectId: string): Promise<{ flow: FlowState }> {
  return apiFetch(`/projects/${projectId}/ai/flow/generate`, { method: "POST" })
}

export async function aiGenerateManualSections(
  projectId: string,
): Promise<{ sections: ManualSection[] }> {
  return apiFetch(`/projects/${projectId}/ai/manual/generate`, { method: "POST" })
}

