import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { assignSectionNumbers, isLegacyCollapsedNumbering } from "./flow-numbering.js"
import type { FlowEdge, FlowNode, FlowState } from "./flow-types.js"

function node(
  id: string,
  kind: "start" | "end" | "process" | "decision",
  lane: string,
  sectionNumber?: string,
): FlowNode {
  return {
    id,
    type: "step",
    position: { x: 0, y: 0 },
    data: { label: id, lane, kind, ...(sectionNumber ? { sectionNumber } : {}) },
  }
}

function edge(source: string, target: string): FlowEdge {
  return { id: `${source}-${target}`, source, target }
}

function flow(nodes: FlowNode[], edges: FlowEdge[]): FlowState {
  return { nodes, edges, lanes: ["申請者", "経理", "上長"] }
}

describe("assignSectionNumbers (参考資料粒度)", () => {
  it("distinct ops get medium numbers; lane change bumps major", () => {
    const state = assignSectionNumbers(
      flow(
        [
          node("s", "start", "申請者"),
          node("a", "process", "申請者"),
          node("b", "process", "申請者"),
          node("c", "process", "経理"),
          node("e", "end", "経理"),
        ],
        [edge("s", "a"), edge("a", "b"), edge("b", "c"), edge("c", "e")],
      ),
    )
    const num = (id: string) => state.nodes.find((n) => n.id === id)?.data.sectionNumber
    assert.equal(num("a"), "1.1")
    assert.equal(num("b"), "1.2")
    assert.equal(num("c"), "2.1")
  })

  it("decision alternatives go deeper under the same medium (N.M.K)", () => {
    const state = assignSectionNumbers(
      flow(
        [
          node("s", "start", "申請者"),
          node("p", "process", "申請者"),
          node("d", "decision", "経理"),
          node("yes", "process", "上長"),
          node("no", "process", "上長"),
          node("fin", "process", "経理"),
          node("e", "end", "経理"),
        ],
        [
          edge("s", "p"),
          edge("p", "d"),
          edge("d", "yes"),
          edge("d", "no"),
          edge("yes", "fin"),
          edge("no", "fin"),
          edge("fin", "e"),
        ],
      ),
    )
    const num = (id: string) => state.nodes.find((n) => n.id === id)?.data.sectionNumber
    assert.equal(num("p"), "1.1")
    assert.equal(num("d"), "2.1")
    assert.equal(num("yes"), "2.1.1")
    assert.equal(num("no"), "2.1.2")
    assert.equal(num("fin"), "3.1")
  })

  it("rewrites only legacy all-under-1.1.n collapse", () => {
    const legacy = flow(
      [
        node("s", "start", "申請者"),
        node("a", "process", "申請者", "1.1.1"),
        node("b", "process", "申請者", "1.1.2"),
        node("c", "process", "経理", "1.1.3"),
        node("e", "end", "経理"),
      ],
      [edge("s", "a"), edge("a", "b"), edge("b", "c"), edge("c", "e")],
    )
    assert.equal(isLegacyCollapsedNumbering(legacy.nodes), true)
    const state = assignSectionNumbers(legacy)
    const num = (id: string) => state.nodes.find((n) => n.id === id)?.data.sectionNumber
    assert.equal(num("a"), "1.1")
    assert.equal(num("b"), "1.2")
    assert.equal(num("c"), "2.1")
  })

  it("preserves intentional 2.2.1 pagination style from reference manuals", () => {
    assert.equal(
      isLegacyCollapsedNumbering([
        node("a", "process", "営業", "2.2.1"),
        node("b", "process", "営業", "2.2.2"),
        node("c", "process", "営業", "2.3"),
      ]),
      false,
    )
    const state = assignSectionNumbers(
      flow(
        [
          node("s", "start", "営業"),
          node("a", "process", "営業", "2.2.1"),
          node("b", "process", "営業", "2.2.2"),
          node("c", "process", "営業", "2.3"),
          node("d", "process", "営業"),
          node("e", "end", "営業"),
        ],
        [edge("s", "a"), edge("a", "b"), edge("b", "c"), edge("c", "d"), edge("d", "e")],
      ),
    )
    const num = (id: string) => state.nodes.find((n) => n.id === id)?.data.sectionNumber
    assert.equal(num("a"), "2.2.1")
    assert.equal(num("b"), "2.2.2")
    assert.equal(num("c"), "2.3")
    assert.equal(num("d"), "2.4")
  })

  it("preserves existing 1.1 / 2.1 style numbers", () => {
    const state = assignSectionNumbers(
      flow(
        [
          node("s", "start", "申請者"),
          node("a", "process", "申請者", "1.1"),
          node("b", "process", "申請者", "1.2"),
          node("c", "process", "経理"),
          node("e", "end", "経理"),
        ],
        [edge("s", "a"), edge("a", "b"), edge("b", "c"), edge("c", "e")],
      ),
    )
    const num = (id: string) => state.nodes.find((n) => n.id === id)?.data.sectionNumber
    assert.equal(num("a"), "1.1")
    assert.equal(num("b"), "1.2")
    assert.equal(num("c"), "2.1")
  })
})
