import { getProjectForUser } from "../db.js"
import { createJob, getJobPayload, registerJobHandler } from "../jobs.js"
import { getLlmAdapter } from "../llm/adapter.js"
import { assertGenerationAllowed, recordLlmUsage } from "../llm-cost.js"
import { recordOperationLog } from "../operation-log.js"
import type { Project } from "../types.js"

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

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
      data: { label: "内容を確認", lane: "確認者", kind: "decision", system: "—", source: "q3: 関係者" },
    },
    {
      id: n4,
      type: "step",
      position: { x: 0, y: 0 },
      data: { label: "業務完了", lane: "担当者", kind: "end", system: "—", source: "q6: 終了条件" },
    },
  ]
  const edges = [
    { id: uid("e"), source: n0, target: n1 },
    { id: uid("e"), source: n1, target: n2 },
    { id: uid("e"), source: n2, target: n3 },
    { id: uid("e"), source: n3, target: n4 },
  ]
  return { lanes, nodes, edges }
}

function generateManualSectionsMock(existing: Project) {
  const deepdive = existing.deepdive ?? []
  if (deepdive.length === 0) {
    return [
      {
        id: uid("s"),
        title: `${existing.name}の概要`,
        sectionNumber: "1",
        status: "draft",
        version: 1,
        blocks: [
          {
            id: uid("b"),
            type: "paragraph",
            text: `${existing.name}の手順概要です。（ジョブ生成）`,
            needsConfirm: true,
          },
        ],
      },
    ]
  }
  return deepdive.map((d, i) => ({
    id: uid("s"),
    title: String((d as { stepLabel?: string }).stepLabel ?? `ステップ${i + 1}`),
    sectionNumber: String((d as { sectionNumber?: string }).sectionNumber ?? `${i + 1}`),
    stepId: d.stepId,
    status: "draft",
    version: 1,
    blocks: [
      {
        id: uid("b"),
        type: "paragraph",
        text: `「${(d as { stepLabel?: string }).stepLabel ?? d.stepId}」の手順を説明します。`,
        needsConfirm: true,
      },
      {
        id: uid("b"),
        type: "step",
        text: "作業を実施し、結果を確認します。",
      },
    ],
  }))
}

export function registerAiJobHandlers() {
  registerJobHandler("flow_generate", async (job, update) => {
    update(10)
    const project = getProjectForUser(job.projectId!, job.userId)
    if (!project) throw new Error("Project not found")
    const allowed = assertGenerationAllowed(job.userId)
    if (!allowed.ok) throw new Error(allowed.error)

    update(30)
    const adapter = getLlmAdapter()
    const llm = await adapter.complete([
      {
        role: "system",
        content: "業務マニュアル用のスイムレーンフローを生成するための要約を出力せよ。",
      },
      {
        role: "user",
        content: `プロジェクト「${project.name}」のフローを生成。ヒアリング: ${JSON.stringify(project.hearingAnswers).slice(0, 1500)}`,
      },
    ])
    update(70)
    recordLlmUsage({ userId: job.userId, projectId: project.id, action: "flow_generate", tokens: llm.tokens })
    recordOperationLog({
      userId: job.userId,
      actionType: "generate",
      projectId: project.id,
      payload: { kind: "flow", provider: llm.provider, tokens: llm.tokens, jobId: job.id },
    })
    const flow = generateFlowMock(project.name)
    update(95)
    return { flow, meta: { provider: llm.provider, tokens: llm.tokens } }
  })

  registerJobHandler("manual_generate", async (job, update) => {
    update(10)
    const project = getProjectForUser(job.projectId!, job.userId)
    if (!project) throw new Error("Project not found")
    const allowed = assertGenerationAllowed(job.userId)
    if (!allowed.ok) throw new Error(allowed.error)

    update(35)
    const adapter = getLlmAdapter()
    const llm = await adapter.complete([
      {
        role: "system",
        content: "業務マニュアルのセクション構成を生成するための要約を出力せよ。",
      },
      {
        role: "user",
        content: `プロジェクト「${project.name}」のマニュアルを生成。深掘り件数: ${project.deepdive?.length ?? 0}`,
      },
    ])
    update(70)
    recordLlmUsage({
      userId: job.userId,
      projectId: project.id,
      action: "manual_generate",
      tokens: llm.tokens,
    })
    recordOperationLog({
      userId: job.userId,
      actionType: "generate",
      projectId: project.id,
      payload: { kind: "manual", provider: llm.provider, tokens: llm.tokens, jobId: job.id },
    })
    const sections = generateManualSectionsMock(project)
    update(95)
    return { sections, meta: { provider: llm.provider, tokens: llm.tokens } }
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
    update(90)
    recordOperationLog({
      userId: job.userId,
      actionType: "export",
      projectId: project.id,
      payload: { format: "pdf", jobId: job.id },
    })
    return {
      pdfBase64: pdf.toString("base64"),
      filename: `${project.name}.pdf`,
      mimeType: "application/pdf",
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
