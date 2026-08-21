# 埋め込み用フォント（ローカル専用・Git 管理外のメイリオ）

## PDF

1. **メイリオ（優先・非公開）**  
   リポジトリの `assets/fonts/` に配置し、`npm run sync-fonts`（dev/build 時に自動実行）でここへコピーされます。
   - `Meiryo.ttf`
   - `Meiryo-Bold.ttf`（推奨）
   - `.ttc` は不可

2. **フォールバック（リポジトリ同梱）**  
   `NotoSansJP-Regular.ttf` / `NotoSansJP-Bold.ttf`（SIL OFL）

## PPTX

システムフォント「メイリオ」を参照します（バイナリ埋め込みなし）。
