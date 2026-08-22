import { PROMPT_VERSION, WRITING_RULES } from "./style-guide.js"
import { GOLD_SECTION_BLOCKS } from "./reference-examples.js"
import { postProcessBlock } from "./post-process.js"
import { buildFlowGenerationSystemPrompt } from "./flow.js"
import { buildManualGenerationSystemPrompt } from "./manual.js"

export type PromptValidationIssue = {
  level: "error" | "warn"
  code: string
  message: string
}

export type PromptValidationResult = {
  ok: boolean
  promptVersion: string
  issues: PromptValidationIssue[]
}

/** プロンプト定義自体の健全性（API 呼び出しなし） */
export function validatePromptDefinitions(): PromptValidationResult {
  const issues: PromptValidationIssue[] = []

  const flowSys = buildFlowGenerationSystemPrompt()
  const manualSys = buildManualGenerationSystemPrompt()

  if (!flowSys.includes(PROMPT_VERSION)) {
    issues.push({ level: "error", code: "flow_version", message: "フロープロンプトに PROMPT_VERSION が無い" })
  }
  if (!manualSys.includes(PROMPT_VERSION)) {
    issues.push({ level: "error", code: "manual_version", message: "マニュアルプロンプトに PROMPT_VERSION が無い" })
  }
  if (!manualSys.includes("※")) {
    issues.push({ level: "error", code: "manual_note_symbol", message: "マニュアルプロンプトに ※ ルールが無い" })
  }
  if (!manualSys.includes("JSON のみ")) {
    issues.push({ level: "error", code: "manual_json_only", message: "JSON のみ出力指示が無い" })
  }
  if (WRITING_RULES.length < 5) {
    issues.push({ level: "warn", code: "writing_rules_short", message: "執筆ルールが少なすぎる" })
  }
  if (!manualSys.includes(GOLD_SECTION_BLOCKS.blocks[1]!.text.slice(0, 20))) {
    issues.push({ level: "warn", code: "gold_example", message: "gold 例がプロンプトに含まれていない可能性" })
  }

  return {
    ok: issues.every((i) => i.level !== "error"),
    promptVersion: PROMPT_VERSION,
    issues,
  }
}

export type SectionValidationInput = {
  title?: string
  sectionNumber?: string
  blocks?: Array<{ type?: string; text?: string; needsConfirm?: boolean }>
}

/** LLM 出力（または mock）の sections 品質チェック */
export function validateGeneratedSection(section: SectionValidationInput): PromptValidationIssue[] {
  const issues: PromptValidationIssue[] = []
  const blocks = section.blocks ?? []

  if (blocks.length === 0) {
    issues.push({ level: "error", code: "empty_blocks", message: "blocks が空" })
    return issues
  }

  const first = postProcessBlock(blocks[0] ?? {})
  if (first.type !== "paragraph") {
    issues.push({ level: "warn", code: "first_not_paragraph", message: "先頭 block が paragraph でない" })
  }

  const hasNote = blocks.some((b) => postProcessBlock(b).type === "note")
  const hasStep = blocks.some((b) => postProcessBlock(b).type === "step")
  if (!hasStep) {
    issues.push({ level: "warn", code: "no_steps", message: "操作 step block が無い" })
  }

  for (const [i, raw] of blocks.entries()) {
    const b = postProcessBlock(raw)
    if (!b.text.trim()) {
      issues.push({ level: "error", code: "empty_text", message: `block[${i}] が空` })
    }
    if (b.type === "note" && !b.text.startsWith("※")) {
      issues.push({ level: "error", code: "note_prefix", message: `block[${i}] の note が ※ で始まっていない` })
    }
    if (b.needsConfirm && b.type === "paragraph" && i === 0) {
      issues.push({ level: "warn", code: "heading_needs_confirm", message: "見出しが needsConfirm" })
    }
  }

  if (section.sectionNumber && section.title && !section.title.includes(section.sectionNumber.replace(/\.$/, ""))) {
    issues.push({ level: "warn", code: "title_number_mismatch", message: "title と sectionNumber が不一致の可能性" })
  }

  if (!hasNote && blocks.length > 2) {
    issues.push({ level: "warn", code: "no_caution", message: "注意（note）block が無い" })
  }

  return issues
}

export function validateGeneratedSections(
  sections: SectionValidationInput[],
): { ok: boolean; issues: PromptValidationIssue[] } {
  const issues: PromptValidationIssue[] = []
  if (sections.length === 0) {
    issues.push({ level: "error", code: "no_sections", message: "sections が空" })
  }
  sections.forEach((sec, idx) => {
    for (const issue of validateGeneratedSection(sec)) {
      issues.push({ ...issue, message: `[${idx}] ${issue.message}` })
    }
  })
  return { ok: !issues.some((i) => i.level === "error"), issues }
}

/** gold 例が post-process を通して要件を満たすこと（回帰テスト用） */
export function validateGoldExample(): PromptValidationIssue[] {
  return validateGeneratedSection({
    title: GOLD_SECTION_BLOCKS.title,
    sectionNumber: GOLD_SECTION_BLOCKS.sectionNumber,
    blocks: GOLD_SECTION_BLOCKS.blocks,
  })
}
