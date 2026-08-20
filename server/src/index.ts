import Fastify from "fastify"
import cookie from "@fastify/cookie"
import cors from "@fastify/cors"
import multipart from "@fastify/multipart"
import fastifyStatic from "@fastify/static"
import fs from "node:fs"
import path from "node:path"
import { getDb, getProjectForUser, UPLOADS_DIR } from "./db.js"
import { registerAiJobHandlers } from "./ai/jobs-handlers.js"
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
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  getDb()
  registerAiJobHandlers()

  const app = Fastify({ logger: true })

  await app.register(cors, {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
  await app.register(cookie)
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })
  await app.register(fastifyStatic, {
    root: UPLOADS_DIR,
    prefix: "/api/uploads/",
    decorateReply: false,
  })

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff")
    reply.header("X-Frame-Options", "DENY")
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin")
    reply.header("X-XSS-Protection", "0")
    return payload
  })

  app.get("/api/health", async () => ({ status: "ok" }))

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
