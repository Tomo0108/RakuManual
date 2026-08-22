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
    assert.ok(sys.includes(GOLD_SECTION_BLOCKS.blocks[1]!.text.slice(0, 15)))
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
