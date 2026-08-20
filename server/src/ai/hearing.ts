import type { HearingAnswer, Project } from "../types.js"
import { getLlmAdapter } from "../llm/adapter.js"

/**
 * 骨組みヒアリングの設問マスタ。
 * app/src/lib/mock-data.ts の HEARING_QUESTIONS と同じ ID = 同じ質問に揃える。
 */
export const BASE_QUESTIONS = [
  { id: "q1", text: "これからマニュアル化する業務の名前を教えてください。", type: "text" },
  { id: "q2", text: "この業務の目的はなんですか?この業務が完了すると、何が達成されますか?", type: "text" },
  { id: "q3", text: "この業務はどのくらいの頻度で発生しますか?", type: "choice" },
  { id: "q4", text: "業務の開始のきっかけ(トリガー)はなんですか?", type: "text" },
  { id: "q5", text: "この業務には誰が関わりますか?当てはまるものをすべて選んでください。", type: "multi" },
  { id: "q6", text: "誰から仕事を受け取り、完了後は誰に渡しますか?", type: "text" },
  { id: "q7", text: "業務が「完了した」と言える状態はどんな状態ですか?", type: "text" },
  { id: "q8", text: "業務のおおまかな手順を、思いつく順で構わないので教えてください。", type: "text" },
  { id: "q9", text: "途中で判断が分かれるポイント(条件分岐)はありますか?", type: "text" },
  { id: "q10", text: "例外的なケースや、イレギュラー対応があれば教えてください。", type: "text" },
]

/** 追加質問は無制限に増やさない */
const MAX_FOLLOW_UPS = 2

export function hearingQuestionText(questionId: string): string | undefined {
  return BASE_QUESTIONS.find((q) => q.id === questionId)?.text
}

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
  const llm = await adapter.complete(
    [
      {
        role: "system",
        content:
          "業務マニュアル作成のヒアリング支援。矛盾があれば短く指摘し、次に聞くべき追加質問があれば1文で提案せよ。JSONのみで {contradiction, followUp} を返す。",
      },
      {
        role: "user",
        content: JSON.stringify({
          project: project.name,
          answers: project.hearingAnswers.map((a) => ({
            question: a.questionText ?? hearingQuestionText(a.questionId) ?? a.questionId,
            value: a.value,
            status: a.status,
          })),
          nextBaseId: nextBase?.id ?? null,
        }).slice(0, 2500),
      },
    ],
    { context: { userId, projectId: project.id, action: "hearing_next" } },
  )

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
    [
      {
        role: "system",
        content:
          "深掘りヒアリング用の質問を重要度に応じて生成せよ。JSONのみで {questions: string[]} を返す。",
      },
      {
        role: "user",
        content: JSON.stringify({
          project: input.projectName,
          step: input.stepLabel,
          importance: input.importance,
          answered: input.existingAnswers,
        }).slice(0, 2000),
      },
    ],
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

function extractJson(text: string): string {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text
}
