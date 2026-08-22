import type { HearingAnswer, Project } from "../types.js"
import { getLlmAdapter } from "../llm/adapter.js"
import { BASE_QUESTIONS, hearingQuestionText } from "./hearing-questions.js"
import {
  buildDeepdiveQuestionsMessages,
  buildHearingNextMessages,
} from "./prompts/index.js"
import { extractJson } from "./structured.js"

/** 追加質問は無制限に増やさない */
const MAX_FOLLOW_UPS = 2

export { BASE_QUESTIONS, hearingQuestionText }

export async function nextHearingQuestion(
  project: Project,
  userId: string,
): Promise<{
  question: { id: string; text: string; type: string } | null
  done: boolean
  contradictionHint: string | null
  provider: string
  tokens: number
}> {
  const answeredIds = new Set(project.hearingAnswers.map((a) => a.questionId))
  const nextBase = BASE_QUESTIONS.find((q) => !answeredIds.has(q.id))

  const adapter = getLlmAdapter()
  const llm = await adapter.complete(buildHearingNextMessages(project, nextBase?.id ?? null), {
    context: { userId, projectId: project.id, action: "hearing_next" },
  })

  let contradictionHint: string | null = null
  let followUp: string | null = null
  try {
    const parsed = JSON.parse(extractJson(llm.text)) as {
      contradiction?: string
      followUp?: string
    }
    contradictionHint = parsed.contradiction?.trim() || null
    followUp = parsed.followUp?.trim() || null
  } catch {
    if (llm.provider === "mock" && project.hearingAnswers.length >= 2) {
      const vals = project.hearingAnswers.map((a) => a.value)
      if (vals.some((v) => /毎日|日次/.test(v)) && vals.some((v) => /年1|年次/.test(v))) {
        contradictionHint = "頻度の回答に矛盾がある可能性があります。"
      }
    }
  }

  if (!nextBase) {
    const followUpCount = project.hearingAnswers.filter((a) =>
      a.questionId.startsWith("follow-up"),
    ).length
    if (followUp && followUpCount < MAX_FOLLOW_UPS) {
      return {
        question: { id: `follow-up-${Date.now()}`, text: followUp, type: "text" },
        done: false,
        contradictionHint,
        provider: llm.provider,
        tokens: llm.tokens,
      }
    }
    return {
      question: null,
      done: true,
      contradictionHint,
      provider: llm.provider,
      tokens: llm.tokens,
    }
  }

  return {
    question: nextBase,
    done: false,
    contradictionHint,
    provider: llm.provider,
    tokens: llm.tokens,
  }
}

export async function generateDeepdiveQuestions(input: {
  projectName: string
  projectId: string
  userId: string
  stepLabel: string
  importance: string
  existingAnswers: HearingAnswer[] | Array<{ question?: string; value?: string }>
}): Promise<{ questions: string[]; provider: string; tokens: number }> {
  const adapter = getLlmAdapter()
  const llm = await adapter.complete(
    buildDeepdiveQuestionsMessages({
      projectName: input.projectName,
      stepLabel: input.stepLabel,
      importance: input.importance,
      existingAnswers: input.existingAnswers,
    }),
    {
      context: {
        userId: input.userId,
        projectId: input.projectId,
        action: "deepdive_questions",
      },
    },
  )

  try {
    const parsed = JSON.parse(extractJson(llm.text)) as { questions?: string[] }
    if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      return { questions: parsed.questions.slice(0, 6), provider: llm.provider, tokens: llm.tokens }
    }
  } catch {
    /* fallback below */
  }

  const byImportance: Record<string, string[]> = {
    high: [
      `「${input.stepLabel}」で使うシステム・画面は？`,
      "具体的な操作手順を順に教えてください。",
      "判断に迷うポイントと判断基準は？",
      "よくあるミスや注意点は？",
      "例外ケースの対応は？",
    ],
    normal: [
      `「${input.stepLabel}」で使うファイル・システムは？`,
      "具体的な作業内容を教えてください。",
      "注意点があれば教えてください。",
    ],
    low: [`「${input.stepLabel}」の作業内容を簡単に教えてください。`],
  }
  return {
    questions: byImportance[input.importance] ?? byImportance.normal,
    provider: llm.provider,
    tokens: llm.tokens,
  }
}
