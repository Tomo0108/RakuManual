import { apiFetch } from "./client"
import type { UserRole } from "./auth"

export interface AppNotification {
  id: string
  userId: string
  type: string
  title: string
  body: string
  read: boolean
  createdAt: number
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const data = await apiFetch<{ items: AppNotification[] }>("/notifications")
  return data.items
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/notifications/${id}/read`, { method: "POST" })
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/notifications/read-all", { method: "POST" })
}

export interface NotificationSettings {
  reviewDeadline: boolean
  qaUnanswered: boolean
  llmBudget: boolean
}

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  return apiFetch("/notifications/settings")
}

export async function updateNotificationSettings(
  prefs: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  return apiFetch("/notifications/settings", {
    method: "PUT",
    body: JSON.stringify(prefs),
  })
}

export interface DesignTemplate {
  id: string
  name: string
  theme: string
  description: string
  color: string
  updatedAt: number
}

export interface AdminUser {
  id: string
  name: string
  email: string
  role: UserRole
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const data = await apiFetch<{ users: AdminUser[] }>("/admin/users")
  return data.users
}

export async function updateAdminUserRole(id: string, role: UserRole): Promise<AdminUser> {
  const data = await apiFetch<{ user: AdminUser }>(`/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  })
  return data.user
}

export async function fetchTemplates(): Promise<DesignTemplate[]> {
  const data = await apiFetch<{ templates: DesignTemplate[] }>("/admin/templates")
  return data.templates
}

export async function upsertTemplate(
  id: string,
  body: { name: string; theme: string; description?: string; color?: string },
): Promise<DesignTemplate> {
  const data = await apiFetch<{ template: DesignTemplate }>(`/admin/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
  return data.template
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiFetch(`/admin/templates/${id}`, { method: "DELETE" })
}

export async function fetchAdminSettings(): Promise<{
  llmBudgetYen: number
  llmProvider: string
}> {
  return apiFetch("/admin/settings")
}

export async function updateAdminSettings(body: {
  llmBudgetYen: number
}): Promise<{ llmBudgetYen: number; llmProvider: string }> {
  return apiFetch("/admin/settings", {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export async function submitCsat(input: {
  score: number
  source?: string
  projectId?: string
  comment?: string
}): Promise<{ ok: boolean; average: number | null }> {
  return apiFetch("/metrics/csat", {
    method: "POST",
    body: JSON.stringify(input),
  })
}
