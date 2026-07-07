import type {
  Project,
  HearingQuestion,
  FlowState,
  FlowNode,
  FlowEdge,
} from "./types"
import { autoLayout } from "../features/flow/flow-layout"

/* =========================================================
 * ヒアリング質問テンプレート(F-1: 骨組みヒアリング)
 * 業務名 → 目的 → 関係者 → 開始/完了条件 → 頻度 → 手順 → 例外
 * ======================================================= */
export const HEARING_QUESTIONS: HearingQuestion[] = [
  {
    id: "q1",
    text: "これからマニュアル化する業務の名前を教えてください。",
    hint: "例: 経費精算、月次請求書発行 など",
    type: "text",
  },
  {
    id: "q2",
    text: "この業務の目的はなんですか?この業務が完了すると、何が達成されますか?",
    type: "text",
  },
  {
    id: "q3",
    text: "この業務はどのくらいの頻度で発生しますか?",
    type: "choice",
    options: ["毎日", "週次", "月次", "四半期ごと", "不定期"],
  },
  {
    id: "q4",
    text: "業務の開始のきっかけ(トリガー)はなんですか?",
    hint: "例: 申請書が届いたとき、毎月25日になったら など",
    type: "text",
  },
  {
    id: "q5",
    text: "この業務には誰が関わりますか?当てはまるものをすべて選んでください。",
    type: "multi",
    options: [
      "自分(担当者)のみ",
      "上長・承認者",
      "他部署の担当者",
      "社外(顧客・取引先)",
      "システム管理者",
    ],
  },
  {
    id: "q6",
    text: "誰から仕事を受け取り、完了後は誰に渡しますか?",
    hint: "インプット元とアウトプット先を教えてください",
    type: "text",
  },
  {
    id: "q7",
    text: "業務が「完了した」と言える状態はどんな状態ですか?",
    type: "text",
  },
  {
    id: "q8",
    text: "業務のおおまかな手順を、思いつく順で構わないので教えてください。",
    hint: "箇条書きでOKです。抜け漏れは後で一緒に確認します",
    type: "text",
  },
  {
    id: "q9",
    text: "途中で判断が分かれるポイント(条件分岐)はありますか?",
    hint: "例: 金額が5万円以上なら部長承認が必要 など",
    type: "text",
  },
  {
    id: "q10",
    text: "例外的なケースや、イレギュラー対応があれば教えてください。",
    type: "text",
  },
]

/* =========================================================
 * フロー図データ(横軸スイムレーン — 生成時に autoLayout 適用)
 * ======================================================= */

function buildFlow(lanes: string[], nodes: Omit<FlowNode, "position">[], edges: FlowEdge[]): FlowState {
  const laid = autoLayout({
    lanes,
    nodes: nodes.map((n) => ({ ...n, position: { x: 0, y: 0 } })),
    edges,
  })
  if (laid.layoutMeta) {
    laid.layoutMeta.columnSystems = laid.layoutMeta.columnSystems.map((col) => {
      if (col.label.includes("楽々精算"))
        return { ...col, url: "https://www.rakurakuseisan.jp/" }
      if (col.label.includes("ワークフロー"))
        return { ...col, url: "https://example.com/workflow" }
      if (col.label.includes("会計"))
        return { ...col, url: "https://example.com/accounting" }
      return col
    })
  }
  return laid
}

/** パターンA: 承認分岐ありの標準的なフロー(経費精算) */
const expenseFlow: FlowState = buildFlow(
  ["申請者", "経理担当", "上長"],
  [
    { id: "n1", type: "step", data: { label: "領収書を受領", lane: "申請者", kind: "start", system: "—", source: "q4: 領収書を受け取ったら開始" } },
    { id: "n2", type: "step", data: { label: "経費精算システムに入力", lane: "申請者", kind: "process", system: "楽々精算クラウド", source: "q8: 手順1" } },
    { id: "n3", type: "step", data: { label: "領収書画像を添付して申請", lane: "申請者", kind: "process", system: "楽々精算クラウド", source: "q8: 手順2" } },
    { id: "n4", type: "step", data: { label: "金額が5万円以上?", lane: "経理担当", kind: "decision", source: "q9: 分岐条件" } },
    { id: "n5", type: "step", data: { label: "部長が承認", lane: "上長", kind: "process", system: "ワークフロー", source: "q9: 5万円以上は部長承認" } },
    { id: "n6", type: "step", data: { label: "課長が承認", lane: "上長", kind: "process", system: "ワークフロー", source: "q9: 5万円未満は課長承認", manual: true } },
    { id: "n7", type: "step", data: { label: "経理が内容を確認・仕訳", lane: "経理担当", kind: "process", system: "会計システム", source: "q8: 手順4" } },
    { id: "n8", type: "step", data: { label: "振込完了・申請者へ通知", lane: "経理担当", kind: "end", system: "会計システム", source: "q7: 完了条件" } },
  ],
  [
    { id: "e1-2", source: "n1", target: "n2" },
    { id: "e2-3", source: "n2", target: "n3" },
    { id: "e3-4", source: "n3", target: "n4" },
    { id: "e4-5", source: "n4", target: "n5", label: "はい(5万円以上)" },
    { id: "e4-6", source: "n4", target: "n6", label: "いいえ" },
    { id: "e5-7", source: "n5", target: "n7" },
    { id: "e6-7", source: "n6", target: "n7" },
    { id: "e7-8", source: "n7", target: "n8" },
  ],
)

/** パターンB: 直列中心のシンプルなフロー(PCセットアップ) */
const pcSetupFlow: FlowState = buildFlow(
  ["情シス", "受入部署"],
  [
    { id: "n1", type: "step", data: { label: "入社情報を受領", lane: "情シス", kind: "start", system: "メール", source: "q4" } },
    { id: "n2", type: "step", data: { label: "PC・アカウントを手配", lane: "情シス", kind: "process", system: "資産管理 / AD", source: "q8: 手順1" } },
    { id: "n3", type: "step", data: { label: "キッティング(初期設定)", lane: "情シス", kind: "process", system: "端末管理", source: "q8: 手順2" } },
    { id: "n4", type: "step", data: { label: "受入部署に引き渡し", lane: "受入部署", kind: "process", system: "—", source: "q8: 手順3" } },
    { id: "n5", type: "step", data: { label: "初回ログイン確認", lane: "受入部署", kind: "process", system: "Windows", source: "q8: 手順4" } },
    { id: "n6", type: "step", data: { label: "受領書を回収して完了", lane: "受入部署", kind: "end", system: "資産管理", source: "q7" } },
  ],
  [
    { id: "e1-2", source: "n1", target: "n2" },
    { id: "e2-3", source: "n2", target: "n3" },
    { id: "e3-4", source: "n3", target: "n4" },
    { id: "e4-5", source: "n4", target: "n5" },
    { id: "e5-6", source: "n5", target: "n6" },
  ],
)

/** パターンC: 生成直後・未修正のフロー(請求書発行) */
const invoiceFlow: FlowState = buildFlow(
  ["営業担当", "経理担当"],
  [
    { id: "n1", type: "step", data: { label: "毎月25日: 請求対象を確定", lane: "営業担当", kind: "start", system: "販売管理", source: "q4: 毎月25日" } },
    { id: "n2", type: "step", data: { label: "販売管理システムで請求データ作成", lane: "営業担当", kind: "process", system: "販売管理", source: "q8: 手順1" } },
    { id: "n3", type: "step", data: { label: "金額・宛先の相互チェック", lane: "経理担当", kind: "process", system: "販売管理", source: "q8: 手順2" } },
    { id: "n4", type: "step", data: { label: "修正が必要?", lane: "経理担当", kind: "decision", source: "q9" } },
    { id: "n5", type: "step", data: { label: "請求データを修正", lane: "営業担当", kind: "process", system: "販売管理", source: "q9: 差戻し" } },
    { id: "n6", type: "step", data: { label: "請求書PDFを発行・送付", lane: "経理担当", kind: "process", system: "請求書発行", source: "q8: 手順3" } },
    { id: "n7", type: "step", data: { label: "送付記録を台帳に記入して完了", lane: "経理担当", kind: "end", system: "請求台帳", source: "q7" } },
  ],
  [
    { id: "e1-2", source: "n1", target: "n2" },
    { id: "e2-3", source: "n2", target: "n3" },
    { id: "e3-4", source: "n3", target: "n4" },
    { id: "e4-5", source: "n4", target: "n5", label: "はい" },
    { id: "e4-6", source: "n4", target: "n6", label: "いいえ" },
    { id: "e5-3", source: "n5", target: "n3", label: "再チェック" },
    { id: "e6-7", source: "n6", target: "n7" },
  ],
)

const emptyFlow: FlowState = { lanes: [], nodes: [], edges: [] }

/* =========================================================
 * プロジェクト(検証用パターン)
 *
 * P-001 経費精算            : ⑦公開済み。全データ完備・承認済みセクション・画像あり
 * P-002 新入社員PC受入      : ⑤マニュアル作成中。「要確認」マーク残り・深掘り混在
 * P-003 月次請求書発行      : ③フロー図編集中。生成直後・深掘り未着手
 * P-004 顧客問い合わせ対応  : ①ヒアリング途中。中断・再開/スキップ/わからない検証用
 * ======================================================= */
export const INITIAL_PROJECTS: Project[] = [
  {
    id: "P-001",
    name: "経費精算業務マニュアル",
    owner: "田中 花子",
    updatedAt: "2026-07-01",
    status: "published",
    description: "従業員の立替経費を精算し振込を行うまでの一連の業務",
    reviewDeadline: "2026-12-01",
    hearingAnswers: [
      { questionId: "q1", value: "経費精算業務", status: "answered" },
      { questionId: "q2", value: "従業員が立て替えた経費を正しく精算し、月内に振込を完了させる", status: "answered" },
      { questionId: "q3", value: "毎日", status: "answered" },
      { questionId: "q4", value: "従業員から経費精算の申請(領収書)が提出されたとき", status: "answered" },
      { questionId: "q5", value: "自分(担当者)のみ, 上長・承認者, 他部署の担当者", status: "answered" },
      { questionId: "q6", value: "申請者(全従業員)から受け取り、振込処理後に申請者へ完了通知を返す", status: "answered" },
      { questionId: "q7", value: "振込が完了し、申請者に通知が送られた状態", status: "answered" },
      { questionId: "q8", value: "1. システムに入力 2. 領収書添付 3. 承認 4. 経理確認・仕訳 5. 振込", status: "answered" },
      { questionId: "q9", value: "金額が5万円以上なら部長承認、未満なら課長承認", status: "answered" },
      { questionId: "q10", value: "領収書を紛失した場合は出金伝票で代替(上長の事前承認が必要)", status: "answered" },
    ],
    flow: expenseFlow,
    deepdive: [
      { stepId: "n2", stepLabel: "経費精算システムに入力", sectionNumber: "1.1", importance: "high", status: "done", answers: [
        { question: "使用するシステム・画面は?", answer: "楽々精算クラウド(社内ポータル > 経費精算)" },
        { question: "具体的な操作手順は?", answer: "「新規申請」→ 費目を選択 → 金額・日付・目的を入力" },
        { question: "よくあるミス・注意点は?", answer: "費目の選択ミスが多い。交際費と会議費の区別に注意" },
      ]},
      { stepId: "n3", stepLabel: "領収書画像を添付して申請", sectionNumber: "1.2", importance: "normal", status: "done", answers: [
        { question: "使用するファイルは?", answer: "領収書のスマホ撮影画像(JPEG/PNG、10MBまで)" },
        { question: "注意点は?", answer: "金額・日付・宛名が読める解像度で撮影すること" },
      ]},
      { stepId: "n4", stepLabel: "承認フロー", sectionNumber: "1.3", importance: "normal", status: "done", answers: [
        { question: "承認者の判断基準は?", answer: "申請金額が5万円以上なら部長、未満なら課長が承認する" },
        { question: "承認の期限は?", answer: "申請から3営業日以内" },
      ]},
      { stepId: "n7", stepLabel: "経理が内容を確認・仕訳", sectionNumber: "1.6", importance: "high", status: "done", answers: [
        { question: "判断基準は?", answer: "費目と領収書の整合性、稟議番号の有無を確認" },
        { question: "所要時間は?", answer: "1件あたり3〜5分" },
      ]},
    ],
    sections: [
      {
        id: "s1",
        sectionNumber: "1.1",
        stepId: "n2",
        title: "経費精算システムに入力",
        status: "approved",
        version: 3,
        updatedAt: "2026-06-28",
        blocks: [
          { id: "b1", type: "paragraph", text: "本セクションでは、従業員が経費精算を申請するまでの手順を説明します。" },
          { id: "b2", type: "step", text: "社内ポータルから「楽々精算クラウド」を開き、「新規申請」をクリックします。", image: { id: "img-b2", caption: "楽々精算クラウドのトップ画面。右上の「新規申請」ボタンをクリック", color: "#dbeafe" } },
          { id: "b3", type: "step", text: "費目を選択し、金額・利用日・利用目的を入力します。" },
          { id: "b4", type: "note", text: "交際費と会議費の区別に注意してください。1人あたり5,000円以下の飲食は会議費になります。" },
        ],
      },
      {
        id: "s2",
        sectionNumber: "1.2",
        stepId: "n3",
        title: "領収書画像を添付して申請",
        status: "approved",
        version: 2,
        updatedAt: "2026-06-28",
        blocks: [
          { id: "b5", type: "step", text: "領収書をスマートフォンで撮影し、画像を添付して申請ボタンを押します。", image: { id: "img-b5", caption: "領収書添付画面。金額・日付・宛名が読める画像を添付", color: "#fce7f3" } },
        ],
      },
      {
        id: "s3",
        sectionNumber: "1.3",
        stepId: "n4",
        title: "承認フロー",
        status: "approved",
        version: 2,
        updatedAt: "2026-06-28",
        blocks: [
          { id: "b1", type: "paragraph", text: "申請金額によって承認者が変わります。" },
          { id: "b2", type: "step", text: "申請金額が5万円以上の場合は部長承認、5万円未満の場合は課長承認となります。" },
          { id: "b3", type: "step", text: "承認者は申請内容と領収書画像を確認し、問題なければ「承認」をクリックします。" },
          { id: "b4", type: "note", text: "承認は申請から3営業日以内に行うルールです。" },
        ],
      },
      {
        id: "s4",
        sectionNumber: "1.6",
        stepId: "n7",
        title: "経理が内容を確認・仕訳",
        status: "approved",
        version: 2,
        updatedAt: "2026-07-01",
        blocks: [
          { id: "b1", type: "step", text: "経理担当は費目と領収書の整合性、稟議番号の有無を確認します(1件3〜5分目安)。" },
          { id: "b2", type: "step", text: "問題なければ仕訳を登録し、月次の振込データに反映します。" },
          { id: "b3", type: "step", text: "振込完了後、申請者へ自動通知が送信され業務完了です。" },
        ],
      },
    ],
    history: [
      { id: "h1", date: "2026-07-01 10:24", user: "田中 花子", action: "セクション4を更新(v2)・公開" },
      { id: "h2", date: "2026-06-28 15:02", user: "田中 花子", action: "全セクションを承認・初回公開" },
      { id: "h3", date: "2026-06-25 11:40", user: "佐藤 太郎", action: "フロー図: ステップ「課長が承認」を手動修正" },
      { id: "h4", date: "2026-06-24 09:15", user: "田中 花子", action: "マニュアル生成(全4セクション)" },
    ],
  },
  {
    id: "P-002",
    name: "新入社員PC受入マニュアル",
    owner: "佐藤 太郎",
    updatedAt: "2026-07-03",
    status: "manual",
    description: "新入社員のPC手配からキッティング・引き渡しまでの業務",
    reviewDeadline: "2026-08-15",
    hearingAnswers: [
      { questionId: "q1", value: "新入社員のPC受入業務", status: "answered" },
      { questionId: "q2", value: "入社日までにPCとアカウントを準備し、初日から業務を開始できるようにする", status: "answered" },
      { questionId: "q3", value: "不定期", status: "answered" },
      { questionId: "q4", value: "人事から入社情報の連絡が届いたとき", status: "answered" },
      { questionId: "q5", value: "自分(担当者)のみ, 他部署の担当者", status: "answered" },
      { questionId: "q6", value: "人事部から受け取り、受入部署の教育担当へ引き渡す", status: "answered" },
      { questionId: "q7", value: "受領書を回収し、初回ログインが確認できた状態", status: "answered" },
      { questionId: "q8", value: "1. PC手配 2. キッティング 3. 引き渡し 4. ログイン確認", status: "answered" },
      { questionId: "q9", value: "特になし(在庫がない場合は緊急調達)", status: "answered" },
      { questionId: "q10", value: "中途入社で入社日まで1週間を切っている場合は貸出機で仮対応", status: "answered" },
    ],
    flow: pcSetupFlow,
    deepdive: [
      { stepId: "n2", stepLabel: "PC・アカウントを手配", sectionNumber: "1.1", importance: "high", status: "done", answers: [
        { question: "使用するシステムは?", answer: "資産管理システム + Active Directory 管理コンソール" },
        { question: "操作手順は?", answer: "在庫確認 → 貸与登録 → ADでアカウント作成 → メールボックス発行" },
      ]},
      { stepId: "n3", stepLabel: "キッティング(初期設定)", sectionNumber: "1.2", importance: "high", status: "in-progress", answers: [
        { question: "使用するファイルは?", answer: "キッティング手順書 v2.1(共有ドライブ > 情シス > 手順書)" },
      ]},
      { stepId: "n4", stepLabel: "受入部署に引き渡し", sectionNumber: "1.3", importance: "normal", status: "not-started", answers: [] },
      { stepId: "n5", stepLabel: "初回ログイン確認", sectionNumber: "1.4", importance: "low", status: "recheck", answers: [
        { question: "確認項目は?", answer: "パスワード変更・VPN接続・プリンタ設定" },
      ]},
    ],
    sections: [
      {
        id: "s1",
        sectionNumber: "1.1",
        stepId: "n2",
        title: "PC・アカウントの手配",
        status: "review",
        version: 1,
        updatedAt: "2026-07-03",
        blocks: [
          { id: "b1", type: "paragraph", text: "人事から入社情報を受領したら、入社日の2週間前までにPCとアカウントの手配を開始します。" },
          { id: "b2", type: "step", text: "資産管理システムで在庫を確認し、貸与するPCを選定・登録します。", image: { id: "img-pc-b2", caption: "資産管理システムの在庫一覧画面", color: "#dcfce7" } },
          { id: "b3", type: "step", text: "Active Directory 管理コンソールでユーザーアカウントを作成します。", needsConfirm: true },
          { id: "b4", type: "note", text: "アカウント命名規則は「姓.名」形式です。同姓同名がいる場合は数字を付与します。", needsConfirm: true },
        ],
      },
      {
        id: "s2",
        sectionNumber: "1.2",
        stepId: "n3",
        title: "キッティング(初期設定)",
        status: "draft",
        version: 1,
        updatedAt: "2026-07-03",
        blocks: [
          { id: "b1", type: "step", text: "キッティング手順書 v2.1 に従い、OSの初期設定と標準ソフトのインストールを行います。" },
          { id: "b2", type: "step", text: "ウイルス対策ソフトの定義ファイルを最新化し、資産管理タグを貼付します。", needsConfirm: true },
        ],
      },
      {
        id: "s3",
        sectionNumber: "1.3",
        stepId: "n4",
        title: "受入部署に引き渡し",
        status: "draft",
        version: 1,
        updatedAt: "2026-07-03",
        blocks: [
          { id: "b1", type: "paragraph", text: "このセクションは深掘りヒアリングが未完了のため、プレースホルダ表示です。深掘りヒアリング完了後に生成できます。" },
        ],
      },
      {
        id: "s4",
        sectionNumber: "1.4",
        stepId: "n5",
        title: "初回ログイン確認",
        status: "draft",
        version: 1,
        updatedAt: "2026-07-03",
        blocks: [
          { id: "b1", type: "paragraph", text: "入社者と一緒に初回ログインを行い、パスワード変更・VPN接続・プリンタ設定を確認します。" },
          { id: "b2", type: "step", text: "Windowsにログインし、初期パスワードの変更を促します。", needsConfirm: true },
        ],
      },
    ],
    history: [
      { id: "h1", date: "2026-07-03 14:30", user: "佐藤 太郎", action: "セクション1〜4を生成" },
      { id: "h2", date: "2026-07-02 16:45", user: "佐藤 太郎", action: "フロー図を確定" },
    ],
  },
  {
    id: "P-003",
    name: "月次請求書発行マニュアル",
    owner: "鈴木 一郎",
    updatedAt: "2026-07-04",
    status: "flow",
    description: "毎月25日締めの請求書発行・送付業務",
    hearingAnswers: [
      { questionId: "q1", value: "月次請求書発行業務", status: "answered" },
      { questionId: "q2", value: "毎月の売上に対する請求書を期日までに正確に発行・送付する", status: "answered" },
      { questionId: "q3", value: "月次", status: "answered" },
      { questionId: "q4", value: "毎月25日になったら", status: "answered" },
      { questionId: "q5", value: "自分(担当者)のみ, 他部署の担当者, 社外(顧客・取引先)", status: "answered" },
      { questionId: "q6", value: "営業担当から請求データを受け取り、顧客へ請求書を送付する", status: "answered" },
      { questionId: "q7", value: "全顧客への請求書送付が完了し、台帳に記録された状態", status: "answered" },
      { questionId: "q8", value: "1. 請求対象確定 2. データ作成 3. チェック 4. 発行・送付 5. 台帳記録", status: "answered" },
      { questionId: "q9", value: "チェックで誤りが見つかったら営業に差し戻して修正後に再チェック", status: "answered" },
      { questionId: "q10", value: "海外顧客はインボイス形式が異なるため専用テンプレートを使用", status: "answered" },
    ],
    flow: invoiceFlow,
    deepdive: [
      { stepId: "n2", stepLabel: "販売管理システムで請求データ作成", sectionNumber: "1.1", importance: "high", status: "not-started", answers: [] },
      { stepId: "n3", stepLabel: "金額・宛先の相互チェック", sectionNumber: "1.2", importance: "high", status: "not-started", answers: [] },
      { stepId: "n6", stepLabel: "請求書PDFを発行・送付", sectionNumber: "1.5", importance: "normal", status: "not-started", answers: [] },
    ],
    sections: [],
    history: [
      { id: "h1", date: "2026-07-04 09:12", user: "鈴木 一郎", action: "フロー図をAI生成(未確定)" },
      { id: "h2", date: "2026-07-03 17:20", user: "鈴木 一郎", action: "骨組みヒアリング完了" },
    ],
  },
  {
    id: "P-004",
    name: "顧客問い合わせ一次対応",
    owner: "高橋 美咲",
    updatedAt: "2026-07-05",
    status: "hearing",
    description: "カスタマーサポート窓口の一次対応業務(ヒアリング途中)",
    hearingAnswers: [
      { questionId: "q1", value: "顧客問い合わせの一次対応業務", status: "answered" },
      { questionId: "q2", value: "問い合わせに24時間以内に一次回答し、必要に応じて担当部署へエスカレーションする", status: "answered" },
      { questionId: "q3", value: "毎日", status: "answered" },
      { questionId: "q4", value: "", status: "skipped" },
      { questionId: "q5", value: "自分(担当者)のみ, 他部署の担当者, 社外(顧客・取引先)", status: "answered" },
      { questionId: "q6", value: "", status: "unknown" },
    ],
    flow: emptyFlow,
    deepdive: [],
    sections: [],
    history: [
      { id: "h1", date: "2026-07-05 11:05", user: "高橋 美咲", action: "ヒアリングを中断(q6まで回答済み・自動保存)" },
    ],
  },
]

/* =========================================================
 * QAチャット用の仮データ(F-7-3)
 * パターン: ①出典あり回答 ②根拠なし回答 ③権限外
 * ======================================================= */
export interface QAPattern {
  keywords: string[]
  answer: string
  source?: { projectId: string; projectName: string; section: string }
}

export const QA_PATTERNS: QAPattern[] = [
  {
    keywords: ["経費", "精算", "領収書", "立替"],
    answer:
      "経費精算は「楽々精算クラウド」から申請します。費目を選択して金額・利用日・目的を入力し、領収書画像を添付して申請してください。金額が5万円以上の場合は部長承認、未満の場合は課長承認となります。",
    source: { projectId: "P-001", projectName: "経費精算業務マニュアル", section: "1.1 経費精算システムに入力" },
  },
  {
    keywords: ["承認", "5万", "部長", "課長"],
    answer:
      "申請金額が5万円以上の場合は部長承認、5万円未満の場合は課長承認です。承認は申請から3営業日以内に行うルールになっています。",
    source: { projectId: "P-001", projectName: "経費精算業務マニュアル", section: "1.3 承認フロー" },
  },
  {
    keywords: ["pc", "パソコン", "入社", "キッティング", "アカウント"],
    answer:
      "新入社員のPCは入社日の2週間前までに手配を開始します。資産管理システムで在庫確認・貸与登録を行い、Active Directory でアカウントを作成します。",
    source: { projectId: "P-002", projectName: "新入社員PC受入マニュアル", section: "1.1 PC・アカウントの手配" },
  },
  {
    keywords: ["請求", "インボイス", "25日"],
    answer:
      "月次請求書発行マニュアルは現在作成中(フロー図編集段階)のため、公開版マニュアルにはまだ掲載がありません。作成者(鈴木 一郎さん)にお問い合わせください。",
  },
]

/** アクセントカラーの選択肢 */
export const ACCENT_OPTIONS = [
  { id: "red", label: "レッド(ブランド)", swatch: "oklch(0.51 0.19 29)" },
  { id: "blue", label: "ブルー", swatch: "oklch(0.51 0.17 255)" },
  { id: "teal", label: "ティール", swatch: "oklch(0.5 0.11 195)" },
  { id: "violet", label: "バイオレット", swatch: "oklch(0.51 0.18 290)" },
  { id: "emerald", label: "エメラルド", swatch: "oklch(0.51 0.12 160)" },
] as const

export type AccentId = (typeof ACCENT_OPTIONS)[number]["id"]
