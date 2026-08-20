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

/** OIDCモック: authorize で得た code をセッション化する */
export async function loginWithOidcCode(code: string): Promise<AuthUser> {
  const data = await apiFetch<{ user: AuthUser }>("/auth/oidc/callback", {
    method: "POST",
    body: JSON.stringify({ code }),
  })
  return data.user
}

export function oidcAuthorizeUrl(userId: string, redirectUri?: string): string {
  const url = new URL("/api/auth/oidc/authorize", window.location.origin)
  url.searchParams.set("userId", userId)
  url.searchParams.set(
    "redirect_uri",
    redirectUri ?? `${window.location.origin}/?sso=callback`,
  )
  return url.toString()
}

export async function logout(): Promise<void> {
  await apiFetch("/auth/logout", { method: "POST" })
}
