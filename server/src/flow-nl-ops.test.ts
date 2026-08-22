import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { matchInstructionToOps } from "./flow-nl-rules.js"
import { applyFlowNlOps, opsPlausibleForInstruction, parseFlowNlEditResponse } from "./flow-nl-ops.js"
import type { FlowState } from "./flow-types.js"

const sampleFlow: FlowState = {
  lanes: ["担当者"],
  nodes: [
    { id: "n1", type: "step", position: { x: 52, y: 57 }, data: { label: "業務開始", lane: "担当者", kind: "start" } },
    { id: "n2", type: "step", position: { x: 282, y: 57 }, data: { label: "Rakumanualの起動", lane: "担当者", kind: "process", system: "Rakumanual" } },
    { id: "n3", type: "step", position: { x: 522, y: 57 }, data: { label: "骨組みヒアリング", lane: "担当者", kind: "process", system: "Rakumanual" } },
    { id: "n4", type: "step", position: { x: 762, y: 57 }, data: { label: "深掘りヒアリング", lane: "担当者", kind: "process", system: "Rakumanual" } },
    { id: "n5", type: "step", position: { x: 1002, y: 57 }, data: { label: "業務終了", lane: "担当者", kind: "end" } },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2" },
    { id: "e2", source: "n2", target: "n3" },
    { id: "e3", source: "n3", target: "n4" },
    { id: "e4", source: "n4", target: "n5" },
  ],
  layoutMeta: {
    columnCount: 4,
    columnSystems: [
      { label: "—" },
      { label: "Rakumanual" },
      { label: "Rakumanual" },
      { label: "Rakumanual" },
    ],
  },
}

describe("flow nl edit ops", () => {
  it("parses setColumnSystemUrl from LLM JSON", () => {
    const parsed = parseFlowNlEditResponse(
      JSON.stringify({
        description: "リンク設定",
        ops: [{ op: "setColumnSystemUrl", system: "Rakumanual", url: "https://example.com" }],
      }),
    )
    assert.ok(parsed)
    assert.equal(parsed!.ops[0].op, "setColumnSystemUrl")
  })

  it("rejects addNode when instruction is link-only", () => {
    const ok = opsPlausibleForInstruction("Rakumanualのリンクはexample.comです", [
      { op: "addNode", label: "Rakumanual", afterLabel: "n2" },
    ])
    assert.equal(ok, false)
  })

  it("applies system link without adding nodes", () => {
    const rule = matchInstructionToOps("Rakumanualのリンクはrakumanual.vercel.appです", sampleFlow)
    assert.ok(rule)
    const { flow } = applyFlowNlOps(sampleFlow, rule!.ops, rule!.description)
    assert.equal(flow.nodes.length, sampleFlow.nodes.length)
    assert.ok(flow.layoutMeta?.columnSystems?.some((c) => c.url?.includes("rakumanual.vercel.app")))
  })

  it("matches swap instruction", () => {
    const rule = matchInstructionToOps("「骨組みヒアリング」と「深掘りヒアリング」を入れ替えて", sampleFlow)
    assert.ok(rule)
    assert.equal(rule!.ops[0].op, "swapNodes")
  })
})
