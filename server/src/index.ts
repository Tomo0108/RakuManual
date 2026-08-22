import Fastify from "fastify"
import cookie from "@fastify/cookie"
import cors from "@fastify/cors"
import multipart from "@fastify/multipart"
import fastifyStatic from "@fastify/static"
import fs from "node:fs"
import path from "node:path"
import { loadEnvFiles } from "./llm/config.js"
import { getDb, getProjectForUser, UPLOADS_DIR } from "./db.js"
import { registerAiJobHandlers } from "./ai/jobs-handlers.js"
import { recoverStaleJobs } from "./jobs.js"
import {
  registerAdminRoutes,
  registerAuthRoutes,
  registerJobRoutes,
  registerMetricsRoutes,
  registerNotificationRoutes,
  registerProjectRoutes,
  registerPublishExportRoutes,
  registerQaRoutes,
  requireAuth,
} from "./routes.js"
import { recordOperationLog } from "./operation-log.js"

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? "127.0.0.1"

async function main() {
  loadEnvFiles()
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  getDb()
  recoverStaleJobs()
  registerAiJobHandlers()

  const app = Fastify({ logger: true })

  // ボディなし POST + Content-Type: application/json を {} として受理（Fastify 既定の 400 を防ぐ）
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    const raw = typeof body === "string" ? body : ""
    if (!raw.trim()) {
      done(null, {})
      return
    }
    try {
      done(null, JSON.parse(raw) as unknown)
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  app.setErrorHandler((err, request, reply) => {
    const code = (err as { code?: string }).code
    const status =
      typeof (err as { statusCode?: number }).statusCode === "number"
        ? (err as { statusCode: number }).statusCode
        : 500

    if (code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
      return reply.status(400).send({
        error: "リクエスト本文が空です。JSON（例: {}）で送信してください。",
        code,
      })
    }
    if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
      return reply.status(415).send({
        error: "Content-Type は application/json を指定してください。",
        code,
      })
    }

    request.log.error(err)
    const message =
      status >= 500
        ? "サーバーエラーが発生しました"
        : err instanceof Error && err.message
          ? err.message
          : "リクエストエラー"
    return reply.status(status).send({ error: message, code })
  })

  await app.register(cors, {
    origin: (origin, cb) => {
      const defaults = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ]
      const extra = (process.env.ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      const allowed = [...defaults, ...extra]
      // same-origin / curl 等は origin なし
      if (!origin || allowed.includes(origin) || allowed.includes("*")) {
        cb(null, true)
        return
      }
      // Vercel プレビューは明示オプトイン時のみ（本番は ALLOWED_ORIGINS に列挙）
      if (
        process.env.ALLOW_VERCEL_PREVIEWS === "true" &&
        /^https:\/\/[\w.-]+\.vercel\.app$/.test(origin)
      ) {
        cb(null, true)
        return
      }
      cb(null, false)
    },
    credentials: true,
  })
  await app.register(cookie)
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })
  // sendFile 用のみ（serve: false で無認証公開はしない）
  await app.register(fastifyStatic, {
    root: UPLOADS_DIR,
    decorateReply: true,
    serve: false,
  })

  // 画像は認証＋プロジェクト閲覧権限が必要
  app.get<{ Params: { "*": string } }>("/api/uploads/*", async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    const raw = (request.params as { "*": string })["*"] ?? ""
    const key = raw.replace(/^\/+/, "")
    if (!key || key.includes("..") || path.isAbsolute(key)) {
      return reply.status(400).send({ error: "Invalid path" })
    }
    const projectId = key.split("/")[0]
    if (!projectId || !getProjectForUser(projectId, user.id)) {
      return reply.status(404).send({ error: "Not found" })
    }
    const root = path.resolve(UPLOADS_DIR)
    const abs = path.resolve(UPLOADS_DIR, key)
    if (!abs.startsWith(root + path.sep) || !fs.existsSync(abs)) {
      return reply.status(404).send({ error: "Not found" })
    }
    return reply.sendFile(key)
  })

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff")
    reply.header("X-Frame-Options", "DENY")
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin")
    reply.header("X-XSS-Protection", "0")
    return payload
  })

  app.get("/api/health", async () => {
    const { getLlmRuntimeInfo } = await import("./llm/adapter.js")
    const llm = getLlmRuntimeInfo()
    return {
      status: "ok",
      llm: { provider: llm.provider, model: llm.model },
    }
  })

  await registerAuthRoutes(app)
  await registerProjectRoutes(app)
  await registerQaRoutes(app)
  await registerPublishExportRoutes(app)
  await registerMetricsRoutes(app)
  await registerNotificationRoutes(app)
  await registerAdminRoutes(app)
  await registerJobRoutes(app)

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/images",
    async (request, reply) => {
      const user = await requireAuth(request, reply)
      if (!user) return
      if (!getProjectForUser(request.params.projectId, user.id)) {
        return reply.status(404).send({ error: "Project not found" })
      }

      const file = await request.file()
      if (!file) return reply.status(400).send({ error: "No file uploaded" })

      const allowed = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])
      if (!allowed.has(file.mimetype)) {
        return reply.status(400).send({ error: "Unsupported image type" })
      }

      const ext = path.extname(file.filename) || ".bin"
      const storageKey = `${request.params.projectId}/${crypto.randomUUID()}${ext}`
      const dest = path.join(UPLOADS_DIR, storageKey)
      const dir = path.dirname(dest)
      await import("node:fs/promises").then((fs) => fs.mkdir(dir, { recursive: true }))
      const buffer = await file.toBuffer()
      await import("node:fs/promises").then((fs) => fs.writeFile(dest, buffer))

      recordOperationLog({
        userId: user.id,
        actionType: "edit",
        projectId: request.params.projectId,
        payload: { kind: "image_upload", mimeType: file.mimetype },
      })

      return {
        storageKey,
        url: `/api/uploads/${storageKey}`,
        mimeType: file.mimetype,
        name: file.filename,
      }
    },
  )

  await app.listen({ port: PORT, host: HOST })
  console.log(`API server listening on http://${HOST}:${PORT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
