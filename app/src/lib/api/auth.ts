import { apiFetch } from "./client"

export type UserRole = "viewer" | "creator" | "admin"

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
}

export async function fetchMe(): Promise<AuthUser> {
  const data = await apiFetch<{ user: AuthUser }>("/auth/me")
  return data.user
}

export async function login(userId = "user-yamada"): Promise<AuthUser> {
  const data = await apiFetch<{ user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ userId }),
  })
  return data.user
}

export async function logout(): Promise<void> {
  await apiFetch("/auth/logout", { method: "POST" })
}
