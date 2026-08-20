import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import {
  averageCsat,
  createSession,
  deleteDesignTemplate,
  deleteSession,
  getAccessibleProject,
  getProjectForUser,
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
  updateProject as dbUpdateProject,
  updateUserRole,
  upsertDesignTemplate,
  upsertProjectMember,
} from "./db.js"
import { buildManualHtml } from "./export/manual-html.js"
import { buildManualPdf } from "./export/manual-pdf.js"
import { getDashboardMetrics } from "./metrics.js"
import { applyPublish, validatePublish } from "./publish.js"
import { answerQuestion } from "./qa.js"
import { proposeNlEdit, regenerateFlowPreservingManual } from "./ai/flow.js"
import { regenerateSectionMock } from "./ai/manual.js"
import { generateDeepdiveQuestions, nextHearingQuestion } from "./ai/hearing.js"
import {
  enqueueFlowGenerate,
  enqueueManualGenerate,
  enqueuePdfExport,
} from "./ai/jobs-handlers.js"
import { assertGenerationAllowed, getLlmBudgetYen, recordLlmUsage, setLlmBudgetYen } from "./llm-cost.js"
import { getLlmAdapter, getLlmProviderName } from "./llm/adapter.js"
import { getJob } from "./jobs.js"
import {
  getNotificationSettings,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  setNotificationSettings,
  createNotification,
} from "./notifications.js"
import { recordOperationLog } from "./operation-log.js"
import type { AuthUser, HearingAnswer, Project, UserRole } from "./types.js"

const SESSION_COOKIE = "rakumanual_session"

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
  return new Date().toISOString().slice(0, 10)
}

function nowStamp(): string {
  const d = new Date()
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`
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

function saveOwned(user: AuthUser, project: Project, reply: FastifyReply): Project | null {
  const ok = dbUpdateProject(user.id, project)
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

  app.post("/api/auth/login", async (request, reply) => {
    const body = (request.body ?? {}) as { userId?: string }
    const userId = body.userId ?? "user-yamada"
    const user = getUserById(userId)
    if (!user) return reply.status(400).send({ error: "User not found" })

    const token = createSession(user.id)
    reply.setCookie(SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
    })
    return { user }
  })

  app.post("/api/auth/logout", async (request, reply) => {
    const token = getToken(request)
    if (token) deleteSession(token)
    reply.clearCookie(SESSION_COOKIE, { path: "/" })
    return { ok: true }
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
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return
    const project: Project = {
      ...body,
      owner: user.name,
      ownerId: user.id,
      updatedAt: todayStamp(),
    }
    return saveOwned(user, project, reply)
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
        { role: "system", content: "フロー図の自然言語修正指示を解釈せよ。" },
        { role: "user", content: instruction },
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

    const result = proposeNlEdit(instruction, body.flow as unknown as Parameters<typeof proposeNlEdit>[1])
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

    recordLlmUsage({ userId: user.id, projectId: existing.id, action: "flow_regenerate", tokens: 150 })
    recordOperationLog({
      userId: user.id,
      actionType: "generate",
      projectId: existing.id,
      payload: { kind: "flow_regenerate" },
    })

    const flow = regenerateFlowPreservingManual(
      body.flow as unknown as Parameters<typeof regenerateFlowPreservingManual>[0],
      existing.name,
    )
    return { flow }
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
        recordLlmUsage({
          userId: user.id,
          projectId: existing.id,
          action: "section_regenerate",
          tokens: 180,
        })
        recordOperationLog({
          userId: user.id,
          actionType: "generate",
          projectId: existing.id,
          payload: { kind: "section_regenerate", sectionId: request.params.sectionId },
        })
        const section = regenerateSectionMock(existing, request.params.sectionId)
        return { section }
      } catch {
        return reply.status(404).send({ error: "Section not found" })
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
    const result = answerQuestion(question, projects)
    const messageId = `qa-${Date.now()}`
    insertQaMessage(user.id, messageId, question)
    recordOperationLog({
      userId: user.id,
      actionType: "qa",
      payload: { messageId, noSource: result.noSource },
    })
    if (result.noSource) {
      createNotification({
        userId: user.id,
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

    const published = applyPublish(existing, user.name)
    const saved = saveOwned(user, published, reply)
    if (!saved) return
    recordOperationLog({
      userId: user.id,
      actionType: "publish",
      projectId: saved.id,
    })
    return saved
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
        sectionIds: body.sectionIds,
      })
      reply.status(202)
      return { jobId: job.id, status: job.status }
    }

    const pdf = await buildManualPdf(existing, body)
    recordOperationLog({
      userId: user.id,
      actionType: "export",
      projectId: existing.id,
      payload: { format: "pdf", template: body.template },
    })
    return {
      pdfBase64: pdf.toString("base64"),
      filename: `${existing.name}.pdf`,
      mimeType: "application/pdf",
    }
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
    }
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
