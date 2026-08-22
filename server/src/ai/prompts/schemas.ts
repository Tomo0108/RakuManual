/** LLM 出力 JSON の契約（プロンプトとバリデータで共有） */

export const FLOW_JSON_SCHEMA = {
  lanes: ["担当者", "確認者"],
  nodes: [
    {
      id: "n1",
      data: {
        label: "業務開始",
        lane: "担当者",
        kind: "start|process|decision|end",
        sectionNumber: "1.1",
        system: "利用システム名または —",
        source: "q4|q8|deepdive:...",
      },
    },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2", label: "はい|いいえ|任意" }],
} as const

export const MANUAL_JSON_SCHEMA = {
  sections: [
    {
      title: "1.1　商品タイプを選択",
      sectionNumber: "1.1",
      majorTitle: "大項目（業務名）",
      mediumTitle: "中項目見出し",
      stepId: "フローノード id（deepdive と一致）",
      blocks: [
        {
          type: "paragraph|note|step",
          text: "本文（note は ※、step は ・ で始める）",
          needsConfirm: true,
        },
      ],
    },
  ],
} as const

export const SECTION_JSON_SCHEMA = {
  title: "1.1　操作見出し",
  blocks: [
    { type: "paragraph|note|step", text: "...", needsConfirm: false },
  ],
} as const

export type LlmBlockType = "paragraph" | "note" | "step"

export function normalizeBlockType(raw: string): LlmBlockType {
  if (raw === "step") return "step"
  if (raw === "note" || raw === "warning") return "note"
  return "paragraph"
}
