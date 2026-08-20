import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import {
  createSession,
  deleteSession,
  getProjectForUser,
  getSessionUser,
  getUserById,
  insertProject,
  listProjectsForUser,
  updateProject as dbUpdateProject,
} from "./db.js"
import type { AuthUser, HearingAnswer, Project } from "./types.js"

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
    return listProjectsForUser(user.id)
  })

  app.get<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const project = loadOwned(request.params.id, user, reply)
    if (!project) return
    return project
  })

  app.post("/api/projects", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
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
      return saveOwned(user, next, reply)
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

  // ===== Phase2: LLM連携入口（まずはモック生成）=====
  app.post<{ Params: { id: string } }>("/api/projects/:id/ai/flow/generate", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return

    const flow = generateFlowMock(existing.name)
    return { flow }
  })

  app.post<{ Params: { id: string } }>("/api/projects/:id/ai/manual/generate", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const existing = loadOwned(request.params.id, user, reply)
    if (!existing) return

    const sections = generateManualSectionsMock(existing)
    return { sections }
  })
}

export { SESSION_COOKIE }
