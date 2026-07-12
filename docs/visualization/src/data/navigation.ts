import type { NavItem } from "@/components/layout/SidebarNav"

export const NAV_ITEMS: NavItem[] = [
  { id: "meta", label: "ドキュメント情報" },
  {
    id: "overview",
    label: "1. 概要",
    children: [
      { id: "overview-product", label: "プロダクト概要" },
      { id: "overview-background", label: "背景" },
      { id: "overview-glossary", label: "用語定義" },
    ],
  },
  {
    id: "business",
    label: "2. 業務要件",
    children: [
      { id: "business-flow", label: "業務フロー" },
      { id: "business-kpi", label: "KPI" },
      { id: "business-scope", label: "スコープ" },
    ],
  },
  {
    id: "functional",
    label: "3. 機能要件",
    children: [
      { id: "functional-list", label: "機能一覧" },
      { id: "functional-f0", label: "F-0 基盤" },
      { id: "functional-f1", label: "F-1 骨組みヒアリング" },
      { id: "functional-f2", label: "F-2 フロー図生成" },
      { id: "functional-f3", label: "F-3 フロー図編集" },
      { id: "functional-f4", label: "F-4 深掘りヒアリング" },
      { id: "functional-f5", label: "F-5 マニュアル生成" },
      { id: "functional-f6", label: "F-6 更新・メンテ" },
      { id: "functional-f7", label: "F-7 出力・活用" },
      { id: "functional-f8", label: "F-8 品質測定" },
      { id: "functional-screens", label: "画面一覧" },
      { id: "functional-data", label: "データモデル" },
      { id: "functional-api", label: "API概要" },
    ],
  },
  { id: "nonfunctional", label: "4. 非機能要件" },
  { id: "security", label: "5. セキュリティ要件" },
  { id: "migration", label: "6. 移行要件" },
  { id: "operations", label: "7. 運用要件" },
  { id: "approval", label: "8. 承認確認事項" },
]

export const SYSTEM_DIAGRAM = `graph TB
    subgraph client["利用者 (社内PC / ブラウザ / PWA)"]
        UI["Webアプリ UI<br/>プロジェクト / ヒアリング / フロー図<br/>深掘り / マニュアル / エクスポート / QA / KPI"]
    end
    subgraph app["アプリケーション層"]
        API["REST / JSON API<br/>(認証付き)"]
        HEARING["ヒアリングサービス"]
        FLOW["フロー図サービス"]
        MANUAL["マニュアルサービス"]
        EXPORT["出力サービス<br/>(PDF / PowerPoint)"]
        CHAT["業務QAサービス"]
        KPI["KPI・ログ集計サービス"]
        JOB["非同期ジョブ<br/>(生成・索引更新・通知)"]
    end
    subgraph ai["AI基盤"]
        LLM["LLM API<br/>(学習利用オプトアウト契約)"]
        EMB["Embedding API"]
    end
    subgraph data["データストア"]
        DB[("RDB<br/>プロジェクト / 回答 / フロー / マニュアル / 履歴 / 権限")]
        STORAGE[("オブジェクトストレージ<br/>画像 / 出力ファイル")]
        VECTOR[("ベクトル検索インデックス<br/>QA用")]
        CACHE[("キャッシュ / セッション")]
    end
    SSO["社内SSO / IdP<br/>(SAML / OIDC)"]
    UI --> API
    API --> HEARING & FLOW & MANUAL & EXPORT & CHAT & KPI
    API --> JOB
    HEARING & FLOW & MANUAL & CHAT --> LLM
    CHAT --> EMB
    API --> DB & STORAGE & CACHE
    CHAT --> VECTOR
    JOB --> DB & STORAGE & VECTOR & LLM
    UI --> SSO
    API --> SSO`

export const WORKFLOW_DIAGRAM = `graph LR
    S1["① 骨組みヒアリング"] --> S2["② フロー図生成"]
    S2 --> S3["③ フロー図の修正・確定"]
    S3 --> S4["④ 深掘りヒアリング"]
    S4 --> S5["⑤ マニュアル生成"]
    S5 --> S6["⑥ レビュー・承認・更新"]
    S6 --> S7["⑦ 公開・出力・活用"]
    S3 -.フロー変更.-> S2
    S6 -.内容修正.-> S4
    S7 -.業務変更時.-> S6`
