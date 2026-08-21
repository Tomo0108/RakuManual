# 埋め込み用フォント

## PDF

PDF 出力は埋め込みフォントを使います（閲覧端末にメイリオが無くても文字化けしません）。

1. **推奨（メイリオ）**  
   ライセンスを確認のうえ、次をこのディレクトリに置いてください。
   - `Meiryo.ttf`（または `meiryo.ttf`）
   - `Meiryo-Bold.ttf`（または `meiryob.ttf`）任意。無い場合は Regular を太字にも使います。

2. **既定フォールバック**  
   `NotoSansJP-Regular.ttf` / `NotoSansJP-Bold.ttf`（SIL OFL）を `Meiryo` 名で VFS 登録して埋め込みます。  
   出典: https://fontsource.org/fonts/noto-sans-jp

## PPTX

PowerPoint はシステムフォント「メイリオ」を参照します（不完全な TTF 埋め込みは行いません）。
