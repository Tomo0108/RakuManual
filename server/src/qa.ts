import type { Project } from "./types.js"

export interface QASource {
  projectId: string
  projectName: string
  section: string
  sectionId: string
}

export interface QAAnswer {
  text: string
  source?: QASource
  noSource: boolean
}

interface IndexedChunk {
  projectId: string
  projectName: string
  sectionId: string
  sectionLabel: string
  text: string
  keywords: string[]
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s、。．，,.!?！？「」()（）\-_/]+/)
    .filter((t) => t.length >= 2)
}

function indexPublishedProjects(projects: Project[]): IndexedChunk[] {
  const chunks: IndexedChunk[] = []
  for (const project of projects) {
    if (project.status !== "published") continue
    const sections = (project.publishedSections ?? project.sections) as Array<{
      id: string
      title?: string
      sectionNumber?: string
      blocks?: Array<{ text?: string }>
    }>
    for (const section of sections) {
      const label = section.sectionNumber
        ? `${section.sectionNumber} ${section.title ?? ""}`.trim()
        : (section.title ?? "セクション")
      const body = (section.blocks ?? []).map((b) => b.text ?? "").join("\n")
      const text = `${label}\n${body}`.trim()
      if (!text) continue
      chunks.push({
        projectId: project.id,
        projectName: project.name,
        sectionId: section.id,
        sectionLabel: label,
        text,
        keywords: tokenize(`${label} ${body} ${project.name}`),
      })
    }
  }
  return chunks
}

export function answerQuestion(question: string, projects: Project[]): QAAnswer {
  const q = question.trim().toLowerCase()
  if (!q) {
    return {
      text: "質問を入力してください。",
      noSource: true,
    }
  }

  const chunks = indexPublishedProjects(projects)
  if (chunks.length === 0) {
    return {
      text: "公開済みマニュアルがまだありません。マニュアルが公開されると、ここから回答できるようになります。",
      noSource: true,
    }
  }

  const qTokens = tokenize(q)
  let best: { chunk: IndexedChunk; score: number } | null = null

  for (const chunk of chunks) {
    let score = 0
    for (const token of qTokens) {
      if (chunk.keywords.some((k) => k.includes(token) || token.includes(k))) score += 2
      if (chunk.text.toLowerCase().includes(token)) score += 1
    }
    if (!best || score > best.score) best = { chunk, score }
  }

  if (!best || best.score < 2) {
    return {
      text: "該当する公開マニュアルが見つかりません。推測での回答は行わない設計のため、お答えできません。この質問はマニュアル整備の需要シグナルとして記録されます。",
      noSource: true,
    }
  }

  const excerpt = best.chunk.text.slice(0, 280).replace(/\n+/g, " ")
  return {
    text: excerpt.length < best.chunk.text.length ? `${excerpt}…` : excerpt,
    source: {
      projectId: best.chunk.projectId,
      projectName: best.chunk.projectName,
      section: best.chunk.sectionLabel,
      sectionId: best.chunk.sectionId,
    },
    noSource: false,
  }
}
