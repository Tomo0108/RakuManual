import { apiFetch } from "./client"
import type { Project } from "@/lib/types"

export async function publishProject(
  projectId: string,
): Promise<Project & { askCsat?: boolean }> {
  return apiFetch(`/projects/${projectId}/publish`, { method: "POST" })
}
