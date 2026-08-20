import type { ManualBlock, Project } from "../types.js"

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function mockBlocksForStep(label: string, sectionNumber?: string): ManualBlock[] {
  return [
    {
      id: uid("b"),
      type: "paragraph",
      text: `「${label}」の手順を説明します。（AI再生成）`,
    },
    {
      id: uid("b"),
      type: "step",
      text: `${sectionNumber ? `項番 ${sectionNumber}: ` : ""}${label}を実施します。`,
      needsConfirm: true,
    },
  ]
}

export function regenerateSectionMock(project: Project, sectionId: string) {
  const section = project.sections.find((s) => s.id === sectionId)
  if (!section) throw new Error("Section not found")

  const flow = project.flow as {
    nodes?: Array<{ id: string; data?: { label?: string; sectionNumber?: string; kind?: string } }>
  }
  const node = flow.nodes?.find((n) => n.id === (section as { stepId?: string }).stepId)
  const label = node?.data?.label ?? String((section as { title?: string }).title ?? "")
  const sectionNumber = node?.data?.sectionNumber ?? (section as { sectionNumber?: string }).sectionNumber
  const prevVersion = Number((section as { version?: number }).version ?? 1)

  return {
    ...section,
    title: label,
    sectionNumber,
    status: "draft",
    version: prevVersion + 1,
    updatedAt: todayStamp(),
    blocks: mockBlocksForStep(label, sectionNumber),
    syncStatus: "ok",
    sourceSnapshot: node?.data
      ? { label, sectionNumber, kind: node.data.kind }
      : (section as { sourceSnapshot?: unknown }).sourceSnapshot,
  }
}
