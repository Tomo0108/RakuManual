import assert from "node:assert/strict"
import { before, describe, it } from "node:test"
import type { Project } from "../types.js"
import { getDb } from "../db.js"
import { generateFlowMock, generateFlowFromLlm, generateManualFromLlm } from "./structured.js"
import { generateDeepdiveQuestions, nextHearingQuestion } from "./hearing.js"
import { validateGeneratedSections } from "./prompts/validate.js"
import { buildHearingNextSystemPrompt } from "./prompts/hearing.js"
import { buildDeepdiveQuestionsSystemPrompt } from "./prompts/deepdive.js"
import { applyManualRegenWithLlm, buildRegenPlan } from "./manual-regen.js"

const TEST_USER = "u-test"

before(() => {
  const db = getDb()
  db.prepare("INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)").run(
    TEST_USER,
    "Pipeline Test",
    "pipeline-test@rakumanual.local",
  )
})

function fixtureProject(): Project {
  return {
    id: "p-fixture",
    name: "ROS発注",
    status: "deepdive",
    hearingAnswers: [
      { questionId: "q1", questionText: "業務名", value: "ROS発注", status: "confirmed" },
      {
        questionId: "q8",
        questionText: "手順",
        value: "商品タイプを選択する、発注情報を入力する、内容を確認する",
        status: "confirmed",
      },
    ],
    flow: generateFlowMock("ROS発注"),
    deepdive: [],
    sections: [],
    history: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  } as Project
}

function scaffoldDeepdive(project: Project): Project {
  const flow = project.flow as ReturnType<typeof generateFlowMock>
  const majorTitle = project.hearingAnswers.find((a) => a.questionId === "q1")?.value ?? project.name
  const deepdive = flow.nodes
    .filter((n) => n.data.kind === "process" || n.data.kind === "decision")
    .map((n) => ({
      stepId: n.id,
      stepLabel: n.data.label,
      sectionNumber: n.data.sectionNumber,
      majorTitle,
      mediumTitle: n.data.lane,
      importance: "normal" as const,
      status: "not-started" as const,
      answers: [],
    }))
  return { ...project, deepdive, status: "deepdive" }
}

describe("prompt integration (mock LLM, no API cost)", () => {
  it("hearing/deepdive system prompts include version", () => {
    assert.match(buildHearingNextSystemPrompt(), /プロンプト版/)
    assert.match(buildDeepdiveQuestionsSystemPrompt(), /深掘りヒアリング/)
  })

  it("hearing next question returns base question without contradiction", async () => {
    const project = fixtureProject()
    const result = await nextHearingQuestion(project, TEST_USER)
    assert.equal(result.done, false)
    assert.ok(result.question?.id.startsWith("q"))
  })

  it("deepdive questions returns importance-based list", async () => {
    const result = await generateDeepdiveQuestions({
      projectName: "ROS発注",
      projectId: "p-fixture",
      userId: TEST_USER,
      stepLabel: "商品タイプ選択",
      importance: "normal",
      existingAnswers: [],
    })
    assert.ok(result.questions.length >= 2)
  })
})

describe("generation pipeline (mock LLM)", () => {
  it("flow → deepdive scaffold → manual sections passes validation", async () => {
    let project = fixtureProject()
    const flowResult = await generateFlowFromLlm(project, TEST_USER)
    assert.ok(flowResult.flow.nodes.length >= 3)
    project = { ...project, flow: flowResult.flow, status: "flow" }

    project = scaffoldDeepdive(project)
    assert.ok(project.deepdive.length > 0)

    const manualResult = await generateManualFromLlm(project, TEST_USER)
    const validation = validateGeneratedSections(
      manualResult.sections.map((s) => ({
        title: String((s as { title?: string }).title),
        sectionNumber: (s as { sectionNumber?: string }).sectionNumber,
        blocks: (s as { blocks?: unknown[] }).blocks as Array<{ type?: string; text?: string }>,
      })),
    )
    assert.equal(validation.ok, true, validation.issues.map((i) => i.message).join("; "))
    assert.ok(manualResult.sections.length >= project.deepdive.length)
  })

  it("manual regen batch regenerates needs_review sections", async () => {
    let project = scaffoldDeepdive(fixtureProject())
    const manualResult = await generateManualFromLlm(project, TEST_USER)
    project = {
      ...project,
      sections: manualResult.sections.map((s, i) => ({
        ...s,
        syncStatus: i === 0 ? "needs_review" : "ok",
      })) as Project["sections"],
    }

    const plan = buildRegenPlan(project)
    assert.ok(plan.length > 0)

    const choices = Object.fromEntries(
      plan.map((item) => [item.key, item.defaultChoice]),
    ) as Record<string, "keep" | "regenerate" | "archive">

    const { sections, tokens } = await applyManualRegenWithLlm(project, choices, TEST_USER)
    assert.ok(sections.length > 0)
    assert.ok(tokens >= 0)
  })
})
