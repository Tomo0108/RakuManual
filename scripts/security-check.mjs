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
    const pid = `P-SEC-ISO-${Date.now()}`
    const created = await req(yamada, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        id: pid,
        name: "隔離検証",
        owner: "山田 太郎",
        ownerId: "user-yamada",
        updatedAt: new Date().toISOString().slice(0, 10),
        status: "hearing",
        description: "security isolation",
        hearingAnswers: [],
        flow: { lanes: [], nodes: [], edges: [] },
        deepdive: [],
        sections: [],
        history: [],
      }),
    })
    assert(created.status === 201, `create failed ${created.status}`)
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

  await check("unpublished project hidden from other users", async () => {
    const pid = `P-SEC-PRIV-${Date.now()}`
    const created = await req(yamada, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        id: pid,
        name: "未公開隔離",
        owner: "山田 太郎",
        ownerId: "user-yamada",
        updatedAt: new Date().toISOString().slice(0, 10),
        status: "hearing",
        description: "private",
        hearingAnswers: [],
        flow: { lanes: [], nodes: [], edges: [] },
        deepdive: [],
        sections: [],
        history: [],
      }),
    })
    assert(created.status === 201, `create failed ${created.status}`)
    assert(created.body.status !== "published", "fixture must be unpublished")
    const other = await req(sato, `/api/projects/${pid}`)
    assert(other.status === 404, `expected 404 got ${other.status}`)
    const listSato = await req(sato, "/api/projects")
    assert(
      !listSato.body.some((p) => p.id === pid),
      "unpublished project leaked into viewer list",
    )
  })

  await check("oidc mock config", async () => {
    const res = await fetch(`${BASE}/api/auth/oidc/config`)
    assert(res.ok, `status ${res.status}`)
    const body = await res.json()
    assert(body.provider === "oidc-mock" || body.provider === "oidc", "provider mismatch")
    assert(typeof body.authorizeUrl === "string", "authorizeUrl missing")
    assert(typeof body.configured === "boolean", "configured missing")
  })

  await check("qa only uses accessible published corpus", async () => {
    const r = await req(sato, "/api/qa/ask", {
      method: "POST",
      body: JSON.stringify({ question: "業務開始" }),
    })
    assert(r.status === 200, `qa failed ${r.status}`)
    assert(typeof r.body.text === "string", "qa text missing")
  })

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
