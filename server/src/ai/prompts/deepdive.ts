import { MANUAL_AUTHOR_ROLE, PROMPT_VERSION } from "./style-guide.js"
import { truncateJson } from "./context.js"

export function buildDeepdiveQuestionsSystemPrompt(): string {
  return [
    MANUAL_AUTHOR_ROLE,
    "",
    `プロンプト版: ${PROMPT_VERSION}`,
    "タスク: 深掘りヒアリング用の質問を、ステップの重要度に応じて生成する。",
    "出力は JSON のみ: { questions: string[] }",
    "",
    "ルール:",
    "- high: 5〜6問（システム/画面、手順、判断基準、注意、例外）",
    "- normal: 3〜4問（ファイル/システム、作業内容、注意）",
    "- low: 1〜2問（作業概要）",
    "- 既に回答済みの内容は繰り返さない",
    "- 各質問は1文・具体的・現場で答えやすい表現",
  ].join("\n")
}

export function buildDeepdiveQuestionsUserPrompt(input: {
  projectName: string
  stepLabel: string
  importance: string
  existingAnswers: Array<{ question?: string; value?: string; answer?: string }>
}): string {
  return truncateJson(
    {
      project: input.projectName,
      step: input.stepLabel,
      importance: input.importance,
      answered: input.existingAnswers.map((a) => ({
        question: a.question,
        value: a.answer ?? a.value ?? "",
      })),
    },
    2200,
  )
}

export function buildDeepdiveQuestionsMessages(
  input: Parameters<typeof buildDeepdiveQuestionsUserPrompt>[0],
) {
  return [
    { role: "system" as const, content: buildDeepdiveQuestionsSystemPrompt() },
    { role: "user" as const, content: buildDeepdiveQuestionsUserPrompt(input) },
  ]
}
