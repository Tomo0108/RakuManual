# Rakumanual

業務フローからマニュアルを作成・管理するプラットフォームです。

## リポジトリ構成

```
rakumanual/
├── app/                  # フロントエンド（Vite + React）
├── server/               # API（Fastify + SQLite）
├── assets/               # アイコン等（fonts はローカル専用・非公開）
├── package.json
└── vercel.json
```

`docs/`・参考資料・メイリオ等のフォントは非公開のため Git 管理外です。

## 起動方法

```bash
npm install
npm run dev
```

- アプリ: http://localhost:5173/
- API: http://127.0.0.1:3001/api/health

初回ログイン後、サンプルプロジェクトがサーバーに保存されます。フロントのみ起動する場合は `npm run dev:app`（API が無いとメモリ動作にフォールバックします）。

PDF でメイリオを使う場合は `assets/fonts/Meiryo.ttf` と `Meiryo-Bold.ttf` を配置してください（`dev` / `build` 時に `app/public/fonts/` へ同期されます）。

## ビルド

```bash
npm run build
```

## デプロイ

- フロント: Vercel（ルートの `vercel.json`）
- API: `server/` を Node ホストへ。環境変数は `.env.example` を参照
