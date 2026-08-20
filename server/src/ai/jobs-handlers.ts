import { getProjectForUser } from "../db.js"
import { createJob, getJobPayload, registerJobHandler } from "../jobs.js"
import { assertGenerationAllowed, recordLlmUsage } from "../llm-cost.js"
import { recordOperationLog } from "../operation-log.js"
import { generateFlowFromLlm, generateManualFromLlm } from "./structured.js"
import { storeExportArtifact } from "../export/artifacts.js"

export function registerAiJobHandlers() {
  registerJobHandler("flow_generate", async (job, update) => {
    update(10)
    const project = getProjectForUser(job.projectId!, job.userId)
    if (!project) throw new Error("Project not found")
    const allowed = assertGenerationAllowed(job.userId)
    if (!allowed.ok) throw new Error(allowed.error)

    update(30)
    const { flow, provider, tokens, usedLlmStructure } = await generateFlowFromLlm(
      project,
      job.userId,
    )
    update(70)
    recordLlmUsage({ userId: job.userId, projectId: project.id, action: "flow_generate", tokens })
    recordOperationLog({
      userId: job.userId,
      actionType: "generate",
      projectId: project.id,
      payload: {
        kind: "flow",
        provider,
        tokens,
        jobId: job.id,
        usedLlmStructure,
      },
    })
    update(95)
    return { flow, meta: { provider, tokens, usedLlmStructure } }
  })

  registerJobHandler("manual_generate", async (job, update) => {
    update(10)
    const project = getProjectForUser(job.projectId!, job.userId)
    if (!project) throw new Error("Project not found")
    const allowed = assertGenerationAllowed(job.userId)
    if (!allowed.ok) throw new Error(allowed.error)

    update(35)
    const { sections, provider, tokens, usedLlmStructure } = await generateManualFromLlm(
      project,
      job.userId,
    )
    update(70)
    recordLlmUsage({
      userId: job.userId,
      projectId: project.id,
      action: "manual_generate",
      tokens,
    })
    recordOperationLog({
      userId: job.userId,
      actionType: "generate",
      projectId: project.id,
      payload: {
        kind: "manual",
        provider,
        tokens,
        jobId: job.id,
        usedLlmStructure,
      },
    })
    update(95)
    return { sections, meta: { provider, tokens, usedLlmStructure } }
  })

  registerJobHandler("export_pdf", async (job, update) => {
    update(20)
    const payload = getJobPayload(job.id)
    const project = getProjectForUser(job.projectId!, job.userId)
    if (!project) throw new Error("Project not found")
    const { buildManualPdf } = await import("../export/manual-pdf.js")
    update(50)
    const pdf = await buildManualPdf(project, {
      template: typeof payload.template === "string" ? payload.template : undefined,
      includeFlow: payload.includeFlow !== false,
      sectionIds: Array.isArray(payload.sectionIds) ? (payload.sectionIds as string[]) : undefined,
    })
    update(80)
    const artifact = storeExportArtifact({
      userId: job.userId,
      projectId: project.id,
      filename: `${project.name}.pdf`,
      mimeType: "application/pdf",
      bytes: pdf,
      ttlMs: 15 * 60 * 1000,
    })
    update(90)
    recordOperationLog({
      userId: job.userId,
      actionType: "export",
      projectId: project.id,
      payload: { format: "pdf", jobId: job.id, downloadToken: artifact.token },
    })
    return {
      pdfBase64: pdf.toString("base64"),
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      downloadUrl: artifact.downloadUrl,
      expiresAt: artifact.expiresAt,
    }
  })
}

export function enqueueFlowGenerate(userId: string, projectId: string) {
  return createJob({ userId, projectId, type: "flow_generate" })
}

export function enqueueManualGenerate(userId: string, projectId: string) {
  return createJob({ userId, projectId, type: "manual_generate" })
}

export function enqueuePdfExport(
  userId: string,
  projectId: string,
  payload: Record<string, unknown>,
) {
  return createJob({ userId, projectId, type: "export_pdf", payload })
}
