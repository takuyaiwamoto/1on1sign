# Online Sign System – Next.js 14 / TypeScript / Tailwind / WebRTC Canvas Sync

1 対 1 のオンラインサイン体験を提供する Next.js 14 アプリケーションです。Next.js (App Router)、Express、WebSocket (ws)、WebRTC を同一プロセスで動作させ、fan / talent / sign の 3 画面で安定した映像通話とキャンバス同期、PNG ダウンロードを実現します。

## 主な機能
- fan / talent / sign の 3 画面構成とリアルタイムな WebRTC 映像通話
- 1440×2560 (9:16) キャンバスのストローク同期と PNG 確定版の配信
- 1 本の WebSocket でシグナリングとサイン用イベントを統合
- 指数バックオフによる WebSocket 自動再接続と映像自動再生フォールバック
- Render 向け `render.yaml`、`.env.example`、セットアップ済みの ESLint / Prettier / Tailwind

## セットアップ
1. 依存関係のインストール
   ```bash
   npm install
   ```
2. 環境変数ファイルの作成
   ```bash
   cp .env.example .env
   ```
   `ROOM_SECRET`、`NEXT_PUBLIC_BASE_URL`、`NEXT_PUBLIC_WS_URL` を運用環境に合わせて設定してください。

3. 開発サーバーの起動
   ```bash
   npm run dev
   ```
   - Express + Next.js が `http://localhost:3000` で起動します。
   - WebSocket エンドポイントは `ws://localhost:3000/ws` です。

### ビルド / リリース
- Lint: `npm run lint`
- 型チェック: `npm run typecheck`
- ビルド: `npm run build`
- 本番起動: `npm run start`

本番ビルドでは `next build` と `tsc -p tsconfig.server.json` が実行され、`dist/server/index.js` を `npm run start` が参照します。

## 管理 API
### `POST /api/admin/createRoom`
- 認証: `Authorization: Bearer <ROOM_SECRET>`
- リクエスト (任意):
  ```json
  {
    "roomId": "custom-room-id"
  }
  ```
  `roomId` を省略した場合は UUID から自動生成されます。英数字と `-_` 以外の文字は除去され、小文字に変換されます。
- レスポンス例:
  ```json
  {
    "roomId": "room123",
    "webSocketUrl": "ws://localhost:3000/ws",
    "endpoints": {
      "fan": { "url": "http://localhost:3000/fan?roomId=room123&token=...", "token": "..." },
      "talent": { "url": "http://localhost:3000/talent?roomId=room123&token=...", "token": "..." },
      "sign": { "url": "http://localhost:3000/sign?roomId=room123&token=...", "token": "..." }
    }
  }
  ```
- ROOM_SECRET を元に HMAC で生成した決定的トークンを返します。再起動後も同じトークンになります。

## 画面仕様のポイント
- `/fan`  
  タレント映像を全画面表示し、右下のサインプレビューをリアルタイム更新。PeerConnection / シグナリング状態とエラーを表示し、PNG ダウンロードボタンで透明 PNG を保存します。
- `/talent`  
  ファン映像と自身のプレビューを同時表示。配信開始でカメラ・マイクを取得し、ミュート / カメラ切替 / 終了 / サイン作成（新タブで `/sign` を開く）を操作できます。
- `/sign`  
  1440×2560 のキャンバス上で描画。色（黒 / 赤 / 緑）、太さ（3 / 6 / 10px）、クリア、確定版送信を提供します。確定版送信で PNG Base64 を WebSocket へ送信し、fan / talent プレビューを更新します。

## アーキテクチャ
- **Next.js 14 (App Router)**: 画面レンダリングと API ルート
- **Express + ws**: `server/index.ts` で Next.js と同一プロセスで稼働
- **WebRTC**: `lib/webrtc.ts` で PeerConnection 管理、`config/webrtc.ts` で STUN 設定
- **WebSocket**: `/ws` にマウント。`SignalingHub` がシグナリングとキャンバスイベントを中継
- **型定義**: `types/signaling.ts` と `types/signature.ts` にメッセージ構造を集約

## Render デプロイ
1. Render リポジトリを接続し、本リポジトリを選択
2. Render サービス作成時に `render.yaml` を利用 (Infrastructure as Code)
3. 必要な環境変数 (ROOM_SECRET, NEXT_PUBLIC_BASE_URL, NEXT_PUBLIC_WS_URL) を Render ダッシュボードに設定
4. デプロイ後、`/healthz` が 200 を返すことを確認

## 動作確認手順
1. `npm run dev` を開始
2. 管理 API でルームを作成 (`curl` 例):
   ```bash
   curl -X POST http://localhost:3000/api/admin/createRoom \
     -H "Authorization: Bearer ${ROOM_SECRET}" \
     -H "Content-Type: application/json" \
     -d '{"roomId":"demo-room"}'
   ```
3. レスポンスに含まれる fan / talent / sign の URL を Chrome (PC) と Chrome (モバイルまたは別ウィンドウ) で開く
4. タレント画面で「配信を開始」を押し、カメラ・マイクを許可
5. fan 画面でタレント映像が表示され、サインプレビューがリアルタイム更新されることを確認
6. sign 画面で描画し、「確定版送信」を押下して fan / talent のプレビューが更新されることを確認
7. fan 画面で「PNGダウンロード」を押し、透明 PNG が保存できることを確認

## トラブルシューティング
- ブラウザの自動再生制限で映像が再生されない場合、表示された「視聴を開始」ボタンで手動再生してください。
- WebSocket が切断された場合は自動で再接続を試みますが、長時間復旧しない場合はページをリロードしてください。
- Render で WebRTC を利用する際は HTTPS / WSS を必ず利用し、`NEXT_PUBLIC_BASE_URL` と `NEXT_PUBLIC_WS_URL` を本番 URL に合わせて設定してください。

## ライセンス
本リポジトリはクローズド用途を想定しており、必要に応じて適切なライセンスを設定してください。
