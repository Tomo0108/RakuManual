#!/usr/bin/env node
/**
 * Phase5 セキュリティ診断スクリプト（認可・隔離・ヘッダ）
 * Usage: node scripts/security-check.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://127.0.0.1:3001"

async function login(userId) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  })
  const cookie = res.headers.getSetCookie?.()?.[0] ?? res.headers.get("set-cookie")
  if (!res.ok || !cookie) throw new Error(`login failed for ${userId}`)
  return cookie.split(";")[0]
}

async function req(cookie, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status, body, headers: res.headers }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function main() {
  const results = []
  const check = async (name, fn) => {
    try {
      await fn()
      results.push({ name, ok: true })
      console.log(`PASS  ${name}`)
    } catch (e) {
      results.push({ name, ok: false, error: e.message })
      console.error(`FAIL  ${name}: ${e.message}`)
    }
  }

  await check("health", async () => {
    const res = await fetch(`${BASE}/api/health`)
    assert(res.ok, `status ${res.status}`)
    assert(res.headers.get("x-content-type-options") === "nosniff", "missing nosniff")
    assert(res.headers.get("x-frame-options") === "DENY", "missing frame deny")
  })

  await check("unauthenticated projects -> 401", async () => {
    const res = await fetch(`${BASE}/api/projects`)
    assert(res.status === 401, `expected 401 got ${res.status}`)
  })

  const yamada = await login("user-yamada")
  const sato = await login("user-sato")
  const admin = await login("user-admin")

  await check("viewer cannot create project", async () => {
    const r = await req(sato, "/api/projects", {
      method: "POST",
      body: JSON.stringify({ id: `P-SEC-${Date.now()}`, name: "hack" }),
    })
    assert(r.status === 403, `expected 403 got ${r.status}`)
  })

  await check("cross-user project isolation", async () => {
    const list = await req(yamada, "/api/projects")
    assert(list.status === 200, "yamada list failed")
    const pid = list.body[0]?.id
    assert(pid, "no project for yamada")
    const other = await req(sato, `/api/projects/${pid}`)
    assert(other.status === 404, `expected 404 got ${other.status}`)
  })

  await check("non-admin cannot list users", async () => {
    const r = await req(yamada, "/api/admin/users")
    assert(r.status === 403, `expected 403 got ${r.status}`)
  })

  await check("admin can list users", async () => {
    const r = await req(admin, "/api/admin/users")
    assert(r.status === 200, `expected 200 got ${r.status}`)
    assert(Array.isArray(r.body.users), "users missing")
  })

  await check("job ownership isolation", async () => {
    const list = await req(yamada, "/api/projects")
    const pid = list.body[0].id
    const gen = await req(yamada, `/api/projects/${pid}/ai/flow/generate`, { method: "POST", body: "{}" })
    assert(gen.status === 202 || gen.status === 429, `unexpected ${gen.status}`)
    if (gen.status === 202) {
      const steal = await req(sato, `/api/jobs/${gen.body.jobId}`)
      assert(steal.status === 404, `expected 404 got ${steal.status}`)
    }
  })

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
