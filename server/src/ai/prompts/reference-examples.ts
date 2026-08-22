/**
 * 参考資料（ROS発注 Kintone アプリ）から抽出した few-shot 例。
 * API 呼び出しなしでプロンプト品質を固定するため、実物に近い断片を埋め込む。
 */

/** 操作手順スライドの gold 例（1.1 商品タイプを選択） */
export const GOLD_SECTION_BLOCKS = {
  title: "1.1　商品タイプを選択",
  sectionNumber: "1.1",
  majorTitle: "依頼者情報",
  mediumTitle: "商品タイプを選択",
  blocks: [
    {
      type: "paragraph" as const,
      text: "1.1　商品タイプを選択",
      needsConfirm: false,
    },
    {
      type: "note" as const,
      text: "※機器（ライセンス）販売のみの場合は「製品・サービス」を、SI・役務を含む場合は「SI・役務」を選択してください。",
      needsConfirm: false,
    },
    {
      type: "step" as const,
      text: "・「商品タイプ」フィールドで該当する選択肢をクリックしてください。",
      needsConfirm: false,
    },
  ],
}

/** 分冊例（2.2.3 商品リスト 3/4） */
export const GOLD_SECTION_PAGINATED = {
  title: "2.2.3　商品リストを入力（3/4）",
  sectionNumber: "2.2.3",
  blocks: [
    {
      type: "paragraph" as const,
      text: "2.2.3　商品リストを入力（3/4）",
      needsConfirm: false,
    },
    {
      type: "step" as const,
      text: "・表示切替ボタンをクリックして、「ページ２「属性」」を入力してください。",
      needsConfirm: false,
    },
  ],
}

/** フロー分岐の gold 例（抜粋） */
export const GOLD_FLOW_SNIPPET = {
  lanes: ["営業担当", "購買部", "SCM"],
  nodes: [
    {
      id: "n1",
      data: {
        label: "ROS発注アプリ確認",
        lane: "営業担当",
        kind: "process",
        sectionNumber: "4-1",
        system: "【営業】ROS発注前確認",
        source: "deepdive:4-1",
      },
    },
    {
      id: "n2",
      data: {
        label: "必要書類が全て揃い内容に間違いが無いか",
        lane: "営業担当",
        kind: "decision",
        system: "—",
        source: "q9",
      },
    },
  ],
  edges: [
    { source: "n1", target: "n2" },
    { source: "n2", target: "n3", label: "はい" },
    { source: "n2", target: "n4", label: "いいえ" },
  ],
}

export function formatGoldSectionForPrompt(): string {
  return JSON.stringify(GOLD_SECTION_BLOCKS, null, 2)
}

export function formatGoldFlowForPrompt(): string {
  return JSON.stringify(GOLD_FLOW_SNIPPET, null, 2)
}
