import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import {
  averageCsat,
  createSession,
  deleteDesignTemplate,
  deleteProject,
  deleteSession,
  getAccessibleProject,
  getProjectForUser,
  getProjectUpdatedAt,
  getSessionUser,
  getUserById,
  insertCsat,
  insertProject,
  insertQaFeedback,
  insertQaMessage,
  listAccessibleProjects,
  listDesignTemplates,
  listProjectMembers,
  listProjectsForUser,
  listUsers,
  transferProjectOwnership,
  updateProject as dbUpdateProject,
  updateUserRole,
  updateUserProfile,
  upsertDesignTemplate,
  upsertProjectMember,
} from "./db.js"
import { buildManualHtml } from "./export/manual-html.js"
import { buildManualPdf } from "./export/manual-pdf.js"
import { getDashboardMetrics } from "./metrics.js"
import { applyPublish, validatePublish } from "./publish.js"
import { answerQuestion } from "./qa.js"
import { proposeNlEdit, mergeFlowPreservingManual } from "./ai/flow.js"
import { regenerateSectionMock } from "./ai/manual.js"
import { generateDeepdiveQuestions, nextHearingQuestion } from "./ai/hearing.js"
import { extractJson, generateFlowFromLlm, regenerateSectionFromLlm } from "./ai/structured.js"
import {
  enqueueFlowGenerate,
  enqueueManualGenerate,
  enqueuePdfExport,
} from "./ai/jobs-handlers.js"
import { assertGenerationAllowed, getLlmBudgetYen, recordLlmUsage, setLlmBudgetYen } from "./llm-cost.js"
import { getLlmAdapter, getLlmProviderName, getLlmRuntimeInfo } from "./llm/adapter.js"
import { getJob } from "./jobs.js"
import {
  getNotificationSettings,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  setNotificationSettings,
  createNotification,
} from "./notifications.js"
import { listOperationLogs, recordOperationLog } from "./operation-log.js"
import { getExportArtifact, storeExportArtifact } from "./export/artifacts.js"
import type { AuthUser, HearingAnswer, Project, UserRole } from "./types.js"

const SESSION_COOKIE = "rakumanual_session"

/** クロスオリジン（Vercel ↔ 別ホスト API）時は SameSite=None; Secure が必要 */
function sessionCookieOptions() {
  const crossSite = process.env.COOKIE_SAMESITE === "none" || process.env.COOKIE_SECURE === "true"
  return {
    path: "/",
    httpOnly: true,
    sameSite: (crossSite ? "none" : "lax") as "none" | "lax",
    secure: crossSite || process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60,
  }
}

function getToken(request: FastifyRequest): string | undefined {
  return request.cookies[SESSION_COOKIE]
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  const token = getToken(request)
  if (!token) {
    reply.status(401).send({ error: "Unauthorized" })
    return null
  }
  const user = getSessionUser(token)
  if (!user) {
    reply.status(401).send({ error: "Session expired" })
    return null
  }
  return user
}

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  const user = await requireAuth(request, reply)
  if (!user) return null
  if (user.role !== "admin") {
    reply.status(403).send({ error: "Admin only" })
    return null
  }
  return user
}

function canEditProjects(user: AuthUser): boolean {
  return user.role === "creator" || user.role === "admin"
}

function todayStamp(): string {
  // 楽観ロック用。日付のみだと同日内の同時編集を検出できない
  return new Date().toISOString()
}

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function appendHistory(project: Project, user: AuthUser, action: string): Project {
  return {
    ...project,
    updatedAt: todayStamp(),
    history: [
      { id: `h-${Date.now()}`, date: nowStamp(), user: user.name, action },
      ...(project.history ?? []),
    ].slice(0, 200),
  }
}

function uid(prefix: string): string {
  // Fastify/Node 側では既存の ui 用 uid() の互換が不要なためランダムで生成する
  return `${prefix}-${crypto.randomUUID()}`
}

/**
 * Phase2: LLM連携の前段として、現行UIのモック生成と同等の形で返す
 * (後で「実LLM呼び出し」へ置き換え可能にする)
 */
function generateFlowMock(projectName: string) {
  const lanes = ["担当者", "確認者"]
  const n0 = uid("n")
  const n1 = uid("n")
  const n2 = uid("n")
  const n3 = uid("n")
  const n4 = uid("n")

  const nodes = [
    {
      id: n0,
      type: "step",
      position: { x: 0, y: 0 },
      data: { label: "業務開始(トリガー受領)", lane: "担当者", kind: "start", system: "—", source: "q4: 開始条件" },
    },
    {
      id: n1,
      type: "step",
      position: { x: 0, y: 0 },
      data: { label: `${projectName}の準備作業`, lane: "担当者", kind: "process", system: "業務システム", source: "q8: 手順1" },
    },
    {
      id: n2,
      type: "step",
      position: { x: 0, y: 0 },
      data: { label: "メインの作業を実施", lane: "担当者", kind: "process", system: "業務システム", source: "q8: 手順2" },
    },
    {
      id: n3,
      type: "step",
      position: { x: 0, y: 0 },
      data: { label: "内容に問題ない?", lane: "確認者", kind: "decision", source: "q9: 分岐" },
    },
    {
      id: n4,
      type: "step",
      position: { x: 0, y: 0 },
      data: { label: "完了処理・記録", lane: "確認者", kind: "end", system: "業務システム", source: "q7: 完了条件" },
    },
  ]

  const edges = [
    { id: uid("e"), source: n0, target: n1 },
    { id: uid("e"), source: n1, target: n2 },
    { id: uid("e"), source: n2, target: n3 },
    { id: uid("e"), source: n3, target: n4, label: "はい" },
    { id: uid("e"), source: n3, target: n1, label: "いいえ(やり直し)" },
  ]

  return { lanes, nodes, edges }
}

function generateManualSectionsMock(existing: Project) {
  const flow = existing.flow as any
  const flowNodes: any[] = Array.isArray(flow?.nodes) ? flow.nodes : []
  const nodeMap = new Map(flowNodes.map((n) => [n.id, n]))

  const businessName = existing.hearingAnswers.find((a) => a.questionId === "q1" && String(a.value ?? "").trim())?.value?.trim() ?? existing.name

  const today = todayStamp()

  const sections = (existing.deepdive as any[]).map((d) => {
    const stepId: string = d.stepId
    const node = nodeMap.get(stepId)

    const sectionNumber: string | undefined =
      d.sectionNumber ?? (node?.data?.sectionNumber ? String(node.data.sectionNumber) : undefined)

    const majorNum = sectionNumber?.split(".")?.[0]
    return {
      id: uid("s"),
      title: d.stepLabel,
      sectionNumber,
      majorTitle: d.majorTitle ?? (majorNum === "1" ? businessName : undefined),
      mediumTitle: d.mediumTitle,
      stepId: d.stepId,
      status: "draft" as const,
      version: 1,
      updatedAt: today,
      syncStatus: "ok" as const,
      sourceSnapshot: {
        label: d.stepLabel,
        kind: node?.data?.kind,
        sectionNumber,
      },
      blocks:
        d.status === "done" || (Array.isArray(d.answers) && d.answers.length > 0)
          ? (d.answers as any[]).map((qa, j) => ({
              id: uid("b"),
              type: (j === 0 ? "paragraph" : "step") as "paragraph" | "step",
              text: qa.answer,
              needsConfirm: j === d.answers.length - 1 && d.status !== "done",
            }))
          : [
              {
                id: uid("b"),
                type: "paragraph" as const,
                text: `項番 ${sectionNumber ?? "—"} のセクションです。深掘りヒアリングが未完了のため、プレースホルダ表示です。`,
              },
            ],
    }
  })

  return sections
}

function loadOwned(
  projectId: string,
  user: AuthUser,
  reply: FastifyReply,
): Project | null {
  const project = getProjectForUser(projectId, user.id)
  if (!project) {
    reply.status(404).send({ error: "Project not found" })
    return null
  }
  return project
}

function loadEditable(
  projectId: string,
  user: AuthUser,
  reply: FastifyReply,
): { project: Project; ownerId: string } | null {
  const owned = getProjectForUser(projectId, user.id)
  if (owned) {
    return { project: owned, ownerId: user.id }
  }
  const found = getAccessibleProject(projectId, user.id)
  if (!found) {
    reply.status(404).send({ error: "Project not found" })
    return null
  }
  if (found.access === "member") {
    const members = listProjectMembers(projectId)
    const me = members.find((m) => m.userId === user.id)
    if (me && (me.permission === "edit" || me.permission === "admin")) {
      const ownerId = found.project.ownerId
      if (!ownerId) {
        reply.status(403).send({ error: "Owner missing" })
        return null
      }
      return { project: found.project, ownerId }
    }
  }
  reply.status(403).send({ error: "Edit permission required" })
  return null
}

function saveOwned(user: AuthUser, project: Project, reply: FastifyReply): Project | null {
  const ok = dbUpdateProject(user.id, project)
  if (!ok) {
    reply.status(404).send({ error: "Project not found" })
    return null
  }
  return project
}

function saveForOwner(ownerId: string, project: Project, reply: FastifyReply): Project | null {
  const ok = dbUpdateProject(ownerId, project)
  if (!ok) {
    reply.status(404).send({ error: "Project not found" })
    return null
  }
  return project
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/api/auth/me", async (request, reply) => {
    const token = getToken(request)
    if (!token) return reply.status(401).send({ error: "Unauthorized" })
    const user = getSessionUser(token)
    if (!user) return reply.status(401).send({ error: "Session expired" })
    return { user }
  })

  app.patch("/api/auth/me", async (request, reply) => {
    const sessionUser = await requireAuth(request, reply)
    if (!sessionUser) return
    const body = (request.body ?? {}) as { name?: string; avatarUrl?: string | null }
    if (body.name !== undefined && !String(body.name).trim()) {
      return reply.status(400).send({ error: "表示名を入力してください" })
    }
    if (body.avatarUrl != null && typeof body.avatarUrl === "string" && body.avatarUrl.length > 900_000) {
      return reply.status(400).send({ error: "アイコン画像が大きすぎます" })
    }
    const updated = updateUserProfile(sessionUser.id, {
      name: body.name,
      avatarUrl: body.avatarUrl,
    })
    if (!updated) return reply.status(404).send({ error: "User not found" })
    return { user: updated }
  })

  app.get("/api/users", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    return { users: listUsers() }
  })

  app.post("/api/auth/login", async (request, reply) => {
    const body = (request.body ?? {}) as { userId?: string }
    const userId = body.userId ?? "user-yamada"
    const user = getUserById(userId)
    if (!user) return reply.status(400).send({ error: "User not found" })

    const token = createSession(user.id)
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions())
    return { user }
  })

  app.post("/api/auth/logout", async (request, reply) => {
    const token = getToken(request)
    if (token) deleteSession(token)
    reply.clearCookie(SESSION_COOKIE, { path: "/" })
    return { ok: true }
  })

  /** OIDC: OIDC_ISSUER 設定時は外部IdP、未設定時はモック */
  app.get("/api/auth/oidc/authorize", async (request, reply) => {
    const issuer = process.env.OIDC_ISSUER?.trim()
    const clientId = process.env.OIDC_CLIENT_ID?.trim()
    const query = request.query as { userId?: string; redirect_uri?: string; state?: string }

    if (issuer && clientId) {
      const redirectUri =
        query.redirect_uri ??
        process.env.OIDC_REDIRECT_URI ??
        "http://127.0.0.1:5173/?sso=callback"
      const authorizeEndpoint =
        process.env.OIDC_AUTHORIZE_URL?.trim() ||
        `${issuer.replace(/\/$/, "")}/authorize`
      const url = new URL(authorizeEndpoint)
      url.searchParams.set("client_id", clientId)
      url.searchParams.set("response_type", "code")
      url.searchParams.set("scope", process.env.OIDC_SCOPE ?? "openid profile email")
      url.searchParams.set("redirect_uri", redirectUri)
      if (query.state) url.searchParams.set("state", query.state)
      return reply.redirect(url.toString())
    }

    const userId = query.userId ?? "user-yamada"
    const user = getUserById(userId)
    if (!user) return reply.status(400).send({ error: "User not found" })
    const code = createSession(user.id)
    const redirect = query.redirect_uri ?? "http://127.0.0.1:5173/?sso=callback"
    const url = new URL(redirect)
    url.searchParams.set("code", code)
    if (query.state) url.searchParams.set("state", query.state)
    return reply.redirect(url.toString())
  })

  app.post("/api/auth/oidc/callback", async (request, reply) => {
    const body = (request.body ?? {}) as { code?: string }
    if (!body.code) return reply.status(400).send({ error: "code is required" })

    const issuer = process.env.OIDC_ISSUER?.trim()
    const clientId = process.env.OIDC_CLIENT_ID?.trim()
    const clientSecret = process.env.OIDC_CLIENT_SECRET?.trim()

    if (issuer && clientId && clientSecret) {
      const tokenUrl =
        process.env.OIDC_TOKEN_URL?.trim() || `${issuer.replace(/\/$/, "")}/token`
      const redirectUri = process.env.OIDC_REDIRECT_URI ?? "http://127.0.0.1:5173/?sso=callback"
      const tokenRes = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: body.code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      })
      if (!tokenRes.ok) {
        return reply.status(401).send({ error: "OIDC token exchange failed" })
      }
      const tokenJson = (await tokenRes.json()) as { access_token?: string; id_token?: string }
      const userInfoUrl =
        process.env.OIDC_USERINFO_URL?.trim() || `${issuer.replace(/\/$/, "")}/userinfo`
      let email = ""
      let name = ""
      let sub = ""
      if (tokenJson.access_token) {
        const ui = await fetch(userInfoUrl, {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        })
        if (ui.ok) {
          const info = (await ui.json()) as { sub?: string; email?: string; name?: string }
          sub = info.sub ?? ""
          email = info.email ?? ""
          name = info.name ?? email
        }
      }
      const mapped =
        listUsers().find((u) => u.email === email) ??
        (sub ? getUserById(`oidc-${sub}`) : null) ??
        listUsers()[0]
      if (!mapped) return reply.status(401).send({ error: "No mapped user for OIDC identity" })
      const token = createSession(mapped.id)
      reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions())
      recordOperationLog({
        userId: mapped.id,
        actionType: "admin",
        payload: { kind: "sso_login", provider: "oidc", email, name },
      })
      return { user: mapped, provider: "oidc" }
    }

    const user = getSessionUser(body.code)
    if (!user) return reply.status(401).send({ error: "Invalid or expired code" })
    reply.setCookie(SESSION_COOKIE, body.code, sessionCookieOptions())
    recordOperationLog({
      userId: user.id,
      actionType: "admin",
      payload: { kind: "sso_login", provider: "oidc-mock" },
    })
    return { user, provider: "oidc-mock" }
  })

  app.get("/api/auth/oidc/config", async () => {
    const issuer = process.env.OIDC_ISSUER?.trim()
    const configured = Boolean(issuer && process.env.OIDC_CLIENT_ID?.trim())
    return {
      provider: configured ? "oidc" : "oidc-mock",
      configured,
      issuer: issuer || null,
      authorizeUrl: "/api/auth/oidc/authorize",
      callbackUrl: "/api/auth/oidc/callback",
      note: configured
        ? "OIDC_ISSUER / OIDC_CLIENT_ID により外部IdPへリダイレクトします。"
        : "社内IdP接続前の開発用モック。OIDC_ISSUER 等を設定すると本番OIDCに切り替わります。",
    }
  })
}

export async function registerProjectRoutes(app: FastifyInstance) {
  app.get("/api/projects", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    return listAccessibleProjects(user.id)
  })

  app.get<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const found = getAccessibleProject(request.params.id, user.id)
    if (!found) return reply.status(404).send({ error: "Project not found" })
    return found.project
  })

  app.get<{ Params: { id: string } }>("/api/projects/:id/members", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const owned = loadOwned(request.params.id, user, reply)
    if (!owned) return
    return { members: listProjectMembers(request.params.id) }
  })

  app.post<{ Params: { id: string } }>("/api/projects/:id/members", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const owned = loadOwned(request.params.id, user, reply)
    if (!owned) return
    const body = (request.body ?? {}) as { userId?: string; permission?: "view" | "edit" | "admin" }
    if (!body.userId || !body.permission) {
      return reply.status(400).send({ error: "userId and permission are required" })
    }
    if (!getUserById(body.userId)) return reply.status(404).send({ error: "User not found" })
    upsertProjectMember(request.params.id, body.userId, body.permission)
    recordOperationLog({
      userId: user.id,
      actionType: "admin",
      projectId: request.params.id,
      payload: { kind: "member_add", targetUserId: body.userId, permission: body.permission },
    })
    return { ok: true, members: listProjectMembers(request.params.id) }
  })

  app.post("/api/projects", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    if (!canEditProjects(user)) {
      return reply.status(403).send({ error: "閲覧者はプロジェクトを作成できません" })
    }
    const body = request.body as Project
    if (!body?.id || !body?.name) {
      return reply.status(400).send({ error: "Invalid project payload" })
    }
    const project: Project = appendHistory(
      {
        ...body,
        owner: user.name,
        ownerId: user.id,
      },
      user,
      "プロジェクトを作成",
    )
    insertProject(user.id, project)
    recordOperationLog({ userId: user.id, actionType: "edit", projectId: project.id, payload: { kind: "create" } })
    recordOperationLog({
      userId: user.id,
      actionType: "hearing",
      projectId: project.id,
      payload: { kind: "hearing_start" },
    })
    reply.status(201)
    return project
  })

  app.put<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const body = request.body as Project
    if (request.params.id !== body?.id) {
      return reply.status(400).send({ error: "Project id mismatch" })
    }
    const editable = loadEditable(request.params.id, user, reply)
    if (!editable) return

    // 楽観ロック（簡易版）: 送られてきた updatedAt が保存済みより古ければ衝突扱い
    const storedUpdatedAt = getProjectUpdatedAt(request.params.id, editable.ownerId)
    if (body.updatedAt && storedUpdatedAt && body.updatedAt < storedUpdatedAt) {
      return reply.status(409).send({
        error: "他のユーザーまたは別の画面で更新されています。再読み込みしてください。",
        updatedAt: storedUpdatedAt,
      })
    }

    const project: Project = {
      ...body,
      owner: editable.project.owner,
      ownerId: editable.project.ownerId ?? editable.ownerId,
      updatedAt: todayStamp(),
    }
    return saveForOwner(editable.ownerId, project, reply)
  })

  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return
    if (!deleteProject(existing.id, user.id)) {
      return reply.status(500).send({ error: "Delete failed" })
    }
    recordOperationLog({
      userId: user.id,
      actionType: "edit",
      projectId: existing.id,
      payload: { kind: "delete", name: existing.name },
    })
    return { ok: true, id: existing.id }
  })

  app.patch<{ Params: { id: string } }>("/api/projects/:id/meta", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return
    const body = (request.body ?? {}) as {
      description?: string
      reviewDeadline?: string | null
    }
    const next = appendHistory(
      {
        ...existing,
        description: body.description ?? existing.description,
        reviewDeadline:
          body.reviewDeadline === null
            ? undefined
            : (body.reviewDeadline ?? existing.reviewDeadline),
      },
      user,
      "プロジェクト設定を更新",
    )
    recordOperationLog({
      userId: user.id,
      actionType: "edit",
      projectId: existing.id,
      payload: { kind: "meta", reviewDeadline: next.reviewDeadline },
    })
    return saveOwned(user, next, reply)
  })

  app.post<{ Params: { id: string } }>("/api/projects/:id/transfer", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return
    const body = (request.body ?? {}) as { newOwnerId?: string }
    if (!body.newOwnerId) return reply.status(400).send({ error: "newOwnerId is required" })
    if (body.newOwnerId === user.id) {
      return reply.status(400).send({ error: "Already the owner" })
    }
    const withHistory = appendHistory(
      { ...existing },
      user,
      `オーナーを変更`,
    )
    const transferred = transferProjectOwnership(
      existing.id,
      user.id,
      body.newOwnerId,
      withHistory,
    )
    if (!transferred) return reply.status(400).send({ error: "Transfer failed" })
    recordOperationLog({
      userId: user.id,
      actionType: "admin",
      projectId: existing.id,
      payload: { kind: "transfer", newOwnerId: body.newOwnerId },
    })
    return transferred
  })

  app.put<{ Params: { id: string; questionId: string } }>(
    "/api/projects/:id/hearing/answers/:questionId",
    async (request, reply) => {
      const user = await requireAuth(request, reply)
      if (!user) return
      const existing = loadOwned(request.params.id, user, reply)
      if (!existing) return
      const answer = request.body as HearingAnswer
      if (!answer?.questionId || answer.questionId !== request.params.questionId) {
        return reply.status(400).send({ error: "Invalid answer payload" })
      }
      const rest = existing.hearingAnswers.filter((a) => a.questionId !== answer.questionId)
      const next = appendHistory(
        { ...existing, hearingAnswers: [...rest, answer] },
        user,
        `ヒアリング回答を更新(${answer.questionId})`,
      )
      const saved = saveOwned(user, next, reply)
      if (saved) {
        recordOperationLog({
          userId: user.id,
          actionType: "hearing",
          projectId: existing.id,
          payload: { questionId: answer.questionId, status: answer.status },
        })
      }
      return saved
    },
  )

  app.put<{ Params: { id: string } }>("/api/projects/:id/flow", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return
    const flow = request.body as Project["flow"]
    const next = appendHistory({ ...existing, flow }, user, "フロー図を保存")
    return saveOwned(user, next, reply)
  })

  app.patch<{ Params: { id: string; stepId: string } }>(
    "/api/projects/:id/deepdive/:stepId",
    async (request, reply) => {
      const user = await requireAuth(request, reply)
      if (!user) return
      const existing = loadOwned(request.params.id, user, reply)
      if (!existing) return
      const patch = request.body as Record<string, unknown>
      const idx = existing.deepdive.findIndex((d) => d.stepId === request.params.stepId)
      if (idx < 0) return reply.status(404).send({ error: "Deepdive item not found" })
      const nextItems = [...existing.deepdive]
      nextItems[idx] = { ...nextItems[idx], ...patch, stepId: request.params.stepId }
      const next = appendHistory(
        { ...existing, deepdive: nextItems },
        user,
        `深掘りを更新(${request.params.stepId})`,
      )
      return saveOwned(user, next, reply)
    },
  )

  app.patch<{ Params: { id: string; sectionId: string } }>(
    "/api/projects/:id/sections/:sectionId",
    async (request, reply) => {
      const user = await requireAuth(request, reply)
      if (!user) return
      const existing = loadOwned(request.params.id, user, reply)
      if (!existing) return
      const patch = request.body as Record<string, unknown>
      const idx = existing.sections.findIndex((s) => s.id === request.params.sectionId)
      if (idx < 0) return reply.status(404).send({ error: "Section not found" })
      const nextSections = [...existing.sections]
      nextSections[idx] = { ...nextSections[idx], ...patch, id: request.params.sectionId }
      const next = appendHistory(
        { ...existing, sections: nextSections },
        user,
        `マニュアルセクションを更新(${request.params.sectionId})`,
      )
      return saveOwned(user, next, reply)
    },
  )

  // ===== Phase2: LLM連携入口（ジョブ化・Adapter経由・コスト制限付き）=====
  app.post<{ Params: { id: string } }>("/api/projects/:id/ai/flow/generate", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return

    const allowed = assertGenerationAllowed(user.id)
    if (!allowed.ok) return reply.status(429).send({ error: allowed.error })

    if (existing.status === "hearing" || (existing.hearingAnswers?.length ?? 0) > 0) {
      recordOperationLog({
        userId: user.id,
        actionType: "hearing",
        projectId: existing.id,
        payload: { kind: "hearing_complete" },
      })
    }

    const job = enqueueFlowGenerate(user.id, existing.id)
    reply.status(202)
    return { jobId: job.id, status: job.status }
  })

  app.post<{ Params: { id: string } }>("/api/projects/:id/ai/manual/generate", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return

    const allowed = assertGenerationAllowed(user.id)
    if (!allowed.ok) return reply.status(429).send({ error: allowed.error })

    const job = enqueueManualGenerate(user.id, existing.id)
    reply.status(202)
    return { jobId: job.id, status: job.status }
  })

  app.post<{ Params: { id: string } }>("/api/projects/:id/hearing/next-question", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return

    const allowed = assertGenerationAllowed(user.id)
    if (!allowed.ok) return reply.status(429).send({ error: allowed.error })

    const result = await nextHearingQuestion(existing, user.id)
    recordLlmUsage({
      userId: user.id,
      projectId: existing.id,
      action: "hearing_next",
      tokens: result.tokens,
    })
    recordOperationLog({
      userId: user.id,
      actionType: "hearing",
      projectId: existing.id,
      payload: { kind: "next-question", done: result.done },
    })
    return result
  })

  /** LLM トークンストリーミング（SSE）。ヒアリング思考表示・要件 4-D 用 */
  app.post<{ Params: { id: string } }>("/api/projects/:id/ai/complete/stream", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return

    const allowed = assertGenerationAllowed(user.id)
    if (!allowed.ok) return reply.status(429).send({ error: allowed.error })

    const body = (request.body ?? {}) as { prompt?: string; system?: string; action?: string }
    const prompt = body.prompt?.trim()
    if (!prompt) return reply.status(400).send({ error: "prompt is required" })

    const action = body.action?.trim() || "llm_stream"
    const system =
      body.system?.trim() ||
      "業務マニュアル作成AIとして、簡潔に日本語で返答せよ。1〜3文。"

    reply.hijack()
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    })
    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const started = Date.now()
    send("start", { provider: getLlmProviderName(), at: started })

    try {
      const adapter = getLlmAdapter()
      const stream = adapter.streamComplete(
        [
          { role: "system", content: system },
          { role: "user", content: prompt.slice(0, 2000) },
        ],
        { context: { userId: user.id, projectId: existing.id, action }, maxTokens: 256 },
      )

      let result = { text: "", tokens: 0, provider: getLlmProviderName() }
      while (true) {
        const step = await stream.next()
        if (step.done) {
          result = step.value
          break
        }
        send("token", { delta: step.value.delta })
      }

      recordLlmUsage({
        userId: user.id,
        projectId: existing.id,
        action,
        tokens: result.tokens,
      })
      recordOperationLog({
        userId: user.id,
        actionType: "generate",
        projectId: existing.id,
        payload: { kind: "llm-stream", provider: result.provider, ms: Date.now() - started },
      })
      send("done", {
        text: result.text,
        tokens: result.tokens,
        provider: result.provider,
        ms: Date.now() - started,
      })
    } catch (e) {
      send("error", { error: e instanceof Error ? e.message : "stream failed" })
    }
    reply.raw.end()
  })

  app.post<{ Params: { id: string; stepId: string } }>(
    "/api/projects/:id/deepdive/:stepId/questions",
    async (request, reply) => {
      const user = await requireAuth(request, reply)
      if (!user) return
      const existing = loadOwned(request.params.id, user, reply)
      if (!existing) return

      const allowed = assertGenerationAllowed(user.id)
      if (!allowed.ok) return reply.status(429).send({ error: allowed.error })

      const item = existing.deepdive.find((d) => d.stepId === request.params.stepId)
      if (!item) return reply.status(404).send({ error: "Deepdive item not found" })

      const result = await generateDeepdiveQuestions({
        projectName: existing.name,
        projectId: existing.id,
        userId: user.id,
        stepLabel: String((item as { stepLabel?: string }).stepLabel ?? item.stepId),
        importance: String((item as { importance?: string }).importance ?? "normal"),
        existingAnswers: ((item as { answers?: unknown[] }).answers ?? []) as Array<{
          question?: string
          value?: string
        }>,
      })
      recordLlmUsage({
        userId: user.id,
        projectId: existing.id,
        action: "deepdive_questions",
        tokens: result.tokens,
      })
      recordOperationLog({
        userId: user.id,
        actionType: "hearing",
        projectId: existing.id,
        payload: { kind: "deepdive-questions", stepId: request.params.stepId },
      })
      return result
    },
  )

  app.post<{ Params: { id: string } }>("/api/projects/:id/ai/flow/nl-edit", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return

    const allowed = assertGenerationAllowed(user.id)
    if (!allowed.ok) return reply.status(429).send({ error: allowed.error })

    const body = (request.body ?? {}) as { instruction?: string; flow?: Project["flow"] }
    const instruction = body.instruction?.trim()
    if (!instruction) return reply.status(400).send({ error: "instruction is required" })
    if (!body.flow) return reply.status(400).send({ error: "flow is required" })

    const adapter = getLlmAdapter()
    const llm = await adapter.complete(
      [
        {
          role: "system",
          content:
            'フロー自然言語修正。可能なら JSON で {"ops":[{"op":"addLane|rename|addNode","...":"..."}],"description":"..."} を返せ。不明なら description のみ。',
        },
        {
          role: "user",
          content: JSON.stringify({ instruction, flow: body.flow }).slice(0, 3500),
        },
      ],
      { context: { userId: user.id, projectId: existing.id, action: "flow_nl_edit" } },
    )
    recordLlmUsage({ userId: user.id, projectId: existing.id, action: "flow_nl_edit", tokens: llm.tokens })
    recordOperationLog({
      userId: user.id,
      actionType: "generate",
      projectId: existing.id,
      payload: { kind: "nl-edit", provider: llm.provider, tokens: llm.tokens },
    })

    // LLM の description をヒントに正規表現ベースの差分を適用（手動ノード保護は flow-logic 側）
    let enrichedInstruction = instruction
    try {
      const parsed = JSON.parse(extractJson(llm.text)) as { description?: string; ops?: unknown }
      if (parsed.description) enrichedInstruction = `${instruction}\n${parsed.description}`
    } catch {
      if (llm.text && !llm.text.startsWith("[モック")) enrichedInstruction = `${instruction}\n${llm.text.slice(0, 200)}`
    }
    const result = proposeNlEdit(enrichedInstruction, body.flow as unknown as Parameters<typeof proposeNlEdit>[1])
    return { ...result, meta: { provider: llm.provider, tokens: llm.tokens } }
  })

  app.post<{ Params: { id: string } }>("/api/projects/:id/ai/flow/regenerate", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return

    const allowed = assertGenerationAllowed(user.id)
    if (!allowed.ok) return reply.status(429).send({ error: allowed.error })

    const body = (request.body ?? {}) as { flow?: Project["flow"] }
    if (!body.flow) return reply.status(400).send({ error: "flow is required" })

    const generated = await generateFlowFromLlm(existing, user.id)
    const flow = mergeFlowPreservingManual(
      body.flow as unknown as Parameters<typeof mergeFlowPreservingManual>[0],
      generated.flow,
    )
    recordLlmUsage({
      userId: user.id,
      projectId: existing.id,
      action: "flow_regenerate",
      tokens: generated.tokens,
    })
    recordOperationLog({
      userId: user.id,
      actionType: "generate",
      projectId: existing.id,
      payload: {
        kind: "flow_regenerate",
        provider: generated.provider,
        usedLlmStructure: generated.usedLlmStructure,
      },
    })

    return {
      flow,
      meta: {
        provider: generated.provider,
        tokens: generated.tokens,
        usedLlmStructure: generated.usedLlmStructure,
      },
    }
  })

  app.post<{ Params: { id: string; sectionId: string } }>(
    "/api/projects/:id/ai/sections/:sectionId/regenerate",
    async (request, reply) => {
      const user = await requireAuth(request, reply)
      if (!user) return
      const existing = loadOwned(request.params.id, user, reply)
      if (!existing) return

      const allowed = assertGenerationAllowed(user.id)
      if (!allowed.ok) return reply.status(429).send({ error: allowed.error })

      try {
        const { section, provider, tokens } = await regenerateSectionFromLlm(
          existing,
          request.params.sectionId,
          user.id,
        )
        recordLlmUsage({
          userId: user.id,
          projectId: existing.id,
          action: "section_regenerate",
          tokens,
        })
        recordOperationLog({
          userId: user.id,
          actionType: "generate",
          projectId: existing.id,
          payload: { kind: "section_regenerate", sectionId: request.params.sectionId, provider },
        })
        return { section, meta: { provider, tokens } }
      } catch {
        try {
          const section = regenerateSectionMock(existing, request.params.sectionId)
          return { section }
        } catch {
          return reply.status(404).send({ error: "Section not found" })
        }
      }
    },
  )
}

export async function registerQaRoutes(app: FastifyInstance) {
  app.post("/api/qa/ask", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const body = (request.body ?? {}) as { question?: string }
    const question = body.question?.trim()
    if (!question) return reply.status(400).send({ error: "question is required" })

    const projects = listAccessibleProjects(user.id)
    const result = await answerQuestion(question, projects, { userId: user.id })
    const messageId = `qa-${Date.now()}`
    insertQaMessage(user.id, messageId, question)
    recordOperationLog({
      userId: user.id,
      actionType: "qa",
      payload: { messageId, noSource: result.noSource },
    })
    if (result.noSource) {
      const notifyUserId = result.notifyOwnerId ?? user.id
      createNotification({
        userId: notifyUserId,
        type: "qa_unanswered",
        title: "QAで回答根拠が見つかりませんでした",
        body: `質問: ${question.slice(0, 80)}`,
      })
    }
    return { ...result, messageId }
  })

  app.post("/api/qa/feedback", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const body = (request.body ?? {}) as {
      messageId?: string
      question?: string
      feedback?: "up" | "down"
    }
    if (!body.messageId || !body.question || !body.feedback) {
      return reply.status(400).send({ error: "Invalid feedback payload" })
    }
    insertQaFeedback(user.id, body.messageId, body.question, body.feedback)
    recordOperationLog({
      userId: user.id,
      actionType: "qa",
      payload: { kind: "feedback", feedback: body.feedback, messageId: body.messageId },
    })
    return { ok: true }
  })
}

export async function registerPublishExportRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/api/projects/:id/publish", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return

    const validation = validatePublish(existing)
    if (!validation.ok) {
      return reply.status(400).send({ error: validation.errors.join(" / "), errors: validation.errors })
    }

    const body = (request.body ?? {}) as { visibility?: Project["visibility"] }
    const visibility = body.visibility === "org" || body.visibility === "members" ? body.visibility : undefined
    const published = applyPublish(
      visibility ? { ...existing, visibility } : existing,
      user.name,
    )
    const saved = saveOwned(user, published, reply)
    if (!saved) return
    recordOperationLog({
      userId: user.id,
      actionType: "publish",
      projectId: saved.id,
    })
    return { ...saved, askCsat: true }
  })

  app.post<{ Params: { id: string } }>("/api/projects/:id/export/html", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return

    const body = (request.body ?? {}) as {
      template?: string
      includeFlow?: boolean
      imageMode?: "expand" | "appendix" | "none"
      sectionIds?: string[]
    }

    const html = buildManualHtml(existing, body)
    recordOperationLog({
      userId: user.id,
      actionType: "export",
      projectId: existing.id,
      payload: { format: "html", template: body.template },
    })
    return { html, filename: `${existing.name}.html` }
  })

  app.post<{ Params: { id: string } }>("/api/projects/:id/export/pdf", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return

    const body = (request.body ?? {}) as {
      template?: string
      includeFlow?: boolean
      imageMode?: "expand" | "appendix" | "none"
      sectionIds?: string[]
      async?: boolean
    }

    if (body.async) {
      const job = enqueuePdfExport(user.id, existing.id, {
        template: body.template,
        includeFlow: body.includeFlow,
        imageMode: body.imageMode,
        sectionIds: body.sectionIds,
      })
      reply.status(202)
      return { jobId: job.id, status: job.status }
    }

    const pdf = await buildManualPdf(existing, body)
    const artifact = storeExportArtifact({
      userId: user.id,
      projectId: existing.id,
      filename: `${existing.name}.pdf`,
      mimeType: "application/pdf",
      bytes: pdf,
    })
    recordOperationLog({
      userId: user.id,
      actionType: "export",
      projectId: existing.id,
      payload: { format: "pdf", template: body.template, downloadToken: artifact.token },
    })
    return {
      pdfBase64: pdf.toString("base64"),
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      downloadUrl: artifact.downloadUrl,
      expiresAt: artifact.expiresAt,
    }
  })

  app.get<{ Params: { token: string } }>("/api/exports/download/:token", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const item = getExportArtifact(request.params.token)
    if (!item || item.userId !== user.id) {
      return reply.status(404).send({ error: "Download not found or expired" })
    }
    const fs = await import("node:fs")
    const buf = fs.readFileSync(item.filePath)
    reply.header("Content-Type", item.mimeType)
    reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(item.filename)}`)
    return reply.send(buf)
  })
}

export async function registerMetricsRoutes(app: FastifyInstance) {
  app.get("/api/metrics/dashboard", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    return getDashboardMetrics(user.id)
  })

  app.post("/api/metrics/csat", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const body = (request.body ?? {}) as {
      score?: number
      source?: string
      projectId?: string
      comment?: string
    }
    if (!body.score || body.score < 1 || body.score > 5) {
      return reply.status(400).send({ error: "score must be 1-5" })
    }
    insertCsat({
      userId: user.id,
      projectId: body.projectId,
      source: body.source ?? "general",
      score: body.score,
      comment: body.comment,
    })
    recordOperationLog({
      userId: user.id,
      actionType: "csat",
      projectId: body.projectId,
      payload: { score: body.score, source: body.source ?? "general" },
    })
    return { ok: true, average: averageCsat(user.id) }
  })
}

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.get("/api/notifications", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    // 見直し期限が近いプロジェクトを通知
    const prefs = getNotificationSettings(user.id)
    if (prefs.reviewDeadline) {
      const today = new Date()
      const in14 = new Date(today)
      in14.setDate(in14.getDate() + 14)
      const todayStr = today.toISOString().slice(0, 10)
      const in14Str = in14.toISOString().slice(0, 10)
      for (const p of listProjectsForUser(user.id)) {
        if (p.reviewDeadline && p.reviewDeadline >= todayStr && p.reviewDeadline <= in14Str) {
          createNotification({
            userId: user.id,
            type: "review_deadline",
            title: "見直し期限が近づいています",
            body: `「${p.name}」の見直し期限は ${p.reviewDeadline} です。`,
          })
        }
      }
    }
    return { items: listNotifications(user.id) }
  })

  app.post("/api/notifications/read-all", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    markAllNotificationsRead(user.id)
    return { ok: true }
  })

  app.post<{ Params: { id: string } }>("/api/notifications/:id/read", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    if (!markNotificationRead(user.id, request.params.id)) {
      return reply.status(404).send({ error: "Not found" })
    }
    return { ok: true }
  })

  app.get("/api/notifications/settings", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    return getNotificationSettings(user.id)
  })

  app.put("/api/notifications/settings", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const body = (request.body ?? {}) as {
      reviewDeadline?: boolean
      qaUnanswered?: boolean
      llmBudget?: boolean
    }
    const current = getNotificationSettings(user.id)
    const next = {
      reviewDeadline: body.reviewDeadline ?? current.reviewDeadline,
      qaUnanswered: body.qaUnanswered ?? current.qaUnanswered,
      llmBudget: body.llmBudget ?? current.llmBudget,
    }
    setNotificationSettings(user.id, next)
    return next
  })
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/users", async (request, reply) => {
    const user = await requireAdmin(request, reply)
    if (!user) return
    return { users: listUsers() }
  })

  app.patch<{ Params: { id: string } }>("/api/admin/users/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply)
    if (!user) return
    const body = (request.body ?? {}) as { role?: UserRole }
    if (!body.role || !["viewer", "creator", "admin"].includes(body.role)) {
      return reply.status(400).send({ error: "Invalid role" })
    }
    const updated = updateUserRole(request.params.id, body.role)
    if (!updated) return reply.status(404).send({ error: "User not found" })
    recordOperationLog({
      userId: user.id,
      actionType: "admin",
      payload: { kind: "role", targetUserId: updated.id, role: body.role },
    })
    return { user: updated }
  })

  app.get("/api/admin/templates", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    return { templates: listDesignTemplates() }
  })

  app.put<{ Params: { id: string } }>("/api/admin/templates/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply)
    if (!user) return
    const body = (request.body ?? {}) as {
      name?: string
      theme?: string
      description?: string
      color?: string
    }
    if (!body.name || !body.theme) {
      return reply.status(400).send({ error: "name and theme are required" })
    }
    const tpl = upsertDesignTemplate({
      id: request.params.id,
      name: body.name,
      theme: body.theme,
      description: body.description ?? "",
      color: body.color ?? "#2563eb",
    })
    recordOperationLog({
      userId: user.id,
      actionType: "admin",
      payload: { kind: "template_upsert", templateId: tpl.id },
    })
    return { template: tpl }
  })

  app.delete<{ Params: { id: string } }>("/api/admin/templates/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply)
    if (!user) return
    if (!deleteDesignTemplate(request.params.id)) {
      return reply.status(404).send({ error: "Template not found" })
    }
    recordOperationLog({
      userId: user.id,
      actionType: "admin",
      payload: { kind: "template_delete", templateId: request.params.id },
    })
    return { ok: true }
  })

  app.get("/api/admin/settings", async (request, reply) => {
    const user = await requireAdmin(request, reply)
    if (!user) return
    return {
      llmBudgetYen: getLlmBudgetYen(),
      llmProvider: getLlmProviderName(),
      llmModel: getLlmRuntimeInfo().model,
      notificationDefaults: getNotificationSettings(user.id),
    }
  })

  app.put("/api/admin/settings", async (request, reply) => {
    const user = await requireAdmin(request, reply)
    if (!user) return
    const body = (request.body ?? {}) as { llmBudgetYen?: number }
    if (typeof body.llmBudgetYen === "number" && body.llmBudgetYen > 0) {
      setLlmBudgetYen(body.llmBudgetYen)
    }
    recordOperationLog({
      userId: user.id,
      actionType: "admin",
      payload: { kind: "settings", llmBudgetYen: getLlmBudgetYen() },
    })
    return {
      llmBudgetYen: getLlmBudgetYen(),
      llmProvider: getLlmProviderName(),
      llmModel: getLlmRuntimeInfo().model,
    }
  })

  app.get("/api/admin/audit-logs", async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const query = request.query as { limit?: string; actionType?: string; userId?: string }
    const logs = listOperationLogs({
      limit: query.limit ? Number(query.limit) : 100,
      userId: query.userId,
      actionType: query.actionType as import("./operation-log.js").OperationActionType | undefined,
    })
    return { logs }
  })
}

export async function registerJobRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/api/jobs/:id", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const job = getJob(request.params.id)
    if (!job || job.userId !== user.id) {
      return reply.status(404).send({ error: "Job not found" })
    }
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }
  })

  app.get<{ Params: { id: string } }>("/api/jobs/:id/stream", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const job = getJob(request.params.id)
    if (!job || job.userId !== user.id) {
      return reply.status(404).send({ error: "Job not found" })
    }

    reply.hijack()
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    })

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    send("snapshot", {
      id: job.id,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
    })

    const started = Date.now()
    const timer = setInterval(() => {
      const current = getJob(request.params.id)
      if (!current) {
        send("error", { error: "Job disappeared" })
        clearInterval(timer)
        reply.raw.end()
        return
      }
      send("progress", {
        id: current.id,
        status: current.status,
        progress: current.progress,
        result: current.status === "completed" ? current.result : undefined,
        error: current.error,
      })
      if (current.status === "completed" || current.status === "failed" || Date.now() - started > 120_000) {
        clearInterval(timer)
        reply.raw.end()
      }
    }, 250)

    request.raw.on("close", () => {
      clearInterval(timer)
    })
  })
}

export { SESSION_COOKIE }
