# フロー途中修正の前後整合 — 実装変更計画

| 項目 | 内容 |
| --- | --- |
| 更新日 | 2026-07-21 |
| 前提 | [`flow-manual-consistency-plan.md`](./flow-manual-consistency-plan.md)（方針・ブレスト統合） |
| 目的 | **現行コードをどう変えるか**を、ファイル単位・関数単位で固定する |
| 方針 | 本文自動上書きなし。確定時は状態付け。追加は候補、削除は隔離 |

---

## 1. 現行実装の要約

### 1-A. データ関係

```text
FlowNode.id  ──stepId──►  DeepDiveItem
     │                         │
     │                         │ generateSections（初回のみ全置換）
     │                         ▼
     └──── stepId? ──────► ManualSection（以降、フロー確定では未更新）
```

| 層 | 更新タイミング | 本文／回答の扱い |
| --- | --- | --- |
| `flow` | 編集・再生成・確定 | — |
| `deepdive` | **`confirmFlow` のみ** | 既存保持。削除ノードは黙って消滅 |
| `sections` | 初回 `generateSections`、手編集、部分 regen | フロー確定では **無変更** |

### 1-B. 変更が集中する現行コード

| 処理 | 場所 | 現状の問題 |
| --- | --- | --- |
| フロー確定 | `FlowEditorTab.tsx` `confirmFlow` | deepdive のみ再構築。`sections` 未参照 |
| 項番 | `flow-numbering.ts` `assignSectionNumbers` | 既存番号保持。マニュアル側は追従しない |
| マニュアル初回生成 | `ManualTab.tsx` `generateSections` | deepdive から全置換。既存があると再実行 UI なし |
| 部分再生成 | `ManualTab.tsx` `regenerate` | blocks の浅いコピーのみ。flow／deepdive 非連動 |
| 目次 | `manual-outline.ts` | sections の項番だけで階層化。orphan 分離なし |
| 型 | `types.ts` `ManualSection` | `syncStatus` 等なし |

### 1-C. フロー確定後に起きるギャップ（実装観点）

マニュアルが既にある状態でフローを直し再確定すると:

| 操作 | deepdive | sections（現状） |
| --- | --- | --- |
| ノード追加 | `not-started` 追加 | **欠落のまま** |
| ノード削除 | 項目ドロップ（回答消失） | **残骸が残る** |
| ラベル変更 | `recheck` | title／本文そのまま |
| 並べ替え | 配列順変化、番号は多く保持 | 目次は旧 `sectionNumber` |
| フロー再生成のみ（未確定） | 未更新 | 未更新（三重ズレが溜まる） |

---

## 2. 変更しないもの（スコープ外）

実装時のガードレール。PR レビューでもここを逸脱しない。

| 禁止 | 理由 |
| --- | --- |
| `confirmFlow` で `blocks` / `title` を自動書き換え | 承認・手編集の破壊 |
| `generateSections` の暗黙再実行 | 全置換で P6 悪化 |
| `sectionNumber` を同期キーにする | 人間向け表示。キーは `stepId` |
| 既存項番の強制振り直し | 参照・レビューが壊れる |
| ハードロック（マニュアル中はフロー編集不可） | 要件の「タブ間自由往来」と衝突 |
| イベントソーシング／差分マージエンジン | プロトタイプ過剰 |
| DeepDive 削除時の回答保持（本フェーズ） | 別課題。マニュアル保護を先行 |

---

## 3. 目標の振る舞い（変更後）

```text
フロー編集 → confirmFlow
  → polishFlow（現行）
  → deepdive 再構築（現行）
  → 【新規】sections が空でなければ computeManualImpact
  → 【新規】applyManualImpactStatuses（syncStatus / snapshot のみ）
  → history に「マニュアル見直し候補 N 件」を追記
  → tab=deepdive（現行）※ Phase B でサマリーモーダル可

マニュアルタブ
  → 【新規】見直し候補バナー + セクションバッジ
  → 本文はユーザー操作でのみ変更
  → Phase B: 未配置トレイ / 廃止候補の隔離・再紐づけ
```

成功条件（Phase A）: フロー再確定後、マニュアルの **本文・タイトルが1文字も変わらず**、要確認／欠落／残骸が見える。

---

## 4. データモデル変更

### 4-A. `app/src/lib/types.ts`

```ts
/** フローとの対応状態（本文の SectionStatus とは独立） */
export type ManualSyncStatus =
  | "ok"
  | "needs_review"
  | "intentional_difference"
  | "orphaned"
  | "unplaced"

export interface ManualSourceSnapshot {
  label: string
  kind?: StepKind
  sectionNumber?: string
}

export interface ManualSection {
  // …既存フィールド…
  /** フロー構造との同期状態。未設定は ok 扱い（後方互換） */
  syncStatus?: ManualSyncStatus
  /** 最終同期／生成時のフロー側スナップショット */
  sourceSnapshot?: ManualSourceSnapshot
}
```

- `status`（draft/review/approved）はレビュー工程のまま。
- `syncStatus` はフロー変更影響専用。混同しない。
- 既存モックは `syncStatus` 省略可（表示時は `ok`）。

### 4-B. 表示ラベル（任意で types か ManualTab 定数）

| syncStatus | UI 文言 |
| --- | --- |
| `ok` | （バッジなし） |
| `needs_review` | 要確認 |
| `intentional_difference` | 意図的差分 |
| `orphaned` | 廃止候補 |
| `unplaced` | 未配置（Phase B で Section 化する場合） |

---

## 5. 新規モジュール

### 5-A. `app/src/lib/manual-impact.ts`（純関数）

既存の `manual-outline.ts` / `manual-image.ts` と同列。UI 副作用なし。

```ts
export interface ManualImpact {
  addedStepIds: string[]       // flow(process|decision) にあり sections に無い
  removedStepIds: string[]     // sections にあり flow に無い
  labelChanged: Array<{ stepId: string; sectionId: string; from: string; to: string }>
  numberChanged: Array<{ stepId: string; sectionId: string; from?: string; to?: string }>
  reviewCount: number          // intentional を除く要対応件数
}

export function documentableNodes(flow: FlowState): FlowNode[]
// kind === process | decision

export function computeManualImpact(
  flow: FlowState,
  sections: ManualSection[],
): ManualImpact

/** blocks / title / sectionNumber は変更しない */
export function applyManualImpactStatuses(
  sections: ManualSection[],
  impact: ManualImpact,
  flow: FlowState,
  options?: { preserveIntentional?: boolean }, // 既定 true
): ManualSection[]

export function countManualReviewNeeded(sections: ManualSection[]): number
```

#### `applyManualImpactStatuses` の規則

| 条件 | 設定する syncStatus |
| --- | --- |
| `stepId` が flow に無い | `orphaned` |
| ラベルが snapshot／現状 flow と不一致 | `needs_review`（`intentional_difference` は維持） |
| 項番のみ不一致 | Phase A: `needs_review` または情報バッジのみ（過剰警告を避けるなら label 優先） |
| 問題なし | `ok` + snapshot 更新 |
| impact.added（Section 無し） | Section は作らない。addedStepIds として返すだけ |

スナップショット更新: `ok` にしたセクション、および新規に `needs_review` 付けた直後の「比較基準」として flow の label/kind/sectionNumber を書く。`orphaned` は旧 snapshot を残す。

---

## 6. 既存ファイルの変更内容

### 6-A. `FlowEditorTab.tsx` — `confirmFlow`

**差し込み位置:** `nextDeepdive` 構築後、`return { ... }` の直前。

```ts
const impact =
  p.sections.length === 0
    ? null
    : computeManualImpact(finalized, p.sections)

const nextSections =
  impact === null
    ? p.sections
    : applyManualImpactStatuses(p.sections, impact, finalized, {
        preserveIntentional: true,
      })

const manualReviewCount = impact?.reviewCount ?? 0
```

`return` に追加:

- `sections: nextSections`
- `history.action` にマニュアル見直し件数を併記  
  例: `フロー図を確定(深掘り要確認 2 件、マニュアル見直し候補 3 件)`

**変更しない:** `polishFlow`、deepdive の preserve/recheck/drop 規則、`setTab("deepdive")`。

### 6-B. `ManualTab.tsx`

| 追加 UI | 内容 |
| --- | --- |
| 影響バナー | `countManualReviewNeeded > 0` のとき上部に「見直し候補 N 件」。フィルタ: すべて / 要確認 / 廃止候補 |
| セクションバッジ | `syncStatus` に応じた Badge（既存 `SECTION_STYLE` と並べる） |
| アクション | 「意図的差分にする」「要確認を解除（ok）」— `updateSection` で `syncStatus` のみ変更 |
| orphan 強調 | 廃止候補は WARNING 系スタイル（`semantic-styles`） |

**変更しない（Phase A）:** `generateSections` の全置換ロジック、部分 `regenerate` の中身、目次の並べ方。

コンポーネント分割（任意）:

- 同ファイル内で十分なサイズならインライン
- 肥大化したら `ManualImpactBanner.tsx` / `SyncStatusBadge.tsx` を `features/manual/` に切る

### 6-C. `generateSections`（初期生成時のスナップショット）

初回生成で `sourceSnapshot` を埋める（以降の差分検知の基準）。

```ts
sourceSnapshot: {
  label: d.stepLabel,
  kind: nodeMap.get(d.stepId)?.data.kind,
  sectionNumber: sectionNum,
},
syncStatus: "ok",
```

### 6-D. `mock-data.ts`

ドリフト再現用プロジェクトを1つ追加（または既存 P を拡張）:

- sections あり
- flow 側に「sections に無い step」「sections のみの死 stepId」「ラベル違い」を混ぜる
- 手動で confirm 相当の状態を初期値に持たせ、マニュアルタブを開くだけでバッジが見える

### 6-E. `semantic-styles.ts`（任意）

`REVIEW_STATUS` に寄せて sync 用トークンを追加するか、ManualTab ローカル定数で開始。見た目の一貫性だけ確保。

---

## 7. Phase 別実装タスク

### Phase A — 影響可視化（最初に実装）

| ID | タスク | ファイル |
| --- | --- | --- |
| A0 | 型追加 `ManualSyncStatus` / `sourceSnapshot` | `types.ts` |
| A1 | `computeManualImpact` / `applyManualImpactStatuses` | **新規** `manual-impact.ts` |
| A2 | `confirmFlow` に status 更新フック | `FlowEditorTab.tsx` |
| A3 | 初回生成で snapshot 付与 | `ManualTab.tsx` `generateSections` |
| A4 | バナー・バッジ・意図的差分／解除 | `ManualTab.tsx` |
| A5 | ドリフト用モック | `mock-data.ts` |
| A6 | 単体テスト（任意だが推奨） | `manual-impact.test.ts` — added/removed/label/intentional 維持 |

**受け入れ条件**

1. sections 空のプロジェクトでは従来どおり（sections キーを壊さない）
2. マニュアル済みプロジェクトでノード追加→確定 → バナーに「未配置相当の追加」が見える（件数）。本文不変
3. ノード削除→確定 → 該当セクションが `orphaned`。本文不変・削除されない
4. ラベル変更→確定 → `needs_review`。title/blocks 不変
5. 「意図的差分」後に再確定しても上書きで `needs_review` に戻らない（`preserveIntentional`）

### Phase B — 構造の安全な扱い

| ID | タスク | ファイル |
| --- | --- | --- |
| B1 | `buildUnplacedCandidates` | `manual-impact.ts` |
| B2 | 未配置トレイ UI + 挿入位置選択で空セクション作成 | `ManualTab.tsx` |
| B3 | orphan 隔離表示（目次から外す or 別グループ） | `manual-outline.ts` + ManualTab |
| B4 | `rebindOrphanSection` / 廃止（一覧から除外 or archive フラグ） | `manual-impact.ts` + ManualTab |
| B5 | 確定直後の差分サマリー（短い Dialog） | `FlowEditorTab.tsx` |
| B6 | 推奨項番の「提案表示」のみ（自動書き込みしない） | ManualTab |

**受け入れ条件**

1. 追加ステップが既存目次の途中に勝手に割り込まない
2. orphan はエクスポート対象から外すか、外す前に警告（B では目次分離まで。Export ゲートは Phase C）
3. 再紐づけ後は `syncStatus: needs_review` または `ok`（ラベル一致時）

### Phase C — 提案型更新・下流ゲート

| ID | タスク | 備考 |
| --- | --- | --- |
| C1 | 部分再生成を「草案パネル」に変更（既存横並び） | 現行 `regenerate` の置き換え |
| C2 | `approved` は草案適用前に承認解除を要求 | SectionEditor |
| C3 | deepdive `recheck` ↔ section `needs_review` 相互リンク | DeepDiveTab / ManualTab |
| C4 | Export 前に orphan / needs_review 警告 | `ExportTab.tsx` |
| C5 | Overview に見直し候補件数 | `OverviewTab.tsx` |

---

## 8. 実装順序（推奨コミット単位）

```text
1. types + manual-impact.ts（+ テスト）
2. confirmFlow フック + generateSections の snapshot
3. ManualTab バナー／バッジ／アクション
4. mock-data ドリフトシナリオ
── ここで Phase A 完了・検証 ──
5. unplaced / orphan UI + outline 分離
6. 確定サマリー Dialog
── Phase B ──
7. 草案パネル・Export/Overview ゲート
```

各コミットで「本文が自動変更されていないこと」を手動またはテストで確認する。

---

## 9. テスト観点

| ケース | 期待 |
| --- | --- |
| sections=[], confirm | sections 空のまま、deepdive のみ更新 |
| 全 step 一致 | 全 `ok`、reviewCount=0 |
| step 追加 | addedStepIds に含まれる。既存 section の blocks 同一 |
| step 削除 | 該当 section → orphaned。配列から消えない |
| label 変更 | needs_review。title 不変 |
| intentional → 再 confirm | intentional 維持 |
| snapshot 無しの旧データ | label 比較は section.title vs flow.label にフォールバック可 |

---

## 10. リスクと実装上の注意

| リスク | 対処 |
| --- | --- |
| バッジだらけ | reviewCount に orphan + label 変更を優先。number のみは Phase A では情報弱めでも可 |
| confirm のたびに snapshot が動いて「永遠に ok」 | label 不一致時は snapshot を「検知用の旧値」として残し、解除操作時に更新 |
| deepdive 削除で回答消失との非対称 | UI コピーで「深掘り項目は削除されました。マニュアルは廃止候補として残しています」と明示（Phase B） |
| `generateSections` 全置換の残存 | Phase A では触らない。将来「差分マージ生成」は別 Issue |

---

## 11. 作業見積もり（侵襲度）

| Phase | 主な変更量 | 侵襲 |
| --- | --- | --- |
| A | 新規1モジュール + types + confirm 数行 + ManualTab UI | 低 |
| B | outline 拡張 + トレイ UI + 確定 Dialog | 中 |
| C | 編集 UX・Export・DeepDive 連携 | 中 |

プロトタイプとして **Phase A だけで課題の大半（「何がズレたか分からない」）に効く**。構造の欠落／残骸（P1/P2）の安全な解消は Phase B。

---

## 12. まとめ

| 問い | 答え |
| --- | --- |
| どこを変えるか | 主に `confirmFlow` の出口と `ManualTab` の表示。ロジックは `lib/manual-impact.ts` |
| 何を変えないか | マニュアル本文、項番の強制再採番、deepdive 規則、全再生成 |
| 最初の PR | A0〜A5（検知と見える化） |
| 設計の一貫性 | deepdive の `recheck` 思想をマニュアルの `syncStatus` に横展開する |
