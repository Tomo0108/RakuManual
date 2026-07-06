# RakuManual（ラクマニュアル）

業務フローからマニュアルを作成・管理するプラットフォームのプロトタイプです。

## リポジトリ構成

```
rakumanual/
├── app/                  # メイン Web アプリ（Vercel デプロイ対象）
├── docs/
│   ├── 要件定義書.md      # プロダクト要件定義
│   └── visualization/    # 要件定義書ビューア（ローカル閲覧用）
├── assets/               # ロゴ・ブランド素材
├── package.json          # ワークスペースルート
└── vercel.json           # デプロイ設定
```

## 起動方法

### メインアプリ

```bash
npm install
npm run dev
```

http://localhost:5173/ を開いてください。

### 要件定義書ビューア

```bash
npm install
npm run dev:docs
```

## ビルド

```bash
# メインアプリ（本番デプロイ用）
npm run build

# 要件定義書ビューア
npm run build:docs
```

## Vercel デプロイ

リポジトリルートからビルドします（Root Directory の設定は不要）。

| 項目 | 値 |
|------|-----|
| Build Command | `npm run build` |
| Output Directory | `app/dist` |
| Install Command | `npm install` |

Root Directory を `app` に設定している場合は、ダッシュボードの Output Directory を `dist` にしてください。
