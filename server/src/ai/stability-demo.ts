/**
 * OpenRouter 実呼び出しによる出力安定性デモ
 *
 * Usage:
 *   LLM_PROVIDER=openrouter OPENROUTER_API_KEY=sk-or-... npm run llm:stability
 *   npm run llm:stability -- --models openai/gpt-4o-mini,google/gemini-2.5-flash --runs 3
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getDb } from "../db.js"
import { loadEnvFiles } from "../llm/config.js"
import { resetLlmAdapterCache } from "../llm/adapter.js"
import type { Project } from "../types.js"
import { generateFlowMock, generateFlowFromLlm, generateManualFromLlm } from "./structured.js"
import { postProcessBlock } from "./prompts/post-process.js"
import { validateGeneratedSection, validateGeneratedSections } from "./prompts/validate.js"

loadEnvFiles()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "../../..")

const DEFAULT_MODELS = [
  "openai/gpt-4o-mini",
  "google/gemini-2.5-flash",
  "anthropic/claude-3.5-haiku",
]

const TEST_USER = "u-stability-demo"

type RunResult = {
  model: string
  run: number
  task: "flow" | "manual"
  ok: boolean
  jsonOk: boolean
  usedLlmStructure: boolean
  errors: string[]
  warnings: string[]
  tokens: number
  ms: number
  flowProject?: Project
  metrics: {
    nodeCount?: number
    sectionCount?: number
    hasNotePrefix?: boolean
    hasStepPrefix?: boolean
  }
}

function parseArgs() {
  const args = process.argv.slice(2)
  let models = DEFAULT_MODELS
  let runs = 3
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--models" && args[i + 1]) {
      models = args[i + 1]!.split(",").map((s) => s.trim()).filter(Boolean)
      i++
    } else if (args[i] === "--runs" && args[i + 1]) {
      runs = Math.max(1, Number(args[i + 1]) || 3)
      i++
    }
  }
  return { models, runs }
}

function seedTestUser() {
  const db = getDb()
  db.prepare("INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)").run(
    TEST_USER,
    "LLM Stability Demo",
    "llm-stability@rakumanual.local",
  )
}

/** 参考 PPTX（ROS発注）に沿った指示側フィクスチャ */
function rosFixtureProject(): Project {
  const flow = generateFlowMock("ROS発注")
  return {
    id: "p-stability-ros",
    name: "ROS発注（Kintone）",
    status: "deepdive",
    description: "営業向け業務マニュアル自動作成デモ",
    hearingAnswers: [
      { questionId: "q1", questionText: "業務名", value: "ROS発注（Kintoneアプリ）", status: "confirmed" },
      {
        questionId: "q4",
        questionText: "トリガー",
        value: "営業から発注依頼メールを受領したとき",
        status: "confirmed",
      },
      {
        questionId: "q5",
        questionText: "関係者",
        value: "営業担当,購買部,SCM",
        status: "confirmed",
      },
      {
        questionId: "q8",
        questionText: "手順",
        value:
          "商品タイプを選択する、発注情報を入力する、商品リストを入力する、内容を確認して承認申請する",
        status: "confirmed",
      },
      {
        questionId: "q9",
        questionText: "分岐",
        value: "必要書類が全て揃い内容に間違いが無いか確認する",
        status: "confirmed",
      },
    ],
    flow,
    deepdive: flow.nodes
      .filter((n) => n.data.kind === "process" || n.data.kind === "decision")
      .map((n, i) => ({
        stepId: n.id,
        stepLabel: n.data.label,
        sectionNumber: n.data.sectionNumber ?? `${i + 1}`,
        majorTitle: "ROS発注（Kintoneアプリ）",
        mediumTitle: n.data.lane,
        importance: "normal" as const,
        status: "done" as const,
        answers: [
          {
            question: "使用システム",
            answer: "【営業】ROS発注前確認アプリ",
            value: "【営業】ROS発注前確認アプリ",
          },
        ],
      })),
    sections: [],
    history: [],
    createdAt: "2026-08-22",
    updatedAt: "2026-08-22",
  } as Project
}

function analyzeManualSections(sections: Project["sections"]) {
  let hasNotePrefix = false
  let hasStepPrefix = false
  for (const sec of sections) {
    const blocks = (sec as { blocks?: Array<{ type?: string; text?: string }> }).blocks ?? []
    for (const raw of blocks) {
      const b = postProcessBlock(raw)
      if (b.type === "note" && b.text.startsWith("※")) hasNotePrefix = true
      if (b.type === "step" && b.text.startsWith("・")) hasStepPrefix = true
    }
  }
  return { hasNotePrefix, hasStepPrefix }
}

async function runFlowTask(model: string, run: number): Promise<RunResult> {
  const started = Date.now()
  process.env.LLM_PROVIDER = "openrouter"
  process.env.LLM_MODEL = model
  resetLlmAdapterCache()

  const project = rosFixtureProject()
  let jsonOk = false
  let usedLlmStructure = false
  let nodeCount = 0
  const errors: string[] = []
  const warnings: string[] = []
  let tokens = 0
  let flowProject: Project | undefined

  try {
    const result = await generateFlowFromLlm(project, TEST_USER)
    jsonOk = result.usedLlmStructure
    usedLlmStructure = result.usedLlmStructure
    tokens = result.tokens
    nodeCount = result.flow.nodes.length
    flowProject = {
      ...project,
      flow: result.flow,
      deepdive: project.deepdive.map((d) => {
        const node = result.flow.nodes.find((n) => n.id === d.stepId)
        return node
          ? {
              ...d,
              stepLabel: node.data.label,
              sectionNumber: node.data.sectionNumber ?? (d as { sectionNumber?: string }).sectionNumber,
            }
          : d
      }),
    } as Project
    if (nodeCount < 3) errors.push("nodes<3")
    const hasDecision = result.flow.nodes.some((n) => n.data.kind === "decision")
    if (!hasDecision) warnings.push("no_decision_node")
    const hasProcess = result.flow.nodes.some((n) => n.data.kind === "process")
    if (!hasProcess) errors.push("no_process_node")
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "flow_failed")
  }

  return {
    model,
    run,
    task: "flow",
    ok: errors.length === 0,
    jsonOk,
    usedLlmStructure,
    errors,
    warnings,
    tokens,
    ms: Date.now() - started,
    flowProject,
    metrics: { nodeCount },
  }
}

async function runManualTask(model: string, run: number, flowProject: Project): Promise<RunResult> {
  const started = Date.now()
  process.env.LLM_PROVIDER = "openrouter"
  process.env.LLM_MODEL = model
  resetLlmAdapterCache()

  let jsonOk = false
  let usedLlmStructure = false
  const errors: string[] = []
  const warnings: string[] = []
  let tokens = 0
  let sectionCount = 0
  let hasNotePrefix = false
  let hasStepPrefix = false

  try {
    const result = await generateManualFromLlm(flowProject, TEST_USER)
    jsonOk = result.usedLlmStructure
    usedLlmStructure = result.usedLlmStructure
    tokens = result.tokens
    sectionCount = result.sections.length

    const validation = validateGeneratedSections(
      result.sections.map((s) => ({
        title: String((s as { title?: string }).title),
        sectionNumber: (s as { sectionNumber?: string }).sectionNumber,
        blocks: (s as { blocks?: unknown[] }).blocks as Array<{ type?: string; text?: string }>,
      })),
    )
    for (const issue of validation.issues) {
      if (issue.level === "error") errors.push(issue.code)
      else warnings.push(issue.code)
    }

    const style = analyzeManualSections(result.sections)
    hasNotePrefix = style.hasNotePrefix
    hasStepPrefix = style.hasStepPrefix
    if (!hasNotePrefix) warnings.push("no_note_prefix")
    if (!hasStepPrefix) warnings.push("no_step_prefix")
    if (sectionCount === 0) errors.push("no_sections")

    // 先頭セクションの gold 例との構造比較
    const first = result.sections[0] as { blocks?: Array<{ type?: string; text?: string }> } | undefined
    if (first?.blocks?.length) {
      const firstBlock = postProcessBlock(first.blocks[0] ?? {})
      if (firstBlock.type !== "paragraph") warnings.push("first_not_paragraph")
      const goldIssues = validateGeneratedSection({
        title: String((result.sections[0] as { title?: string }).title),
        sectionNumber: (result.sections[0] as { sectionNumber?: string }).sectionNumber,
        blocks: first.blocks,
      })
      for (const issue of goldIssues) {
        if (issue.level === "error") errors.push(`sec0:${issue.code}`)
        else warnings.push(`sec0:${issue.code}`)
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "manual_failed")
  }

  return {
    model,
    run,
    task: "manual",
    ok: errors.length === 0,
    jsonOk,
    usedLlmStructure,
    errors,
    warnings,
    tokens,
    ms: Date.now() - started,
    metrics: { sectionCount, hasNotePrefix, hasStepPrefix },
  }
}

function summarizeModelResults(model: string, results: RunResult[]) {
  const forModel = results.filter((r) => r.model === model)
  const passRate = forModel.filter((r) => r.ok).length / forModel.length
  const jsonRate = forModel.filter((r) => r.jsonOk).length / forModel.length
  const avgTokens = Math.round(forModel.reduce((s, r) => s + r.tokens, 0) / forModel.length)
  const avgMs = Math.round(forModel.reduce((s, r) => s + r.ms, 0) / forModel.length)
  const manualRuns = forModel.filter((r) => r.task === "manual")
  const noteRate =
    manualRuns.filter((r) => r.metrics.hasNotePrefix).length / Math.max(1, manualRuns.length)
  const stepRate =
    manualRuns.filter((r) => r.metrics.hasStepPrefix).length / Math.max(1, manualRuns.length)
  return { passRate, jsonRate, avgTokens, avgMs, noteRate, stepRate }
}

function writeReport(results: RunResult[], models: string[], runs: number) {
  const outPath = path.join(REPO_ROOT, "docs", `LLM安定性検証_${new Date().toISOString().slice(0, 10)}.md`)
  const lines: string[] = [
    `# LLM 出力安定性検証（OpenRouter 実呼び出し）`,
    "",
    `- 実行日時: ${new Date().toISOString()}`,
    `- 指示側フィクスチャ: ROS発注（Kintone）ヒアリング + 深掘り`,
    `- モデル: ${models.join(", ")}`,
    `- 各モデル ${runs} 回 × 2 タスク（flow / manual）`,
    "",
    "## サマリ",
    "",
    "| モデル | 合格率 | JSON構造化率 | ※note率 | ・step率 | 平均tokens | 平均ms |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ]

  for (const model of models) {
    const s = summarizeModelResults(model, results)
    lines.push(
      `| ${model} | ${(s.passRate * 100).toFixed(0)}% | ${(s.jsonRate * 100).toFixed(0)}% | ${(s.noteRate * 100).toFixed(0)}% | ${(s.stepRate * 100).toFixed(0)}% | ${s.avgTokens} | ${s.avgMs} |`,
    )
  }

  lines.push("", "## 詳細", "", "| モデル | run | task | OK | JSON | tokens | ms | errors | warnings |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |")

  for (const r of results) {
    lines.push(
      `| ${r.model} | ${r.run} | ${r.task} | ${r.ok ? "✓" : "✗"} | ${r.jsonOk ? "✓" : "✗"} | ${r.tokens} | ${r.ms} | ${r.errors.join(",") || "—"} | ${r.warnings.join(",") || "—"} |`,
    )
  }

  lines.push(
    "",
    "## 判定基準",
    "",
    "- **合格**: validate で error なし（warning は許容）",
    "- **JSON構造化**: LLM 出力をパースして sections/flow に反映（mock フォールバックなし）",
    "- **文体**: post-process 後に ※ note / ・ step が含まれる",
    "",
  )

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, lines.join("\n"), "utf8")
  return outPath
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    console.error("ERROR: OPENROUTER_API_KEY が未設定です。")
    console.error("リポジトリ直下に .env を作成してください（.env.example 参照）:")
    console.error("  LLM_PROVIDER=openrouter")
    console.error("  OPENROUTER_API_KEY=sk-or-...")
    process.exit(1)
  }

  const { models, runs } = parseArgs()
  seedTestUser()

  console.log(`LLM stability demo: ${models.length} models × ${runs} runs × 2 tasks`)
  const results: RunResult[] = []
  const baseProject = rosFixtureProject()

  for (const model of models) {
    console.log(`\n=== ${model} ===`)
    let lastFlowProject = baseProject
    for (let run = 1; run <= runs; run++) {
      process.stdout.write(`  run ${run} flow... `)
      const flowResult = await runFlowTask(model, run)
      results.push(flowResult)
      console.log(flowResult.ok ? "OK" : `FAIL (${flowResult.errors.join(",")})`)

      if (flowResult.flowProject) {
        lastFlowProject = flowResult.flowProject
      }

      process.stdout.write(`  run ${run} manual... `)
      const manualResult = await runManualTask(model, run, lastFlowProject)
      results.push(manualResult)
      console.log(manualResult.ok ? "OK" : `FAIL (${manualResult.errors.join(",")})`)

      // レート制限回避
      await new Promise((r) => setTimeout(r, 800))
    }
  }

  const outPath = writeReport(results, models, runs)
  console.log(`\nWrote ${outPath}`)

  const failed = results.filter((r) => !r.ok).length
  const total = results.length
  console.log(`${total - failed}/${total} runs passed`)

  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
