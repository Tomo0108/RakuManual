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
  const body = init?.body
  const hasBody = body !== undefined && body !== null
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData
  // Fastify は Content-Type: application/json かつ空ボディを 400 にする（サーバ側でも吸収済み）
  const needsEmptyJsonBody =
    !hasBody && (method === "POST" || method === "PUT" || method === "PATCH")

  const headers = new Headers(init?.headers)
  if (!isFormData && (needsEmptyJsonBody || hasBody) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const res = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    body: needsEmptyJsonBody ? "{}" : body,
    headers,
  })

  if (!res.ok) {
    let message = res.statusText
    try {
      const errBody = (await res.json()) as { error?: string; message?: string }
      if (errBody.error) message = errBody.error
      else if (errBody.message) message = errBody.message
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
