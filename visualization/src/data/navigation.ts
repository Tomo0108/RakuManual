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
      { id: "functional-f1", label: "F-1 骨組みヒアリング" },
      { id: "functional-f3", label: "F-3 フロー図編集" },
      { id: "functional-f5", label: "F-5 マニュアル生成" },
      { id: "functional-screens", label: "画面一覧" },
    ],
  },
  { id: "nonfunctional", label: "4. 非機能要件" },
  { id: "security", label: "5. セキュリティ要件" },
  { id: "migration", label: "6. 移行要件" },
  { id: "operations", label: "7. 運用要件" },
  { id: "approval", label: "8. 承認確認事項" },
]

export const SYSTEM_DIAGRAM = `graph TB
    subgraph client["利用者 (社内PC / ブラウザ)"]
        UI["Webアプリ UI<br/>ヒアリング / フロー図編集 / マニュアル編集"]
    end
    subgraph app["アプリケーションサーバ"]
        API["APIサーバ"]
        HEARING["ヒアリングエンジン"]
        FLOW["フロー図生成・編集エンジン"]
        MANUAL["マニュアル生成エンジン"]
        EXPORT["出力エンジン (PDF / PowerPoint)"]
        CHAT["業務QAチャット"]
    end
    subgraph ai["AI基盤"]
        LLM["LLM API<br/>(学習利用オプトアウト契約)"]
    end
    subgraph data["データストア"]
        DB[("業務データDB")]
        STORAGE[("ファイルストレージ")]
        VECTOR[("検索インデックス")]
    end
    SSO["社内SSO / 認証基盤"]
    UI --> API
    API --> HEARING & FLOW & MANUAL & EXPORT & CHAT
    HEARING & FLOW & MANUAL & CHAT --> LLM
    API --> DB & STORAGE
    CHAT --> VECTOR
    UI --> SSO`

export const WORKFLOW_DIAGRAM = `graph LR
    S1["① 骨組みヒアリング"] --> S2["② フロー図生成"]
    S2 --> S3["③ フロー図修正"]
    S3 --> S4["④ 深掘りヒアリング"]
    S4 --> S5["⑤ マニュアル生成"]
    S5 --> S6["⑥ レビュー・更新"]
    S6 --> S7["⑦ 出力・活用"]
    S3 -.-> S2
    S6 -.-> S4
    S7 -.-> S6`
