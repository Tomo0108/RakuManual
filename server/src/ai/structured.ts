/**
 * LLM 構造化出力のパースとフロー/マニュアル生成。
 * パース失敗時はモックにフォールバック（デモ継続性）。
 */

import { getLlmAdapter } from "../llm/adapter.js"
import type { FlowState } from "../flow-types.js"
import type { Project } from "../types.js"

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced?.[1]) return fenced[1].trim()
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  const aStart = text.indexOf("[")
  const aEnd = text.lastIndexOf("]")
  if (aStart >= 0 && aEnd > aStart) return text.slice(aStart, aEnd + 1)
  return text
}

export function generateFlowMock(projectName: string): FlowState {
  const lanes = ["担当者", "確認者"]
  const n0 = uid("n")
  const n1 = uid("n")
  const n2 = uid("n")
  const n3 = uid("n")
  const n4 = uid("n")
  return {
    lanes,
    nodes: [
      {
        id: n0,
        type: "step",
        position: { x: 0, y: 0 },
        data: {
          label: "業務開始(トリガー受領)",
          lane: "担当者",
          kind: "start",
          system: "—",
          source: "q4: 開始条件",
        },
      },
      {
        id: n1,
        type: "step",
        position: { x: 0, y: 0 },
        data: {
          label: `${projectName}の準備作業`,
          lane: "担当者",
          kind: "process",
          system: "業務システム",
          source: "q8: 手順1",
        },
      },
      {
        id: n2,
        type: "step",
        position: { x: 0, y: 0 },
        data: {
          label: "メインの作業を実施",
          lane: "担当者",
          kind: "process",
          system: "業務システム",
          source: "q8: 手順2",
        },
      },
      {
        id: n3,
        type: "step",
        position: { x: 0, y: 0 },
        data: {
          label: "内容を確認",
          lane: "確認者",
          kind: "decision",
          system: "—",
          source: "q3: 関係者",
        },
      },
      {
        id: n4,
        type: "step",
        position: { x: 0, y: 0 },
        data: { label: "業務完了", lane: "担当者", kind: "end", system: "—", source: "q6: 終了条件" },
      },
    ],
    edges: [
      { id: uid("e"), source: n0, target: n1 },
      { id: uid("e"), source: n1, target: n2 },
      { id: uid("e"), source: n2, target: n3 },
      { id: uid("e"), source: n3, target: n4 },
    ],
  }
}

function normalizeFlow(raw: unknown, fallbackName: string): FlowState | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as {
    lanes?: unknown
    nodes?: unknown
    edges?: unknown
  }
  if (!Array.isArray(obj.nodes) || obj.nodes.length < 2) return null
  const lanes = Array.isArray(obj.lanes)
    ? obj.lanes.map(String).filter(Boolean)
    : ["担当者"]
  const nodes = obj.nodes.map((n, i) => {
    const node = (n ?? {}) as Record<string, unknown>
    const data = (node.data ?? node) as Record<string, unknown>
    const id = String(node.id ?? `n-${i}`)
    const kindRaw = String(data.kind ?? "process")
    const kind =
      kindRaw === "start" || kindRaw === "end" || kindRaw === "decision" || kindRaw === "process"
        ? kindRaw
        : "process"
    return {
      id,
      type: "step",
      position: { x: 0, y: Number(node.y ?? i * 80) },
      data: {
        label: String(data.label ?? `ステップ${i + 1}`),
        lane: String(data.lane ?? lanes[0] ?? "担当者"),
        kind,
        system: data.system != null ? String(data.system) : undefined,
        source: data.source != null ? String(data.source) : "llm",
      },
    }
  })
  const idSet = new Set(nodes.map((n) => n.id))
  const edges = Array.isArray(obj.edges)
    ? obj.edges
        .map((e, i) => {
          const edge = (e ?? {}) as Record<string, unknown>
          const source = String(edge.source ?? "")
          const target = String(edge.target ?? "")
          if (!idSet.has(source) || !idSet.has(target)) return null
          return { id: String(edge.id ?? `e-${i}`), source, target, label: edge.label ? String(edge.label) : undefined }
        })
        .filter((e): e is NonNullable<typeof e> => !!e)
    : nodes.slice(0, -1).map((n, i) => ({
        id: uid("e"),
        source: n.id,
        target: nodes[i + 1]!.id,
      }))
  if (nodes.length === 0) return generateFlowMock(fallbackName)
  return { lanes: lanes.length ? lanes : ["担当者"], nodes, edges }
}

export async function generateFlowFromLlm(
  project: Project,
  userId: string,
): Promise<{ flow: FlowState; provider: string; tokens: number; usedLlmStructure: boolean }> {
  const adapter = getLlmAdapter()
  const llm = await adapter.complete(
    [
      {
        role: "system",
        content: `業務マニュアル用スイムレーンフローを JSON のみで返せ。形式:
{"lanes":["担当者","確認者"],"nodes":[{"id":"n1","data":{"label":"...","lane":"担当者","kind":"start|process|decision|end","system":"...","source":"..."}}],"edges":[{"id":"e1","source":"n1","target":"n2"}]}
start と end を各1つ含め、ヒアリング回答を反映せよ。`,
      },
      {
        role: "user",
        content: JSON.stringify({
          name: project.name,
          hearingAnswers: project.hearingAnswers,
        }).slice(0, 3500),
      },
    ],
    {
      maxTokens: 2048,
      context: { userId, projectId: project.id, action: "flow_generate" },
    },
  )

  try {
    const parsed = JSON.parse(extractJson(llm.text)) as unknown
    const flow = normalizeFlow(parsed, project.name)
    if (flow) {
      return { flow, provider: llm.provider, tokens: llm.tokens, usedLlmStructure: true }
    }
  } catch {
    /* fallback */
  }

  // モックでもヒアリング由来のラベルを少し反映
  const flow = generateFlowMock(project.name)
  const steps = project.hearingAnswers.find((a) => a.questionId === "q8")?.value
  if (steps) {
    const parts = steps.split(/[、,。\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 3)
    parts.forEach((label, i) => {
      const node = flow.nodes.find((n) => n.data.kind === "process" && n.data.label.includes(i === 0 ? "準備" : "メイン"))
      if (node) {
        node.data.label = label.slice(0, 40)
        node.data.source = "q8"
      }
    })
  }
  return { flow, provider: llm.provider, tokens: llm.tokens, usedLlmStructure: false }
}

export function generateManualSectionsMock(existing: Project) {
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
            text: `${existing.name}の手順概要です。`,
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

function normalizeSections(raw: unknown, project: Project): Project["sections"] | null {
  if (!raw || typeof raw !== "object") return null
  const sections = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { sections?: unknown }).sections)
      ? (raw as { sections: unknown[] }).sections
      : null
  if (!sections || sections.length === 0) return null

  return sections.map((s, i) => {
    const sec = (s ?? {}) as Record<string, unknown>
    const blocksRaw = Array.isArray(sec.blocks) ? sec.blocks : []
    const blocks = blocksRaw.map((b, j) => {
      const block = (b ?? {}) as Record<string, unknown>
      const type = String(block.type ?? "paragraph")
      return {
        id: uid("b"),
        type: type === "step" || type === "warning" || type === "paragraph" ? type : "paragraph",
        text: String(block.text ?? ""),
        needsConfirm: block.needsConfirm === true || block.needsConfirm === "true",
      }
    })
    if (blocks.length === 0) {
      blocks.push({
        id: uid("b"),
        type: "paragraph",
        text: String(sec.title ?? `セクション${i + 1}`),
        needsConfirm: true,
      })
    }
    const deep = project.deepdive[i]
    return {
      id: uid("s"),
      title: String(sec.title ?? deep?.stepLabel ?? `セクション${i + 1}`),
      sectionNumber: String(sec.sectionNumber ?? deep?.sectionNumber ?? `${i + 1}`),
      stepId: sec.stepId != null ? String(sec.stepId) : deep?.stepId,
      status: "draft",
      version: 1,
      blocks,
    }
  }) as Project["sections"]
}

export async function generateManualFromLlm(
  project: Project,
  userId: string,
): Promise<{
  sections: Project["sections"]
  provider: string
  tokens: number
  usedLlmStructure: boolean
}> {
  const adapter = getLlmAdapter()
  const llm = await adapter.complete(
    [
      {
        role: "system",
        content: `業務マニュアルのセクション配列を JSON のみで返せ。形式:
{"sections":[{"title":"...","sectionNumber":"1.1","stepId":"...","blocks":[{"type":"paragraph|step|warning","text":"...","needsConfirm":true}]}]}
推測箇所は needsConfirm:true。深掘り回答を反映し、具体的な手順文にせよ。`,
      },
      {
        role: "user",
        content: JSON.stringify({
          name: project.name,
          deepdive: project.deepdive,
          hearingAnswers: project.hearingAnswers,
        }).slice(0, 4000),
      },
    ],
    {
      maxTokens: 3000,
      context: { userId, projectId: project.id, action: "manual_generate" },
    },
  )

  try {
    const parsed = JSON.parse(extractJson(llm.text)) as unknown
    const sections = normalizeSections(parsed, project)
    if (sections) {
      return { sections, provider: llm.provider, tokens: llm.tokens, usedLlmStructure: true }
    }
  } catch {
    /* fallback */
  }

  const sections = generateManualSectionsMock(project)
  // 深掘り回答を本文に反映
  for (let i = 0; i < sections.length; i++) {
    const d = project.deepdive[i] as { answers?: Array<{ question?: string; answer?: string; value?: string }> } | undefined
    const answers = d?.answers ?? []
    if (answers.length && sections[i]?.blocks) {
      const lines = answers
        .map((a) => {
          const q = a.question ?? ""
          const v = a.answer ?? a.value ?? ""
          return q ? `${q}: ${v}` : v
        })
        .filter(Boolean)
      if (lines.length) {
        sections[i]!.blocks = [
          {
            id: uid("b"),
            type: "paragraph",
            text: lines.join("\n"),
            needsConfirm: true,
          },
          ...(sections[i]!.blocks ?? []).slice(0, 1),
        ]
      }
    }
  }
  return { sections, provider: llm.provider, tokens: llm.tokens, usedLlmStructure: false }
}

export async function regenerateSectionFromLlm(
  project: Project,
  sectionId: string,
  userId: string,
) {
  const section = project.sections.find((s) => s.id === sectionId)
  if (!section) throw new Error("Section not found")

  const adapter = getLlmAdapter()
  const llm = await adapter.complete(
    [
      {
        role: "system",
        content:
          'セクション本文を JSON のみで返せ: {"title":"...","blocks":[{"type":"paragraph|step|warning","text":"...","needsConfirm":true}]}',
      },
      {
        role: "user",
        content: JSON.stringify({
          section,
          deepdive: project.deepdive.find((d) => d.stepId === (section as { stepId?: string }).stepId),
          flowNode: (project.flow as FlowState)?.nodes?.find(
            (n) => n.id === (section as { stepId?: string }).stepId,
          ),
        }).slice(0, 3000),
      },
    ],
    {
      maxTokens: 1500,
      context: { userId, projectId: project.id, action: "section_regenerate" },
    },
  )

  const prevVersion = Number((section as { version?: number }).version ?? 1)
  try {
    const parsed = JSON.parse(extractJson(llm.text)) as {
      title?: string
      blocks?: Array<{ type?: string; text?: string; needsConfirm?: boolean }>
    }
    if (parsed.blocks?.length) {
      return {
        section: {
          ...section,
          title: parsed.title ?? section.title,
          status: "draft",
          version: prevVersion + 1,
          updatedAt: new Date().toISOString().slice(0, 10),
          blocks: parsed.blocks.map((b) => ({
            id: uid("b"),
            type: b.type === "step" || b.type === "warning" ? b.type : "paragraph",
            text: String(b.text ?? ""),
            needsConfirm: !!b.needsConfirm,
          })),
          syncStatus: "ok",
        },
        provider: llm.provider,
        tokens: llm.tokens,
      }
    }
  } catch {
    /* fallback below */
  }

  const { regenerateSectionMock } = await import("./manual.js")
  return {
    section: regenerateSectionMock(project, sectionId),
    provider: llm.provider,
    tokens: llm.tokens,
  }
}
