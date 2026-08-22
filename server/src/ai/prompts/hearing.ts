import { MANUAL_AUTHOR_ROLE, PROMPT_VERSION } from "./style-guide.js"
import { truncateJson } from "./context.js"
import type { Project } from "../../types.js"
import { BASE_QUESTIONS } from "../hearing-questions.js"

export function buildHearingNextSystemPrompt(): string {
  return [
    MANUAL_AUTHOR_ROLE,
    "",
    `プロンプト版: ${PROMPT_VERSION}`,
    "タスク: 骨組みヒアリングの回答を分析し、矛盾があれば短く指摘し、追加で聞くべきことがあれば1文で提案する。",
    "出力は JSON のみ: { contradiction: string | null, followUp: string | null }",
    "",
    "ルール:",
    "- contradiction は回答間の明らかな矛盾のみ（推測で煽らない）",
    "- followUp は次の base 質問の補足として有用な追加質問1件のみ。不要なら null",
    "- 追加質問は最大2件まで（サーバ側で制御）。ここでは1文提案のみ",
  ].join("\n")
}

export function buildHearingNextUserPrompt(project: Project, nextBaseId: string | null): string {
  return truncateJson(
    {
      project: project.name,
      answers: (project.hearingAnswers ?? []).map((a) => ({
        questionId: a.questionId,
        question: a.questionText ?? BASE_QUESTIONS.find((q) => q.id === a.questionId)?.text ?? a.questionId,
        value: a.value,
        status: a.status,
      })),
      nextBaseId,
      baseQuestions: BASE_QUESTIONS.map((q) => ({ id: q.id, text: q.text, type: q.type })),
    },
    2800,
  )
}

export function buildHearingNextMessages(project: Project, nextBaseId: string | null) {
  return [
    { role: "system" as const, content: buildHearingNextSystemPrompt() },
    { role: "user" as const, content: buildHearingNextUserPrompt(project, nextBaseId) },
  ]
}
