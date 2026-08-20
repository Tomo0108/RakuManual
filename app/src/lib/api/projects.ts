import type { Project } from "@/lib/types"
import { apiFetch } from "./client"
import type { AuthUser } from "./auth"

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

export async function deleteProjectApi(projectId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/projects/${projectId}`, { method: "DELETE" })
}

export async function updateProjectMeta(
  projectId: string,
  body: { description?: string; reviewDeadline?: string | null },
): Promise<Project> {
  return apiFetch<Project>(`/projects/${projectId}/meta`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

export async function transferProjectOwner(
  projectId: string,
  newOwnerId: string,
): Promise<Project> {
  return apiFetch<Project>(`/projects/${projectId}/transfer`, {
    method: "POST",
    body: JSON.stringify({ newOwnerId }),
  })
}

export async function fetchProjectMembers(
  projectId: string,
): Promise<Array<{ userId: string; permission: string }>> {
  const data = await apiFetch<{ members: Array<{ userId: string; permission: string }> }>(
    `/projects/${projectId}/members`,
  )
  return data.members
}

export async function addProjectMember(
  projectId: string,
  userId: string,
  permission: "view" | "edit" | "admin",
): Promise<Array<{ userId: string; permission: string }>> {
  const data = await apiFetch<{ members: Array<{ userId: string; permission: string }> }>(
    `/projects/${projectId}/members`,
    {
      method: "POST",
      body: JSON.stringify({ userId, permission }),
    },
  )
  return data.members
}

export async function upsertHearingAnswer(
  projectId: string,
  answer: { questionId: string; value: string; status: string },
): Promise<Project> {
  return apiFetch<Project>(`/projects/${projectId}/hearing/answers/${answer.questionId}`, {
    method: "PUT",
    body: JSON.stringify(answer),
  })
}

export async function fetchDirectoryUsers(): Promise<AuthUser[]> {
  try {
    const data = await apiFetch<{ users: AuthUser[] }>("/users")
    return data.users
  } catch {
    return [
      { id: "user-yamada", name: "山田 太郎", email: "yamada.taro@example.com", role: "creator" },
      { id: "user-sato", name: "佐藤 太郎", email: "sato.taro@example.com", role: "viewer" },
      { id: "user-admin", name: "管理 花子", email: "admin@example.com", role: "admin" },
    ]
  }
}
