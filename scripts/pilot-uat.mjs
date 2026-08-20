#!/usr/bin/env node
/**
 * 5名パイロット相当のUATシミュレーション
 * Usage: node scripts/pilot-uat.mjs [baseUrl]
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const BASE = process.argv[2] ?? "http://127.0.0.1:3001"
const PILOTS = [
  { id: "user-yamada", name: "山田 太郎", role: "creator" },
  { id: "user-sato", name: "佐藤 太郎", role: "viewer" },
  { id: "user-admin", name: "管理 花子", role: "admin" },
  { id: "user-pilot1", name: "鈴木 一郎", role: "creator" },
  { id: "user-pilot2", name: "高橋 美咲", role: "creator" },
]

const results = []
function record(user, task, ok, detail = "") {
  results.push({ user, task, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"}  [${user}] ${task}${detail ? ` — ${detail}` : ""}`)
}

async function login(userId) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  })
  const cookie = res.headers.getSetCookie?.()?.[0] ?? res.headers.get("set-cookie")
  if (!res.ok || !cookie) throw new Error(`login ${userId}`)
  return cookie.split(";")[0]
}

async function api(cookie, p, init = {}) {
  const res = await fetch(`${BASE}${p}`, {
    ...init,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(init.headers ?? {}) },
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

async function main() {
  const cookies = {}
  for (const p of PILOTS) {
    cookies[p.id] = await login(p.id)
    const me = await api(cookies[p.id], "/api/auth/me")
    record(p.name, "ログイン", me.status === 200 && me.body.user?.id === p.id)
  }

  // 各作成者がプロジェクトを1つ作成
  for (const p of PILOTS.filter((x) => x.role === "creator")) {
    const id = `P-PILOT-${p.id}-${Date.now()}`
    const created = await api(cookies[p.id], "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        id,
        name: `${p.name}のパイロット業務`,
        owner: p.name,
        ownerId: p.id,
        updatedAt: new Date().toISOString().slice(0, 10),
        status: "hearing",
        description: "5名パイロットUAT",
        hearingAnswers: [],
        flow: { lanes: [], nodes: [], edges: [] },
        deepdive: [],
        sections: [],
        history: [],
      }),
    })
    record(p.name, "プロジェクト作成", created.status === 201, id)
    if (created.status === 201) {
      const ans = await api(cookies[p.id], `/api/projects/${id}/hearing/answers/q1`, {
        method: "PUT",
        body: JSON.stringify({ questionId: "q1", value: "経費精算", status: "answered" }),
      })
      record(p.name, "ヒアリング1問UPSERT", ans.status === 200)
      const flow = await api(cookies[p.id], `/api/projects/${id}/ai/flow/generate`, {
        method: "POST",
        body: "{}",
      })
      record(p.name, "フロー生成開始", flow.status === 202 || flow.status === 429, `status=${flow.status}`)
    }
  }

  // 閲覧者は作成不可、公開一覧/QAは利用可
  const viewerCreate = await api(cookies["user-sato"], "/api/projects", {
    method: "POST",
    body: JSON.stringify({ id: `P-BAD-${Date.now()}`, name: "x" }),
  })
  record("佐藤 太郎", "作成不可", viewerCreate.status === 403)
  const qa = await api(cookies["user-sato"], "/api/qa/ask", {
    method: "POST",
    body: JSON.stringify({ question: "経費" }),
  })
  record("佐藤 太郎", "QA利用", qa.status === 200)

  // 管理者はユーザー一覧
  const users = await api(cookies["user-admin"], "/api/admin/users")
  record(
    "管理 花子",
    "管理画面ユーザー一覧",
    users.status === 200 && (users.body.users?.length ?? 0) >= 5,
    `users=${users.body.users?.length}`,
  )

  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const out = path.join(__dirname, "..", "docs", "パイロットUAT結果.md")
  fs.writeFileSync(
    out,
    `# パイロットUAT結果（5名シミュレーション）

実行日時: ${new Date().toISOString()}
参加者: ${PILOTS.map((p) => p.name).join(" / ")}

## サマリ

- 合格: ${passed} / ${results.length}
- 判定: ${failed.length === 0 ? "**合格（自動シミュレーション）**" : "**不合格**"}
- F-3「修正が難しい」主観指標: 自動実行では NL 修正 API 応答で代替（\`npm run uat:run\` の F-3）

## 詳細

| 利用者 | タスク | 結果 | 詳細 |
| --- | --- | --- | --- |
${results.map((r) => `| ${r.user} | ${r.task} | ${r.ok ? "合格" : "不合格"} | ${r.detail || "—"} |`).join("\n")}
`,
    "utf8",
  )
  console.log(`\nWrote ${out}`)
  console.log(`${passed}/${results.length} passed`)
  if (failed.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
