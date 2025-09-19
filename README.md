# Online Sign System

PC（書き手）とスマホ（受信者）が WebRTC で通話しながら、リアルタイムでサインを共有・保存できる Web アプリです。React + Vite のフロントエンドと、Express + ws のシグナリングサーバで構成しています。

## リポジトリ構成

```
./client   # React + Vite フロントエンド (TypeScript)
./server   # Node.js (Express + ws) シグナリングサーバ
```

## 前提

- Node.js 18 以上
- npm (または互換マネージャ)
- dev でも HTTPS / WSS 接続が必要です。ローカル開発では自己署名証明書を用意してください。

## セットアップ

```bash
# 依存関係のインストール
npm install
npm --prefix client install
npm --prefix server install
```

### 環境変数

#### サーバ (`server/.env`)

`.env.example` をコピーして値を設定してください。

```bash
cp server/.env.example server/.env
```

主な項目:

- `PORT` / `HOST`: シグナリングサーバの待受ポート
- `PUBLIC_BASE_URL`: 共有用 URL のベース（本番ホストの https URL）
- `STUN_URL`: STUN サーバ URL
- `TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD`: TURN(TLS/TCP 対応) の認証情報
- `SSL_KEY_PATH`, `SSL_CERT_PATH`: HTTPS / WSS 用の鍵・証明書パス（逆プロキシ利用時は不要）
- `ICE_SERVERS`: JSON 形式でカスタム ICE サーバを一括指定する場合に使用

#### クライアント (`client/.env`)

`.env.example` をコピーして編集します。

```bash
cp client/.env.example client/.env
```

主な項目:

- `VITE_SERVER_ORIGIN`: シグナリング API / WebSocket のベース URL（https）
- `VITE_SIGNALING_PATH`: WebSocket パス（デフォルト `/ws`）
- `VITE_STROKE_BUFFER_MS`: 受信側ストローク描画のバッファ遅延（既定 100ms）
- `VITE_DEV_SSL_KEY`, `VITE_DEV_SSL_CERT`: Vite/dev サーバ用のキーと証明書パス（自己署名可）

### 開発サーバの起動

1. 自己署名証明書（`client/.cert` など）を作成し、`client/.env` にパスを設定
2. それぞれの依存をインストールした後、ルートで以下を実行

```bash
npm run dev
```

- `client`: HTTPS (デフォルト `https://localhost:5173`)
- `server`: HTTPS/WSS (デフォルト `https://localhost:4000`)

### ビルド

```bash
npm run build
```

## 使い方

1. PC 側でアプリを開き「Writer」でルームを作成 → リンクを共有
2. スマホ側で共有リンクを開き「Receiver」で参加
3. 両者が「通話を開始/参加」ボタンを押すと、WebRTC で音声・映像 + DataChannel が確立
4. 書き手のキャンバス操作（色/太さ/消しゴム/Undo/Redo/Clear）が受信側のスマホ枠キャンバスにリアルタイム反映
5. 受信側は下部の保存ボタンから PNG（2160×1440）または A4 縦 PDF を生成
   - iOS Safari ではプレビュー表示後に長押しして保存、あるいは `navigator.share` に対応していれば共有シートで保存

## 実機テスト手順（推奨）

1. PC（有線/別回線）とスマホ（4G/5G など）を準備
2. TURN サーバを設定し、`server/.env` の `TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD` を有効化
3. サーバを HTTPS/WSS で公開（例: Render, Fly.io, Cloud Run など）
4. PC で新規ルームを作成 → リンクをスマホへ送信
5. Writer 側で描画しながら、Receiver 側で遅延や補間具合（100ms バッファ）を確認
6. Receiver 側で PNG/PDF 保存を実行し、出力解像度と共有シート動作を確認
7. 途中で回線切断や権限拒否をシミュレートし、トースト通知や再接続動作を確認

## デプロイのヒント

- **Render / Fly.io / Cloud Run** 等で Node.js アプリとしてサーバをデプロイ可能
- HTTPS 終端はマネージドサービス or リバースプロキシで実施し、アプリは WSS 経由でアクセス
- フロントエンドは静的ホスティング（Vercel, Netlify, Cloudflare Pages など）にデプロイし、`.env` の `VITE_SERVER_ORIGIN` を本番の HTTPS URL に設定
- TURN サーバ（Coturn 推奨）は TLS/TCP 対応で 443/5349 ポートを開放し、iOS Safari でも接続できるようにする

## 追加メモ

- DataChannel メッセージ形式: `{ type: 'stroke:start'|'stroke:move'|'stroke:end'|'undo'|'redo'|'clear', stroke: { id, userId, tool, color, width, points[] } }`
- 座標は 0..1 に正規化し、受信側でキャンバスサイズへスケール
- 受信表示は 60–120ms バッファ（既定 100ms）で簡易補間し、`requestAnimationFrame` でレンダリング
- PWA 対応: `manifest.webmanifest` + 簡易 Service Worker で A2HS をサポート
- テストコードは未収載（要件による）

## ライセンス

指定がないため未設定です。必要に応じて追記してください。
