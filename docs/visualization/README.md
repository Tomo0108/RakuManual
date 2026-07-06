# 要件定義書 ビジュアライゼーション

`docs/要件定義書.md` を shadcn/ui ベースの白基調モダンUIで表示するWebアプリです。

## 起動方法

リポジトリルートから:

```bash
npm install
npm run dev:docs
```

またはこのディレクトリから:

```bash
cd docs/visualization
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開いてください。

## 静的HTMLの生成

```bash
npm run build:docs
```

`dist/index.html` が生成されます。ローカルで確認する場合:

```bash
npm run preview
```

## 構成

- **shadcn/ui** — Card, Badge, Table, ScrollArea 等
- **Mermaid** — システム構成図・業務フロー図
- **Geist Variable** — モダンなサンセリフフォント
- **サイドバー目次** — スクロール連動の章ナビゲーション

## ファイル

| パス | 内容 |
| --- | --- |
| `src/components/DocumentContent.tsx` | 要件定義書の本文 |
| `src/data/navigation.ts` | 目次・Mermaid定義 |
| `dist/` | ビルド成果物(HTML) |
