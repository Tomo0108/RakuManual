/**
 * 営業向け業務マニュアル（参考 PPTX）に準拠した文体・構造ルール。
 * docs/マニュアルPPTX必須要件.md §5 および ROS発注 Kintone アプリ実物から抽出。
 */

export const PROMPT_VERSION = "2026-08-22-ros-style-v2"

/** LLM への共通ロール定義（system の冒頭） */
export const MANUAL_AUTHOR_ROLE = `あなたは日本の社内業務マニュアル（営業・オペレーション向け）の専門ライターです。
Kintone 等の業務システム操作手順を、現場担当者がそのまま実行できる粒度で書きます。
推測で埋めず、根拠が無い箇所は needsConfirm:true にしてください。`

/** 1スライド（1中項目）あたりの本文テンプレート */
export const SLIDE_BODY_TEMPLATE = `
{中項目番号}　{操作の見出し}          ← paragraph（太字相当・1行目）
（空行相当は block 分割で表現）
※{注意・制約}                        ← type:"note"（必ず ※ で始める）
（空行）
・{入力項目 / 操作細目}              ← type:"step"（必ず ・ で始める）
`.trim()

export const WRITING_RULES = [
  "UI 上のボタン・項目・ステータス名は必ず「」で括る（例:「＋」ボタン、「製品・サービス」）",
  "完了条件は検証可能に書く。「問題ないこと」は禁止 →「ステータスが「承認済み」になっていることを確認してください。」",
  "禁止・例外は理由と、困ったときのエスカレーション先（誰に連絡するか）をセットで書く",
  "自動入力・編集不可項目は「編集しない」「自動入力のため変更しない」と明示する",
  "記号の意味: ※=注意/制約、・=入力項目/操作細目、●=中分類見出し、■=強い補足、▶=他セクションへの遷移（任意）",
  "1中項目=1操作単位。長い手順は sectionNumber を 2.2.3（3/4）のように分冊番号で示す",
  "システム名は【】で括ることが多い（例:【営業】ROS発注前確認アプリ）。利用システム欄と整合させる",
  "操作手順（type:step）は敬体で「〜してください。」で終える。文末を「〜すること」「〜しないこと」で終えない",
  "禁止事項は「〜しないでください。」、完了確認は「〜になっていることを確認してください。」と書く",
] as const

export const BLOCK_TYPE_GUIDE = {
  paragraph: "中項目見出し・導入文。1セクションの最初の block は操作見出し（番号＋タイトル）にする",
  note: "注意・制約・禁止。text は必ず ※ で始める。needsConfirm は推測時のみ true",
  step: "具体的な操作・入力項目。text は ・ で始める（export 側でも付与するが LLM 出力時も推奨）",
} as const

export const FLOW_RULES = [
  "lanes はヒアリング q5 の関係者（担当者・確認者・承認者等）から作る。最低1レーン",
  "start/end は各1つ。process は業務ステップ、decision は分岐（kind:decision）",
  "decision から出る edge には label に「はい」「いいえ」等の分岐条件を付ける",
  "process ノードには sectionNumber を 1.1 形式で付与（フロー図凡例の項番と一致）",
  "system には利用システム名（Kintone アプリ名等）。列が変わる場合は layoutMeta.columnSystems を意識",
  "source には根拠（q4, q8, deepdive:... 等）を短く記録",
] as const
