# Rakumanual

業務フローからマニュアルを作成・管理するプラットフォームです。

## リポジトリ構成

```
rakumanual/
├── app/                  # フロントエンド（Vite + React）
├── server/               # API（Fastify + SQLite）
├── docs/
│   ├── 要件定義書.md
│   ├── 開発計画書.md
│   └── visualization/    # 要件定義書ビューア
├── assets/
├── package.json
└── vercel.json
```

## 起動方法

```bash
npm install
npm run dev
```

- アプリ: http://localhost:5173/
- API: http://127.0.0.1:3001/api/health

初回ログイン後、サンプルプロジェクトがサーバーに保存されます。フロントのみ起動する場合は `npm run dev:app`（API が無いとメモリ動作にフォールバックします）。

### 要件定義書ビューア

```bash
npm run dev:docs
```

## ビルド

```bash
npm run build
npm run build:docs
```

## Vercel デプロイ

フロントのみデプロイします。API が無い環境では従来どおりブラウザ内メモリで動作します。

| 項目 | 値 |
|------|-----|
| Build Command | `npm run build` |
| Output Directory | `app/dist` |
| Install Command | `npm install` |
