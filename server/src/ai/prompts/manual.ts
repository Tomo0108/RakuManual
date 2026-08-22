import {
  BLOCK_TYPE_GUIDE,
  MANUAL_AUTHOR_ROLE,
  PROMPT_VERSION,
  SLIDE_BODY_TEMPLATE,
  WRITING_RULES,
} from "./style-guide.js"
import { MANUAL_JSON_SCHEMA } from "./schemas.js"
import { formatGoldSectionForPrompt } from "./reference-examples.js"
import {
  buildDeepdiveContext,
  buildFlowSummary,
  buildHearingContext,
  truncateJson,
} from "./context.js"

export function buildManualGenerationSystemPrompt(): string {
  return [
    MANUAL_AUTHOR_ROLE,
    "",
    `プロンプト版: ${PROMPT_VERSION}`,
    "タスク: 深掘りヒアリング回答とフロー情報から、営業向け業務マニュアルの sections 配列 JSON を生成する。",
    "出力は JSON のみ。説明文・Markdown・コードフェンスは禁止。",
    "",
    "## 1スライド（1中項目）の本文構造",
    SLIDE_BODY_TEMPLATE,
    "",
    "## block type",
    JSON.stringify(BLOCK_TYPE_GUIDE, null, 2),
    "",
    "## 執筆ルール（MUST）",
    ...WRITING_RULES.map((r, i) => `${i + 1}. ${r}`),
    "",
    "## 出力スキーマ",
    JSON.stringify(MANUAL_JSON_SCHEMA, null, 2),
    "",
    "## 参考例（品質の gold standard）",
    formatGoldSectionForPrompt(),
    "",
    "## 生成方針",
    "- deepdive の各項目を原則1 section に対応させる（stepId を必ず含める）",
    "- 深掘り answers の Q&A を step/note に落とし込む。推測で補った文は needsConfirm:true",
    "- majorTitle は q1 の業務名、mediumTitle は操作の短い見出し",
    "- sectionNumber は deepdive.sectionNumber またはフロー項番と一致させる",
    "- 画像は生成しない。画面操作は step として文章化する",
  ].join("\n")
}

export function buildManualGenerationUserPrompt(project: {
  name: string
  hearingAnswers: unknown
  deepdive: unknown
  flow?: unknown
}): string {
  const hearing = buildHearingContext(project as Parameters<typeof buildHearingContext>[0])
  const deepdive = buildDeepdiveContext(project as Parameters<typeof buildDeepdiveContext>[0])
  const flowSummary = buildFlowSummary(project as Parameters<typeof buildFlowSummary>[0])

  return truncateJson(
    {
      projectName: project.name,
      businessName:
        hearing.find((a) => a.id === "q1")?.value?.trim() || project.name,
      hearingHighlights: {
        purpose: hearing.find((a) => a.id === "q2")?.value,
        trigger: hearing.find((a) => a.id === "q4")?.value,
        stakeholders: hearing.find((a) => a.id === "q5")?.value,
        completion: hearing.find((a) => a.id === "q7")?.value,
        roughSteps: hearing.find((a) => a.id === "q8")?.value,
        branches: hearing.find((a) => a.id === "q9")?.value,
        exceptions: hearing.find((a) => a.id === "q10")?.value,
      },
      deepdive,
      flowSummary,
      instruction:
        "各 deepdive 項目について、参考例と同じトーンで sections を生成せよ。空の answers は hearing から合理的に補うが needsConfirm:true とする。",
    },
    4500,
  )
}

export function buildManualGenerationMessages(project: Parameters<typeof buildManualGenerationUserPrompt>[0]) {
  return [
    { role: "system" as const, content: buildManualGenerationSystemPrompt() },
    { role: "user" as const, content: buildManualGenerationUserPrompt(project) },
  ]
}
