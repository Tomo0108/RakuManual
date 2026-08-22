import {
  FLOW_RULES,
  MANUAL_AUTHOR_ROLE,
  PROMPT_VERSION,
} from "./style-guide.js"
import { FLOW_JSON_SCHEMA } from "./schemas.js"
import { formatGoldFlowForPrompt } from "./reference-examples.js"
import { buildHearingContext, truncateJson, type HearingContextItem } from "./context.js"

export function buildFlowGenerationSystemPrompt(): string {
  return [
    MANUAL_AUTHOR_ROLE,
    "",
    `プロンプト版: ${PROMPT_VERSION}`,
    "タスク: ヒアリング回答からスイムレーン業務フロー図の JSON を生成する。",
    "出力は JSON のみ。説明文・Markdown・コードフェンスは禁止。",
    "",
    "## 出力スキーマ",
    JSON.stringify(FLOW_JSON_SCHEMA, null, 2),
    "",
    "## フロー設計ルール",
    ...FLOW_RULES.map((r, i) => `${i + 1}. ${r}`),
    "",
    "## 参考例（粒度・命名の目安）",
    formatGoldFlowForPrompt(),
  ].join("\n")
}

export function buildFlowGenerationUserPrompt(input: {
  projectName: string
  hearingAnswers: HearingContextItem[]
}): string {
  return truncateJson(
    {
      projectName: input.projectName,
      hearingAnswers: input.hearingAnswers,
      instruction:
        "q8 の手順と q9 の分岐を process/decision ノードに反映せよ。関係者(q5)を lanes に。トリガー(q4)を start、完了(q7)を end に。",
    },
    3800,
  )
}

export function buildFlowMessages(projectName: string, hearingAnswers: HearingContextItem[]) {
  return [
    { role: "system" as const, content: buildFlowGenerationSystemPrompt() },
    {
      role: "user" as const,
      content: buildFlowGenerationUserPrompt({ projectName, hearingAnswers }),
    },
  ]
}

export function buildFlowGenerationPayload(project: {
  name: string
  hearingAnswers: Parameters<typeof buildHearingContext>[0]["hearingAnswers"]
}) {
  const hearingAnswers = buildHearingContext({
    name: project.name,
    hearingAnswers: project.hearingAnswers,
  } as Parameters<typeof buildHearingContext>[0])
  return {
    messages: buildFlowMessages(project.name, hearingAnswers),
    hearingAnswers,
  }
}
