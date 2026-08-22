import { apiUrl } from "./base"

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase()
  const hasBody = init?.body !== undefined && init?.body !== null
  // Fastify は Content-Type: application/json かつ空ボディを 400 にする
  const needsEmptyJsonBody =
    !hasBody && (method === "POST" || method === "PUT" || method === "PATCH")

  const res = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    body: needsEmptyJsonBody ? "{}" : init?.body,
    headers: {
      ...(needsEmptyJsonBody || hasBody ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  })

  if (!res.ok) {
    let message = res.statusText
    try {
      const body = (await res.json()) as { error?: string; message?: string }
      if (body.error) message = body.error
      else if (body.message) message = body.message
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function apiUpload(
  path: string,
  file: File,
): Promise<{ storageKey: string; url: string; mimeType: string; name: string }> {
  const form = new FormData()
  form.append("file", file)
  const res = await fetch(apiUrl(path), {
    method: "POST",
    body: form,
    credentials: "include",
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      /* ignore */
    }
    throw new ApiError(message || "画像のアップロードに失敗しました", res.status)
  }
  return res.json()
}
