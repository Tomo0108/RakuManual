import { apiFetch } from "./client"
import type { Project, ProjectVisibility } from "@/lib/types"

export async function publishProject(
  projectId: string,
  visibility?: ProjectVisibility,
): Promise<Project & { askCsat?: boolean }> {
  return apiFetch(`/projects/${projectId}/publish`, {
    method: "POST",
    body: JSON.stringify(visibility ? { visibility } : {}),
  })
}
