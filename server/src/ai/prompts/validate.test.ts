import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { GOLD_SECTION_BLOCKS } from "./reference-examples.js"
import { postProcessBlock } from "./post-process.js"
import { buildManualGenerationSystemPrompt } from "./manual.js"
import { buildFlowGenerationSystemPrompt } from "./flow.js"
import {
  validateGoldExample,
  validateGeneratedSection,
  validatePromptDefinitions,
} from "./validate.js"
import { buildHearingNextSystemPrompt } from "./hearing.js"
import { buildDeepdiveQuestionsSystemPrompt } from "./deepdive.js"

describe("prompt definitions", () => {
  it("includes version and JSON-only instruction", () => {
    const result = validatePromptDefinitions()
    assert.equal(result.ok, true, result.issues.map((i) => i.message).join("; "))
  })

  it("flow system prompt contains lanes and decision rules", () => {
    const sys = buildFlowGenerationSystemPrompt()
    assert.match(sys, /decision/)
    assert.match(sys, /lanes/)
    assert.match(sys, /JSON のみ/)
  })

  it("manual system prompt contains writing rules and gold example", () => {
    const sys = buildManualGenerationSystemPrompt()
    assert.match(sys, /※/)
    assert.match(sys, /「」/)
    assert.match(sys, /してください/)
    assert.match(sys, /「〜すること」で終えない/)
    assert.ok(sys.includes(GOLD_SECTION_BLOCKS.blocks[1]!.text.slice(0, 15)))
  })

  it("hearing/deepdive prompts include version and JSON-only", () => {
    const hearing = buildHearingNextSystemPrompt()
    const deepdive = buildDeepdiveQuestionsSystemPrompt()
    assert.match(hearing, /JSON のみ/)
    assert.match(deepdive, /JSON のみ/)
    assert.match(deepdive, /重要度/)
  })
})

describe("post-process", () => {
  it("adds ※ prefix to note blocks", () => {
    const b = postProcessBlock({ type: "note", text: "機器のみの場合は製品を選択" })
    assert.ok(b.text.startsWith("※"))
  })

  it("maps warning to note", () => {
    const b = postProcessBlock({ type: "warning", text: "注意事項" })
    assert.equal(b.type, "note")
    assert.ok(b.text.startsWith("※"))
  })

  it("adds ・ prefix to step blocks", () => {
    const b = postProcessBlock({ type: "step", text: "保存ボタンをクリック" })
    assert.ok(b.text.startsWith("・"))
  })

  it("converts step ending すること to してください", () => {
    const b = postProcessBlock({ type: "step", text: "保存すること" })
    assert.equal(b.text, "・保存してください。")
  })

  it("converts しないこと to しないでください", () => {
    const b = postProcessBlock({ type: "step", text: "自動入力項目を変更しないこと。" })
    assert.equal(b.text, "・自動入力項目を変更しないでください。")
  })

  it("preserves 確認すること in completion check phrasing", () => {
    const b = postProcessBlock({
      type: "step",
      text: "保存済みになっていることを確認すること",
    })
    assert.equal(b.text, "・保存済みになっていることを確認してください。")
  })

  it("does not rewrite paragraph endings", () => {
    const b = postProcessBlock({ type: "paragraph", text: "保存すること" })
    assert.equal(b.text, "保存すること")
  })

  it("preserves needsConfirm through post-process", () => {
    const b = postProcessBlock({ type: "step", text: "保存すること", needsConfirm: true })
    assert.equal(b.needsConfirm, true)
    assert.equal(b.text, "・保存してください。")
  })
})

describe("validateGeneratedSection", () => {
  it("accepts gold example", () => {
    const issues = validateGoldExample()
    assert.equal(issues.filter((i) => i.level === "error").length, 0)
  })

  it("rejects empty blocks", () => {
    const issues = validateGeneratedSection({ title: "t", blocks: [] })
    assert.ok(issues.some((i) => i.code === "empty_blocks"))
  })

  it("warns when no step blocks", () => {
    const issues = validateGeneratedSection({
      title: "1.1　テスト",
      blocks: [{ type: "paragraph", text: "1.1　テスト" }],
    })
    assert.ok(issues.some((i) => i.code === "no_steps"))
  })
})
