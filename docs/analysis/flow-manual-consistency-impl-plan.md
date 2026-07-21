# フロー途中修正の前後整合 — 実装変更計画

| 項目 | 内容 |
| --- | --- |
| 更新日 | 2026-07-21 |
| 前提 | [`flow-manual-consistency-plan.md`](./flow-manual-consistency-plan.md)（方針・ブレスト統合） |
| 目的 | **現行コードをどう変えるか**を、ファイル単位・関数単位で固定する |
| 方針 | 本文自動上書きなし。確定時は状態付け。再生成は**保持選択ウィザード**経由。適用前に**版保存**し復元可能にする |
| 追加要件 | 後からフロー更新→マニュアル選択的再生成、バージョン管理・復元（要件 F-6） |

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
| `confirmFlow` で `blocks` / `title` を自動書き換え | 承認・手編集の破壊。再生成は明示ウィザード経由 |
| 保持選択なしの一括再生成 | P6 / P8。残したい箇所を潰す |
| `sectionNumber` を同期キーにする | 人間向け表示。キーは `stepId` |
| 既存項番の強制振り直し | 参照・レビューが壊れる |
| ハードロック（マニュアル中はフロー編集不可） | 要件の「タブ間自由往来」と衝突 |
| イベントソーシング全面導入 | プロトタイプ過剰。版はリビジョン表で足りる |
| DeepDive 削除時の回答保持（本フェーズ） | 別課題。マニュアル保護を先行 |
| キー入力ごとの自動版保存 | 版ノイズ。意味のある区切りのみ保存 |

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

成功条件（Phase C+D）: 保持指定したセクションは再生成後も不変。再生成適用後は版履歴から復元できる。

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

### Phase C — 選択的再生成（保持選択）※ユーザー追加要件

**前提:** Phase D-min（版の保存／復元 API）が先にあること。適用前に必ずスナップショットする。

| ID | タスク | ファイル |
| --- | --- | --- |
| C0 | `ManualRegenChoice = keep \| regenerate \| archive` | `types.ts` |
| C1 | `buildRegenPlan(impact, sections)` — 既定選択の算出 | `manual-impact.ts` または **新規** `manual-regen.ts` |
| C2 | 反映ウィザード UI（チェック／ラジオ一覧） | **新規** `features/manual/ManualRegenWizard.tsx` |
| C3 | `keep` は本文・画像・status を一切触らない | `manual-regen.ts` |
| C4 | `regenerate` は草案生成→差分表示→適用（承認済みは解除確認） | ManualTab / SectionEditor |
| C5 | 新規 step（added）は「追加して生成」チェック | ウィザード |
| C6 | orphan は `archive`（目次外）または `keep`（意図的残存） | ウィザード |
| C7 | 適用時: 対象セクションを版保存 → 本文更新 → `syncStatus` 更新 | `manual-version.ts` + regen |
| C8 | Export / Overview 警告 | ExportTab / OverviewTab |

#### ウィザード UX（必須フロー）

```text
[フロー変更をマニュアルに反映]
  → 一覧:
      ☑ 1.1 申請受付     [残す ●] [再生成 ○]     ← 承認済みなら既定「残す」
      ☑ 1.2 内容確認     [残す ○] [再生成 ●]     ← needs_review なら既定「再生成」
      ＋ 1.5 新規ステップ [追加して生成 ●]
      ⚠ 旧 2.1 紙回付   [廃止 ●] [残す ○]
  → 要約: 「3件を残す / 2件を再生成 / 1件を追加 / 1件を廃止」
  → [草案を生成] → 再生成対象だけ草案レビュー → [適用]
  → 適用前に自動で版・復元ポイント作成
```

#### 既定選択ルール

| 条件 | 既定 |
| --- | --- |
| `status === approved` | `keep` |
| ユーザーが blocks を編集済み（簡易: version>1 または flag） | `keep` |
| `syncStatus === needs_review` | `regenerate` |
| `syncStatus === orphaned` | `archive` |
| flow にのみ存在（未配置） | `regenerate`（新規セクション作成） |
| `intentional_difference` | `keep` |

ユーザーは一覧でいつでも上書きできる。**既定を keep 寄りにする**のが安全。

**受け入れ条件**

1. ウィザードを経ない一括上書き導線がない
2. `keep` 指定セクションの blocks / images / version 本文が適用後もビット一致
3. 適用後にワンクリックで復元ポイントへ戻れる（D 連携）
4. 承認済みを `regenerate` にした場合、適用前に確認ダイアログが出る

### Phase D — マニュアル版管理・復元 ※ユーザー追加要件

要件 F-6「版管理」「差分・復元」に対応。現行の `ManualSection.version`（カウンタ）と `Project.history`（操作ログ）では **中身を戻せない**。

#### 現状との差分

| 現行 | 不足 |
| --- | --- |
| `section.version: number` | 中身のスナップショットがない |
| `Project.history: HistoryEntry[]` | 文言ログのみ。復元不可 |
| フローの Undo | メモリ上・フロー専用。マニュアル非連動 |

#### データモデル（`types.ts`）

```ts
export type ManualRevisionReason =
  | "generate"
  | "edit"
  | "approve"
  | "regenerate"
  | "restore"
  | "flow_sync"
  | "checkpoint"

/** セクション1版分の不変スナップショット */
export interface ManualSectionRevision {
  id: string
  sectionId: string
  version: number
  savedAt: string
  savedBy: string
  reason: ManualRevisionReason
  title: string
  sectionNumber?: string
  majorTitle?: string
  mediumTitle?: string
  stepId?: string
  status: SectionStatus
  syncStatus?: ManualSyncStatus
  blocks: ManualBlock[] // 画像メタ含む。実体URLは参照のまま可
}

/** 選択的再生成など複数セクションをまとめて戻す点 */
export interface ManualRestorePoint {
  id: string
  createdAt: string
  createdBy: string
  label: string // 例: 「フロー反映 2026-07-21 11:00」
  revisionIds: string[] // 当時保存した ManualSectionRevision.id
}

export interface Project {
  // …既存…
  sectionRevisions?: ManualSectionRevision[] // プロトは配列で十分
  restorePoints?: ManualRestorePoint[]
}
```

#### 新規モジュール `app/src/lib/manual-version.ts`

```ts
export function snapshotSection(
  section: ManualSection,
  meta: { reason: ManualRevisionReason; user: string },
): ManualSectionRevision

export function appendRevision(
  project: Project,
  revision: ManualSectionRevision,
  options?: { maxPerSection?: number }, // 例: 直近20
): Project

export function createRestorePoint(
  project: Project,
  sectionIds: string[],
  label: string,
  user: string,
): Project

export function restoreSection(
  project: Project,
  sectionId: string,
  revisionId: string,
  user: string,
): Project // 復元前に現行を snapshot(reason: restore) してから差し替え

export function restorePoint(
  project: Project,
  restorePointId: string,
  user: string,
): Project
```

#### UI タスク

| ID | タスク | ファイル |
| --- | --- | --- |
| D0 | 上記型を `Project` に追加 | `types.ts` |
| D1 | `manual-version.ts` + 単体テスト | **新規** |
| D2 | セクションヘッダ「履歴」パネル（版一覧・復元） | ManualTab / SectionEditor |
| D3 | 簡易差分（ブロック text の前後比較で十分） | `manual-version.ts` または UI 内 |
| D4 | 復元ポイント一覧（マニュアルタブまたは Overview） | ManualTab / OverviewTab |
| D5 | 自動スナップショット契機の配線 | 承認・再生成適用・明示「版を保存」・ウィザード適用前 |
| D6 | モックに数版分の履歴を持たせる | `mock-data.ts` |

#### 自動保存する契機（これ以外は保存しない）

1. 初回 `generateSections`
2. セクション承認
3. 選択的再生成の **適用直前**（必須）
4. 復元の直前（復元前の現行を残す）
5. ユーザー明示の「版を保存」
6. （任意）承認済みセクションの手編集開始時に1回

**受け入れ条件**

1. 再生成適用後、履歴から1つ前の本文にワンクリック復元できる
2. 復元後も「復元前」が履歴に残り、再々復元できる
3. 復元ポイント適用で、ウィザードで触った複数セクションがまとめて戻る
4. `Project.history` には従来どおり操作ログも残す（監査用。復元の正は revisions）

### Phase E — 将来

| 候補 | 着手条件 |
| --- | --- |
| 公開版ピン留めと閲覧者向け固定 | 永続化・公開フロー本格化時 |
| フロー版とマニュアル版の紐づけ | 監査要件が明確になったとき |
| 分割・統合の自動差分エンジン | 手作業がボトルネックと実証されたとき |

---

## 8. 実装順序（推奨コミット単位）

```text
1. types + manual-impact.ts（+ テスト）
2. confirmFlow フック + generateSections の snapshot
3. ManualTab バナー／バッジ／アクション
4. mock-data ドリフトシナリオ
── Phase A 完了 ──
5. unplaced / orphan UI + outline 分離
6. 確定サマリー Dialog
── Phase B 完了 ──
7. types: ManualSectionRevision / RestorePoint + manual-version.ts
8. セクション履歴パネル（一覧・復元）※ D-min
── 再生成の受け皿完了 ──
9. ManualRegenWizard（保持／再生成／廃止の選択）
10. 草案生成→適用（適用前に必ず snapshot + restore point）
11. Export / Overview ゲート
── Phase C + D 完了 ──
```

**重要:** ステップ 9–10 の前に 7–8 を入れる。戻せる状態でなければ再生成 UI を出さない。

---

## 9. テスト観点

### Phase A

| ケース | 期待 |
| --- | --- |
| sections=[], confirm | sections 空のまま、deepdive のみ更新 |
| step 追加 / 削除 / ラベル変更 | 本文不変 + 適切な syncStatus / added 検知 |
| intentional → 再 confirm | intentional 維持 |

### Phase C / D

| ケース | 期待 |
| --- | --- |
| 全セクション keep で適用 | sections 本文不変。revision はチェックポイントのみ増えても可 |
| 1件だけ regenerate | 他セクション blocks 不変。対象は新版。旧版が revisions に残る |
| 承認済みを regenerate | 確認ダイアログ必須。適用後 status は draft/review |
| 復元 | 指定 revision の title/blocks が復元。復元前が新 revision として残る |
| 復元ポイント | 複数 sectionId が一括で適用前の内容に戻る |
| maxPerSection | 古い revision が刈り込まれても最新 N 件は残る |

---

## 10. リスクと実装上の注意

| リスク | 対処 |
| --- | --- |
| バッジだらけ | reviewCount に orphan + label 変更を優先。number のみは Phase A では情報弱めでも可 |
| confirm のたびに snapshot が動いて「永遠に ok」 | label 不一致時は snapshot を「検知用の旧値」として残し、解除操作時に更新 |
| deepdive 削除で回答消失との非対称 | UI コピーで「深掘り項目は削除されました。マニュアルは廃止候補として残しています」と明示（Phase B） |
| `generateSections` 全置換の残存 | 初回のみ許可。2回目以降はウィザード必須に誘導 |
| 版データの肥大（画像 data URL） | プロトは許容。本番は画像は ID 参照・本文のみスナップショット |
| 「残す」を忘れて全部再生成 | 既定 keep 寄り + 適用前サマリーで保持件数を再確認 |

---

## 11. 作業見積もり（侵襲度）

| Phase | 主な変更量 | 侵襲 |
| --- | --- | --- |
| A | 新規1モジュール + types + confirm 数行 + ManualTab UI | 低 |
| B | outline 拡張 + トレイ UI + 確定 Dialog | 中 |
| D-min | 版型 + version lib + 履歴パネル | 中 |
| C | ウィザード + 草案適用 + D 連携 | 中〜高 |
| D 完成 | 差分 UI・復元ポイント一覧 | 中 |

---

## 12. まとめ

| 問い | 答え |
| --- | --- |
| どこを変えるか | `confirmFlow` 出口（検知）、ManualTab（可視化→ウィザード）、`manual-version`（復元） |
| 後からマニュアルも更新したいとき | **保持選択付きウィザード**で keep / regenerate / archive を選んでから適用 |
| 戻したいとき | セクション版履歴、または再生成適用時の復元ポイント |
| 何を変えないか | 確定時の本文自動上書き、保持確認なしの一括再生成、項番強制再採番 |
| 最初の PR | A0〜A5（検知と見える化） |
| 再生成 PR の前提 | D-min（snapshot / restore）が先 |
