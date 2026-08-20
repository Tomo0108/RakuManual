#!/usr/bin/env node
/**
 * E2E スモークテスト（API経由）
 * Usage: node scripts/e2e-smoke.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://127.0.0.1:3001"

async function login(userId) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  })
  const cookie = res.headers.getSetCookie?.()?.[0] ?? res.headers.get("set-cookie")
  if (!res.ok || !cookie) throw new Error(`login failed: ${userId}`)
  return cookie.split(";")[0]
}

async function api(cookie, path, init = {}) {
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
  return { status: res.status, body }
}

async function waitJob(cookie, jobId) {
  for (let i = 0; i < 40; i++) {
    const j = await api(cookie, `/api/jobs/${jobId}`)
    if (j.body.status === "completed") return j.body
    if (j.body.status === "failed") throw new Error(j.body.error ?? "job failed")
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error("job timeout")
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function main() {
  const yamada = await login("user-yamada")
  const sato = await login("user-sato")

  const list = await api(yamada, "/api/projects")
  assert(list.status === 200 && Array.isArray(list.body), "projects list")
  let project = list.body[0]
  if (!project) {
    const id = `P-E2E-${Date.now()}`
    const created = await api(yamada, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        id,
        name: "E2Eテスト",
        owner: "山田 太郎",
        updatedAt: new Date().toISOString().slice(0, 10),
        status: "hearing",
        description: "smoke",
        hearingAnswers: [],
        flow: { lanes: [], nodes: [], edges: [] },
        deepdive: [],
        sections: [],
        history: [],
      }),
    })
    assert(created.status === 201, "create project")
    project = created.body
  }

  const hearing = await api(yamada, `/api/projects/${project.id}/hearing/next-question`, {
    method: "POST",
    body: "{}",
  })
  assert(hearing.status === 200, "hearing next-question")

  const flowJob = await api(yamada, `/api/projects/${project.id}/ai/flow/generate`, {
    method: "POST",
    body: "{}",
  })
  assert(flowJob.status === 202, "flow generate accepted")
  const flowDone = await waitJob(yamada, flowJob.body.jobId)
  assert(flowDone.result?.flow?.nodes?.length > 0, "flow result")

  const metrics = await api(yamada, "/api/metrics/dashboard")
  assert(metrics.status === 200 && metrics.body.generateCount >= 1, "metrics")

  const otherList = await api(sato, "/api/projects")
  const canSeePublished = otherList.body.some(
    (p) => p.id === project.id && p.status === "published",
  )
  // 未公開なら見えないのが正しい
  if (project.status !== "published") {
    assert(!canSeePublished, "unpublished must not leak to other users")
  }

  console.log("E2E smoke passed")
}

main().catch((e) => {
  console.error("E2E smoke failed:", e.message)
  process.exit(1)
})
