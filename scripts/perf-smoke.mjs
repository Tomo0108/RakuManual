#!/usr/bin/env node
/**
 * 性能スモーク（要件 4-D の簡易確認）
 * Usage: node scripts/perf-smoke.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://127.0.0.1:3001"

async function login(userId) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  })
  const cookie = res.headers.getSetCookie?.()?.[0] ?? res.headers.get("set-cookie")
  return cookie.split(";")[0]
}

async function timed(label, fn, budgetMs) {
  const t0 = Date.now()
  const result = await fn()
  const ms = Date.now() - t0
  const ok = ms <= budgetMs
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${ms}ms (budget ${budgetMs}ms)`)
  return { ok, ms, result }
}

async function main() {
  const cookie = await login("user-yamada")
  const checks = []

  checks.push(
    await timed(
      "health",
      async () => {
        const r = await fetch(`${BASE}/api/health`)
        if (!r.ok) throw new Error("health failed")
      },
      500,
    ),
  )

  checks.push(
    await timed(
      "projects list",
      async () => {
        const r = await fetch(`${BASE}/api/projects`, { headers: { Cookie: cookie } })
        if (!r.ok) throw new Error("list failed")
        return r.json()
      },
      1000,
    ),
  )

  const projects = checks[1].result
  const pid = projects?.[0]?.id
  if (pid) {
    checks.push(
      await timed(
        "flow generate start",
        async () => {
          const r = await fetch(`${BASE}/api/projects/${pid}/ai/flow/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: cookie },
            body: "{}",
          })
          // 202 or 429 (budget) both acceptable for latency of accept
          if (r.status !== 202 && r.status !== 429) throw new Error(`status ${r.status}`)
          return r.json()
        },
        10000, // ストリーミング開始 10秒以内
      ),
    )
  }

  const failed = checks.filter((c) => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} within budget`)
  if (failed.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
