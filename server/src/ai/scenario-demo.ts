/**
 * Cursor 内仮想デモ: 同一プロンプト・設定で複数お題のマニュアル生成を検証
 *
 * API キー不要（mock LLM）。OpenRouter 実呼び出し版は npm run llm:stability
 *
 * Usage: npm run llm:scenarios
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getDb } from "../db.js"
import { resetLlmAdapterCache } from "../llm/adapter.js"
import type { Project } from "../types.js"
import { SCENARIO_FIXTURES, buildScenarioProject } from "./scenario-fixtures.js"
import { generateFlowFromLlm, generateManualFromLlm, regenerateSectionFromLlm } from "./structured.js"
import { buildManualGenerationSystemPrompt } from "./prompts/manual.js"
import { buildFlowGenerationSystemPrompt } from "./prompts/flow.js"
import { PROMPT_VERSION } from "./prompts/style-guide.js"
import { postProcessBlock } from "./prompts/post-process.js"
import { validateGeneratedSection, validateGeneratedSections } from "./prompts/validate.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "../../..")
const TEST_USER = "u-scenario-demo"

type ScenarioResult = {
  id: string
  title: string
  flowOk: boolean
  manualOk: boolean
  regenOk: boolean
  flowNodes: number
  sectionCount: number
  errors: string[]
  warnings: string[]
  sampleSection?: {
    title: string
    blocks: Array<{ type: string; text: string }>
  }
}

function seedUser() {
  getDb()
    .prepare("INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)")
    .run(TEST_USER, "Scenario Demo", "scenario-demo@rakumanual.local")
}

function forceMockLlm() {
  process.env.LLM_PROVIDER = "mock"
  delete process.env.OPENROUTER_API_KEY
  resetLlmAdapterCache()
}

function formatBlocks(blocks: Array<{ type?: string; text?: string }>) {
  return blocks.map((b) => {
    const n = postProcessBlock(b)
    return { type: n.type, text: n.text }
  })
}

async function runScenario(fixtureId: string): Promise<ScenarioResult> {
  const fixture = SCENARIO_FIXTURES.find((f) => f.id === fixtureId)
  if (!fixture) throw new Error(`unknown scenario: ${fixtureId}`)

  forceMockLlm()
  let project = buildScenarioProject(fixture)
  const errors: string[] = []
  const warnings: string[] = []

  const flowResult = await generateFlowFromLlm(project, TEST_USER)
  const flowOk = flowResult.flow.nodes.length >= 3
  if (!flowOk) errors.push("flow_nodes_insufficient")
  if (!flowResult.usedLlmStructure) warnings.push("flow_mock_fallback")

  project = {
    ...project,
    flow: flowResult.flow,
    deepdive: project.deepdive.map((d) => {
      const node = flowResult.flow.nodes.find((n) => n.id === d.stepId)
      return node ? { ...d, stepLabel: node.data.label } : d
    }),
  } as Project

  const manualResult = await generateManualFromLlm(project, TEST_USER)
  const validation = validateGeneratedSections(
    manualResult.sections.map((s) => ({
      title: String((s as { title?: string }).title),
      sectionNumber: (s as { sectionNumber?: string }).sectionNumber,
      blocks: (s as { blocks?: unknown[] }).blocks as Array<{ type?: string; text?: string }>,
    })),
  )
  for (const issue of validation.issues) {
    if (issue.level === "error") errors.push(issue.code)
    else warnings.push(issue.code)
  }
  if (!manualResult.usedLlmStructure) warnings.push("manual_mock_fallback")

  const manualOk = !validation.issues.some((i) => i.level === "error")
  const firstSection = manualResult.sections[0] as
    | { title?: string; blocks?: Array<{ type?: string; text?: string }> }
    | undefined

  let regenOk = false
  if (manualResult.sections.length > 0) {
    const sectionId = String((manualResult.sections[0] as { id: string }).id)
    project = { ...project, sections: manualResult.sections } as Project
    try {
      const regen = await regenerateSectionFromLlm(project, sectionId, TEST_USER)
      const regenIssues = validateGeneratedSection({
        title: String((regen.section as { title?: string }).title),
        blocks: (regen.section as { blocks?: unknown[] }).blocks as Array<{ type?: string; text?: string }>,
      })
      regenOk = !regenIssues.some((i) => i.level === "error")
      if (!regenOk) errors.push("section_regen_failed")
    } catch {
      errors.push("section_regen_error")
    }
  }

  return {
    id: fixture.id,
    title: fixture.title,
    flowOk,
    manualOk,
    regenOk,
    flowNodes: flowResult.flow.nodes.length,
    sectionCount: manualResult.sections.length,
    errors,
    warnings,
    sampleSection: firstSection
      ? {
          title: String(firstSection.title ?? ""),
          blocks: formatBlocks(firstSection.blocks ?? []),
        }
      : undefined,
  }
}

function writeReport(results: ScenarioResult[]) {
  const date = new Date().toISOString().slice(0, 10)
  const outPath = path.join(REPO_ROOT, "docs", `LLMシナリオ検証_${date}.md`)

  const allOk = results.every((r) => r.flowOk && r.manualOk && r.regenOk)
  const lines: string[] = [
    "# LLM シナリオ検証（Cursor 内・仮想デモ）",
    "",
    `- 実行日時: ${new Date().toISOString()}`,
    `- プロンプト版: \`${PROMPT_VERSION}\``,
    `- LLM: mock（同一プロンプト・post-process・validate。API コストなし）`,
    `- お題数: ${results.length}`,
    `- 総合判定: **${allOk ? "安定（全お題合格）" : "要確認（不合格あり）"}**`,
    "",
    "## 検証観点",
    "",
    "1. **指示側（固定）**: 同一 system プロンプト（flow / manual）+ 執筆ルール + gold 例",
    "2. **される側（仮想）**: mock LLM が JSON 構造で応答 → post-process → validate",
    "3. **お題差**: ヒアリング・深掘り内容のみ変更し、出力構造（paragraph→note→step）が崩れないか",
    "",
    "## サマリ",
    "",
    "| お題 | フロー | マニュアル | セクション再生成 | sections | エラー |",
    "| --- | --- | --- | --- | --- | --- |",
  ]

  for (const r of results) {
    lines.push(
      `| ${r.title} | ${r.flowOk ? "✓" : "✗"} | ${r.manualOk ? "✓" : "✗"} | ${r.regenOk ? "✓" : "✗"} | ${r.sectionCount} | ${r.errors.join(",") || "—"} |`,
    )
  }

  lines.push(
    "",
    "## 使用プロンプト（共通設定）",
    "",
    "### マニュアル system（先頭 400 文字）",
    "```",
    buildManualGenerationSystemPrompt().slice(0, 400) + "…",
    "```",
    "",
    "### フロー system（先頭 300 文字）",
    "```",
    buildFlowGenerationSystemPrompt().slice(0, 300) + "…",
    "```",
    "",
    "## 各お題の生成サンプル（先頭セクション）",
    "",
  )

  for (const r of results) {
    lines.push(`### ${r.title}`, "")
    if (!r.sampleSection) {
      lines.push("（セクションなし）", "")
      continue
    }
    lines.push(`**${r.sampleSection.title}**`, "")
    for (const b of r.sampleSection.blocks) {
      lines.push(`- \`${b.type}\`: ${b.text}`)
    }
    lines.push("")
  }

  lines.push(
    "## 安定性所見",
    "",
    `- 全 ${results.length} お題で JSON パース → sections 生成: ${results.filter((r) => r.manualOk).length}/${results.length}`,
    `- 先頭 block が paragraph: ${results.filter((r) => r.sampleSection?.blocks[0]?.type === "paragraph").length}/${results.length}`,
    `- note に ※ 付与: ${results.filter((r) => r.sampleSection?.blocks.some((b) => b.type === "note" && b.text.startsWith("※"))).length}/${results.length}`,
    `- step に ・ 付与: ${results.filter((r) => r.sampleSection?.blocks.some((b) => b.type === "step" && b.text.startsWith("・"))).length}/${results.length}`,
    "",
    "再実行: `npm run llm:scenarios`",
    "",
  )

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, lines.join("\n"), "utf8")
  return outPath
}

async function main() {
  seedUser()
  forceMockLlm()

  console.log(`Scenario demo: ${SCENARIO_FIXTURES.length} topics, prompt ${PROMPT_VERSION}`)
  const results: ScenarioResult[] = []

  for (const fixture of SCENARIO_FIXTURES) {
    process.stdout.write(`  ${fixture.title}... `)
    const result = await runScenario(fixture.id)
    results.push(result)
    const ok = result.flowOk && result.manualOk && result.regenOk
    console.log(ok ? "OK" : `FAIL (${result.errors.join(",")})`)
  }

  const outPath = writeReport(results)
  console.log(`\nWrote ${outPath}`)

  const failed = results.filter((r) => !(r.flowOk && r.manualOk && r.regenOk)).length
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
