import { writeFileSync, mkdirSync, readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { buildManualPptxArrayBuffer } from "../src/lib/export-pptx"
import type { Project } from "../src/lib/types"

const project = {
  id: "p1",
  name: "監査用サンプル",
  owner: "test",
  updatedAt: new Date().toISOString(),
  status: "draft",
  description: "",
  hearingAnswers: [],
  deepdive: [],
  sections: [],
  history: [],
  flow: {
    lanes: ["営業", "承認者"],
    nodes: [
      {
        id: "n1",
        type: "step",
        position: { x: 16, y: 20 },
        data: { label: "開始", lane: "営業", kind: "start" },
      },
      {
        id: "n2",
        type: "step",
        position: { x: 256, y: 12 },
        data: {
          label: "受注登録",
          lane: "営業",
          kind: "process",
          sectionNumber: "1.1",
          connectorId: "process",
        },
      },
      {
        id: "n3",
        type: "step",
        position: { x: 496, y: 12 },
        data: {
          label: "承認作業",
          lane: "承認者",
          kind: "process",
          sectionNumber: "1.2",
          connectorId: "approval",
        },
      },
      {
        id: "n4",
        type: "step",
        position: { x: 736, y: 4 },
        data: {
          label: "条件分岐?",
          lane: "承認者",
          kind: "decision",
          sectionNumber: "1.3",
        },
      },
      {
        id: "n5",
        type: "step",
        position: { x: 976, y: 12 },
        data: {
          label: "関係者へ連絡",
          lane: "営業",
          kind: "process",
          sectionNumber: "1.4",
          connectorId: "notification",
        },
      },
      {
        id: "n6",
        type: "step",
        position: { x: 1216, y: 12 },
        data: {
          label: "追加A",
          lane: "営業",
          kind: "process",
          sectionNumber: "1.5",
          connectorId: "process",
        },
      },
      {
        id: "n7",
        type: "step",
        position: { x: 1456, y: 12 },
        data: {
          label: "追加B",
          lane: "営業",
          kind: "process",
          sectionNumber: "1.6",
          connectorId: "process",
        },
      },
      {
        id: "n8",
        type: "step",
        position: { x: 1696, y: 12 },
        data: {
          label: "追加C",
          lane: "営業",
          kind: "process",
          sectionNumber: "1.7",
          connectorId: "process",
        },
      },
      {
        id: "n9",
        type: "step",
        position: { x: 1936, y: 20 },
        data: { label: "完了", lane: "営業", kind: "end" },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5", label: "はい" },
      { id: "e5", source: "n4", target: "n2", label: "いいえ" },
      { id: "e6", source: "n5", target: "n6" },
      { id: "e7", source: "n6", target: "n7" },
      { id: "e8", source: "n7", target: "n8" },
      { id: "e9", source: "n8", target: "n9" },
    ],
    layoutMeta: {
      columnCount: 9,
      columnSystems: [
        { label: "—" },
        { label: "Kintone" },
        { label: "Kintone" },
        { label: "—" },
        { label: "メール" },
        { label: "—" },
        { label: "—" },
        { label: "—" },
        { label: "—" },
      ],
    },
  },
} as unknown as Project

const buf = await buildManualPptxArrayBuffer(project, [], {
  template: "corporate",
  includeFlow: true,
})
mkdirSync("/tmp/flow-pptx-audit", { recursive: true })
writeFileSync("/tmp/flow-pptx-audit/out.pptx", Buffer.from(buf))
execSync("cd /tmp/flow-pptx-audit && rm -rf unzip && mkdir unzip && unzip -qo out.pptx -d unzip")

const slideFiles = execSync("ls /tmp/flow-pptx-audit/unzip/ppt/slides/slide*.xml")
  .toString()
  .trim()
  .split("\n")
const xml = slideFiles.map((f) => readFileSync(f, "utf8")).join("\n")
const count = (re: RegExp) => (xml.match(re) || []).length
const report = {
  flowSlides: slideFiles.filter((f) => readFileSync(f, "utf8").includes("業務フロー図")).length,
  C00000: count(/srgbClr val="C00000"/g),
  DAE3F3: count(/srgbClr val="DAE3F3"/g),
  EDEDED: count(/srgbClr val="EDEDED"/g),
  F2F2F2: count(/srgbClr val="F2F2F2"/g),
  BDD7EE: count(/srgbClr val="BDD7EE"/g),
  legend: xml.includes("凡例"),
  notifyLegend: xml.includes("通知・連絡"),
  backwardLegend: xml.includes("差戻し"),
  systemLabel: xml.includes("利用システム"),
  kintone: xml.includes("Kintone"),
  overlap: xml.includes("前ページと重複"),
  continueCap: xml.includes("次ページに続く"),
  offPageLegend: xml.includes("ページ間の接続"),
  tocFlow: xml.includes("業務フロー図"),
  font7: count(/sz="700"/g),
}
console.log(report)

const fails: string[] = []
if (report.F2F2F2 > 0 || report.BDD7EE > 0) fails.push("old stripe bands present")
if (report.DAE3F3 < 1) fails.push("approval fill missing")
if (report.EDEDED < 1) fails.push("notify fill missing")
if (!report.legend || !report.backwardLegend || !report.notifyLegend) fails.push("legend incomplete")
if (!report.systemLabel || !report.kintone) fails.push("system axis missing")
if (report.font7 > 0) fails.push("7pt font still present")
if (report.flowSlides < 2) fails.push("expected split slides")
if (!report.overlap || !report.continueCap) fails.push("overlap captions missing")
if (!report.offPageLegend && report.C00000 < 1) fails.push("off-page marker missing")
if (!report.tocFlow) fails.push("toc flow link text missing")
if (fails.length) {
  console.error("FAIL", fails)
  process.exit(1)
}
console.log("PASS")
