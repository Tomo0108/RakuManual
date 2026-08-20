import { apiFetch } from "./client"
import type { Project } from "@/lib/types"

export async function publishProject(projectId: string): Promise<Project> {
  return apiFetch(`/projects/${projectId}/publish`, { method: "POST" })
}
