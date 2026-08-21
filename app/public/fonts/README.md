# 埋め込み用フォント

## PDF

PDF 出力は埋め込みフォントを使います。

1. **メイリオ（優先）**  
   - `Meiryo.ttf`（このディレクトリ、またはリポジトリの `assets/fonts/Meiryo.ttf` をここへコピー）
   - Bold 用に `Meiryo-Bold.ttf` / `meiryob.ttf` があれば使用。無ければ Regular を太字にも使います
   - `.ttc` は jsPDF 非対応のため不可

2. **フォールバック**  
   `NotoSansJP-Regular.ttf` / `NotoSansJP-Bold.ttf`（SIL OFL）

存在しない URL は SPA の HTML が返ることがあるため、TTF マジックバイトで検証しています。

## PPTX

PowerPoint はシステムフォント「メイリオ」を参照します（バイナリ埋め込みはしません）。
