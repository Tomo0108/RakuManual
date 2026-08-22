import { MANUAL_AUTHOR_ROLE, PROMPT_VERSION } from "./style-guide.js"
import { summarizeFlowForNlEdit, type FlowNlOp } from "../../flow-nl-ops.js"
import type { FlowState } from "../../flow-types.js"

export const FLOW_NL_EDIT_OPS_SCHEMA = {
  description: "ユーザーへの説明（1文）",
  ops: [
    {
      op: "setColumnSystemUrl | renameNode | removeNode | addNode | swapNodes | moveNode | setNodeSystem | setNodeLane | setEdgeLabel",
      note: "利用システムのリンクは setColumnSystemUrl。ステップ追加ではない。",
    },
  ],
  examples: [
    {
      instruction: "Rakumanualのリンクはrakumanual.vercel.appです",
      ops: [{ op: "setColumnSystemUrl", system: "Rakumanual", url: "https://rakumanual.vercel.app" }],
    },
    {
      instruction: "「骨組みヒアリング」と「深掘りヒアリング」を入れ替えて",
      ops: [{ op: "swapNodes", aLabel: "骨組みヒアリング", bLabel: "深掘りヒアリング" }],
    },
    {
      instruction: "「AIでマニュアル作成」の利用システムを Kintone に変更",
      ops: [{ op: "setNodeSystem", label: "AIでマニュアル作成", system: "Kintone" }],
    },
  ],
} as const

export function buildFlowNlEditSystemPrompt(): string {
  return [
    MANUAL_AUTHOR_ROLE,
    "",
    `プロンプト版: ${PROMPT_VERSION}-flow-nl-edit`,
    "タスク: ユーザーの自然言語指示をフロー図への**構造化操作 ops** に変換する。",
    "出力は JSON のみ。Markdown・コードフェンス・説明文の混在は禁止。",
    "",
    "## 重要ルール",
    "1. 利用システムの**リンク・URL** → setColumnSystemUrl（下部パネル）。**addNode 禁止**",
    "2. ステップ名の変更 → renameNode（newLabel）",
    "3. ステップ削除 → removeNode",
    "4. 2ステップの順序入れ替え → swapNodes（aLabel/bLabel または nodeId）",
    "5. ステップを別位置へ → moveNode（afterLabel / beforeLabel）",
    "6. ステップ追加 → addNode（afterLabel / beforeLabel / between のいずれか必須）",
    "7. ノードの利用システム欄 → setNodeSystem / 担当レーン → setNodeLane",
    "8. 分岐ラベル → setEdgeLabel（source/target は nodeId またはラベル）",
    "9. 指示にない変更を推測で足さない。不明なら ops を空にせず、最も近い op を選ぶ",
    "",
    "## 出力スキーマ",
    JSON.stringify(FLOW_NL_EDIT_OPS_SCHEMA, null, 2),
  ].join("\n")
}

export function buildFlowNlEditUserPrompt(instruction: string, flow: FlowState): string {
  return JSON.stringify({
    instruction,
    flow: summarizeFlowForNlEdit(flow),
  })
}

export function buildFlowNlEditMessages(instruction: string, flow: FlowState) {
  return [
    { role: "system" as const, content: buildFlowNlEditSystemPrompt() },
    { role: "user" as const, content: buildFlowNlEditUserPrompt(instruction, flow).slice(0, 4000) },
  ]
}

export type { FlowNlOp }
