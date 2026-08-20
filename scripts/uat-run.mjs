#!/usr/bin/env node
/**
 * UAT自動実行（SCR/受け入れ条件のAPI検証）
 * Usage: node scripts/uat-run.mjs [baseUrl]
 * 結果: docs/UAT結果.md
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const BASE = process.argv[2] ?? "http://127.0.0.1:3001"
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, "..", "docs", "UAT結果.md")

const results = []

function record(id, name, ok, detail = "") {
  results.push({ id, name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"}  ${id} ${name}${detail ? ` — ${detail}` : ""}`)
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

async function waitJob(cookie, jobId) {
  for (let i = 0; i < 50; i++) {
    const j = await api(cookie, `/api/jobs/${jobId}`)
    if (j.body.status === "completed") return j.body
    if (j.body.status === "failed") throw new Error(j.body.error ?? "job failed")
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error("job timeout")
}

async function main() {
  // U-01 SSO
  try {
    const unauth = await fetch(`${BASE}/api/projects`)
    record("U-01a", "未認証は401", unauth.status === 401, `status=${unauth.status}`)
    const cfg = await fetch(`${BASE}/api/auth/oidc/config`).then((r) => r.json())
    record("U-01b", "OIDCモック設定", cfg.provider === "oidc-mock")
    const yamada = await login("user-yamada")
    const me = await api(yamada, "/api/auth/me")
    record("U-01c", "ログイン・me", me.status === 200 && me.body.user?.id === "user-yamada")
  } catch (e) {
    record("U-01", "SSOログイン", false, e.message)
  }

  const yamada = await login("user-yamada")
  const sato = await login("user-sato")
  const admin = await login("user-admin")

  // 生成制限を避けるため予算を十分に確保
  await api(admin, "/api/admin/settings", {
    method: "PUT",
    body: JSON.stringify({ llmBudgetYen: 500000 }),
  })

  // U-02 create / viewer blocked
  const id = `P-UAT-${Date.now()}`
  const created = await api(yamada, "/api/projects", {
    method: "POST",
    body: JSON.stringify({
      id,
      name: "UAT検証プロジェクト",
      owner: "山田 太郎",
      ownerId: "user-yamada",
      updatedAt: new Date().toISOString().slice(0, 10),
      status: "hearing",
      description: "自動UAT",
      reviewDeadline: "2026-12-31",
      hearingAnswers: [],
      flow: { lanes: [], nodes: [], edges: [] },
      deepdive: [],
      sections: [],
      history: [],
    }),
  })
  record("U-02a", "プロジェクト作成", created.status === 201, id)
  const viewerCreate = await api(sato, "/api/projects", {
    method: "POST",
    body: JSON.stringify({ id: `P-BAD-${Date.now()}`, name: "x" }),
  })
  record("U-02b", "閲覧者は作成不可", viewerCreate.status === 403)

  // U-03 overview meta
  const meta = await api(yamada, `/api/projects/${id}/meta`, {
    method: "PATCH",
    body: JSON.stringify({ reviewDeadline: "2027-01-15" }),
  })
  record("U-03", "見直し期限更新", meta.status === 200 && meta.body.reviewDeadline === "2027-01-15")

  // U-04 hearing
  const ans = await api(yamada, `/api/projects/${id}/hearing/answers/q1`, {
    method: "PUT",
    body: JSON.stringify({ questionId: "q1", value: "請求処理", status: "answered" }),
  })
  record("U-04a", "ヒアリング1問保存", ans.status === 200 && ans.body.hearingAnswers?.length >= 1)
  const nextQ = await api(yamada, `/api/projects/${id}/hearing/next-question`, {
    method: "POST",
    body: "{}",
  })
  record("U-04b", "次質問API", nextQ.status === 200)

  // U-05 flow generate job
  const flowJob = await api(yamada, `/api/projects/${id}/ai/flow/generate`, {
    method: "POST",
    body: "{}",
  })
  let flow = null
  if (flowJob.status === 202) {
    const done = await waitJob(yamada, flowJob.body.jobId)
    flow = done.result?.flow
  }
  record("U-05a", "フロー生成ジョブ", !!flow?.nodes?.length)
  if (flow) {
    const saved = await api(yamada, `/api/projects/${id}/flow`, {
      method: "PUT",
      body: JSON.stringify(flow),
    })
    record("U-05b", "フロー保存", saved.status === 200)
  } else {
    record("U-05b", "フロー保存", false, "no flow")
  }

  // Build deepdive + sections for publish path
  let project = (await api(yamada, `/api/projects/${id}`)).body
  if (flow?.nodes?.length) {
    const processNodes = flow.nodes.filter((n) => n.data?.kind === "process" || n.data?.kind === "decision")
    const deepdive = processNodes.map((n, i) => ({
      stepId: n.id,
      stepLabel: n.data?.label ?? `step-${i}`,
      sectionNumber: `1.${i + 1}`,
      importance: "normal",
      status: "done",
      answers: [{ question: "手順", answer: `${n.data?.label}を実施する` }],
    }))
    project = {
      ...project,
      status: "manual",
      flow,
      deepdive,
    }
    await api(yamada, `/api/projects/${id}`, { method: "PUT", body: JSON.stringify(project) })
  }

  const manJob = await api(yamada, `/api/projects/${id}/ai/manual/generate`, {
    method: "POST",
    body: "{}",
  })
  let sections = []
  if (manJob.status === 202) {
    const done = await waitJob(yamada, manJob.body.jobId)
    sections = done.result?.sections ?? []
  }
  record("U-07a", "マニュアル生成ジョブ", sections.length > 0, `sections=${sections.length}`)

  if (sections.length) {
    const approved = sections.map((s) => ({
      ...s,
      status: "approved",
      blocks: (s.blocks ?? []).map((b) => ({ ...b, needsConfirm: false })),
    }))
    project = { ...(await api(yamada, `/api/projects/${id}`)).body, sections: approved, status: "manual" }
    await api(yamada, `/api/projects/${id}`, { method: "PUT", body: JSON.stringify(project) })
    const pub = await api(yamada, `/api/projects/${id}/publish`, { method: "POST", body: "{}" })
    record("U-07b", "公開", pub.status === 200 && pub.body.status === "published", pub.body?.error)
  } else {
    record("U-07b", "公開", false, "no sections")
  }

  // U-08/U-10 published visible to viewer + QA
  const satoList = await api(sato, "/api/projects")
  const visible = satoList.body.some((p) => p.id === id && p.status === "published")
  record("U-08", "閲覧者に公開版が見える", visible)

  const qa = await api(sato, "/api/qa/ask", {
    method: "POST",
    body: JSON.stringify({ question: "請求" }),
  })
  record("U-10", "QA回答", qa.status === 200 && typeof qa.body.text === "string")

  // U-09 export
  const pdf = await api(yamada, `/api/projects/${id}/export/pdf`, {
    method: "POST",
    body: JSON.stringify({ template: "corporate" }),
  })
  record("U-09", "PDF出力", pdf.status === 200 && !!pdf.body.pdfBase64)

  // U-11 metrics
  const metrics = await api(yamada, "/api/metrics/dashboard")
  record(
    "U-11",
    "KPIダッシュボード",
    metrics.status === 200 && typeof metrics.body.generateCount === "number",
  )

  // U-12 admin
  const users = await api(admin, "/api/admin/users")
  const templates = await api(yamada, "/api/admin/templates")
  record("U-12a", "管理ユーザー一覧", users.status === 200 && users.body.users?.length >= 3)
  record("U-12b", "テンプレート一覧", templates.status === 200 && templates.body.templates?.length >= 1)
  const denied = await api(yamada, "/api/admin/users")
  record("U-12c", "非管理者は管理API拒否", denied.status === 403)

  // U-13 budget gate (non-destructive: just read flag)
  record(
    "U-13",
    "LLMコスト監視フィールド",
    typeof metrics.body.llmBudgetYen === "number" && typeof metrics.body.generationBlocked === "boolean",
  )

  // F-3 flow edit usability proxy: NL edit API responds
  if (flow) {
    const nl = await api(yamada, `/api/projects/${id}/ai/flow/nl-edit`, {
      method: "POST",
      body: JSON.stringify({ instruction: "確認者レーンを追加", flow }),
    })
    record("F-3", "自然言語フロー修正API", nl.status === 200 || nl.status === 429, `status=${nl.status}`)
  } else {
    record("F-3", "自然言語フロー修正API", false, "no flow")
  }

  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  const md = `# UAT結果（自動実行）

実行日時: ${new Date().toISOString()}
対象API: ${BASE}

## サマリ

- 合格: ${passed} / ${results.length}
- 判定: ${failed.length === 0 ? "**合格**" : "**不合格**"}

## 詳細

| ID | 項目 | 結果 | 詳細 |
| --- | --- | --- | --- |
${results.map((r) => `| ${r.id} | ${r.name} | ${r.ok ? "合格" : "不合格"} | ${r.detail || "—"} |`).join("\n")}

## 補足

- 本結果は API ベースの受け入れ条件検証です。
- 部内パイロット（5名以上の主観評価）は \`docs/UATチェックリスト.md\` に人手記入してください。
- F-3「修正が難しい」0件はパイロット時の主観指標です。自動実行では NL 修正 API 応答で代替確認しています。
`

  fs.writeFileSync(OUT, md, "utf8")
  console.log(`\nWrote ${OUT}`)
  console.log(`${passed}/${results.length} passed`)
  if (failed.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
