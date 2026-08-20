import type { Project } from "@/lib/types"
import { apiFetch } from "./client"

export async function fetchProjects(): Promise<Project[]> {
  return apiFetch<Project[]>("/projects")
}

export async function fetchProject(id: string): Promise<Project> {
  return apiFetch<Project>(`/projects/${id}`)
}

export async function createProject(project: Project): Promise<Project> {
  return apiFetch<Project>("/projects", {
    method: "POST",
    body: JSON.stringify(project),
  })
}

export async function updateProjectApi(project: Project): Promise<Project> {
  return apiFetch<Project>(`/projects/${project.id}`, {
    method: "PUT",
    body: JSON.stringify(project),
  })
}
