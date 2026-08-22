import {
  BLOCK_TYPE_GUIDE,
  MANUAL_AUTHOR_ROLE,
  PROMPT_VERSION,
  SLIDE_BODY_TEMPLATE,
  WRITING_RULES,
} from "./style-guide.js"
import { SECTION_JSON_SCHEMA } from "./schemas.js"
import { formatGoldSectionForPrompt } from "./reference-examples.js"
import { truncateJson } from "./context.js"

export function buildSectionRegenerationSystemPrompt(): string {
  return [
    MANUAL_AUTHOR_ROLE,
    "",
    `プロンプト版: ${PROMPT_VERSION}`,
    "タスク: 指定セクションの title と blocks を、参考マニュアル文体で再生成する。",
    "出力は JSON のみ: { title, blocks[] }",
    "",
    SLIDE_BODY_TEMPLATE,
    "",
    JSON.stringify(BLOCK_TYPE_GUIDE, null, 2),
    "",
    ...WRITING_RULES.map((r, i) => `${i + 1}. ${r}`),
    "",
    JSON.stringify(SECTION_JSON_SCHEMA, null, 2),
    "",
    "参考例:",
    formatGoldSectionForPrompt(),
  ].join("\n")
}

export function buildSectionRegenerationUserPrompt(input: {
  section: unknown
  deepdiveItem?: unknown
  flowNode?: unknown
  projectName: string
}): string {
  return truncateJson(
    {
      projectName: input.projectName,
      section: input.section,
      deepdive: input.deepdiveItem,
      flowNode: input.flowNode,
      instruction: "既存 title/sectionNumber は維持し、blocks のみ参考例品質で書き直せ。",
    },
    3200,
  )
}

export function buildSectionRegenerationMessages(input: Parameters<typeof buildSectionRegenerationUserPrompt>[0]) {
  return [
    { role: "system" as const, content: buildSectionRegenerationSystemPrompt() },
    { role: "user" as const, content: buildSectionRegenerationUserPrompt(input) },
  ]
}
