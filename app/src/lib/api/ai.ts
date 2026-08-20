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
