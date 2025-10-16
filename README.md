# Online Sign System

ブラウザ上で 1 対 1 のビデオ通話と、リアルタイムで同期されるサインキャンバスを提供するオンラインサイン会アプリケーションです。Next.js 14 (App Router) と WebRTC / WebSocket を用いて、タレントが別タブで描いたサインをファン側に即座に反映し、PNG としてダウンロードできます。Render へのデプロイを前提とした構成になっています。

## 主な機能

- `/fan` ファン用画面：タレントの映像を大きく表示し、右下の「色紙エリア」でサインをリアルタイムにプレビュー。PNG ダウンロード対応（1440×2560、透過）。
- `/talent` タレント用画面：ファンの映像受信、自身の映像プレビュー、ミュート・カメラ・終了・サイン起動ボタン。
- `/sign` サイン入力画面：9:16 縦長キャンバス (1440×2560) に対してタッチ/マウスで描画。黒/赤/緑、太さ 3/6/10px、クリア、確定版送信。
- WebRTC (STUN: `stun:stun.l.google.com:19302`) で 1 対 1 ビデオ通話を実現し、WebSocket (`/ws`) を用いてシグナリングとサインストロークを共有。
- 管理 API `POST /api/admin/createRoom` でルームと各種 URL（fan / talent / sign）を発行。ROOM_SECRET で保護。

## 技術スタック

- Next.js 14（App Router） + TypeScript
- Tailwind CSS
- Express + ws（/ws に WebSocket サーバをマウント）
- WebRTC (ブラウザ API)
- Canvas API

## セットアップ

```bash
npm install
```

環境変数は `.env` に設定します。サンプル: `.env.example`

```
ROOM_SECRET=super-secret-room-token
NEXT_PUBLIC_WS_URL=
NEXT_PUBLIC_BASE_URL=
PORT=3000
```

- `ROOM_SECRET`: ルーム発行 API への Bearer トークン。必須。
- `NEXT_PUBLIC_WS_URL`: WebSocket エンドポイントを固定する場合に指定（空の場合は現在のオリジンを使用）。
- `NEXT_PUBLIC_BASE_URL`: Render などで Origin を解決できない場合に設定。

### 開発サーバ

```bash
npm run dev
```

`http://localhost:3000` で Next.js + Express + WebSocket の開発サーバが起動します。初回アクセス時にはブラウザでカメラ・マイク許可と、Canvas 描画用のタッチ/マウス操作を有効化してください。

### ビルド & 本番起動

```bash
npm run build
npm run start
```

`start` は `NODE_ENV=production` でビルド済みサーバ (`dist/server/server/index.js`) を起動します。

## 管理 API

ルーム作成用エンドポイント:

```
POST /api/admin/createRoom
Authorization: Bearer <ROOM_SECRET>
Content-Type: application/json

{
  "roomId": "任意指定 (省略時は自動生成)"
}
```

成功時レスポンス例:

```json
{
  "roomId": "f8e1...",
  "fanUrl": "https://example.com/fan?room=...&token=...",
  "talentUrl": "https://example.com/talent?room=...&token=...&signToken=...",
  "signUrl": "https://example.com/sign?room=...&token=..."
}
```

発行された URL をそれぞれのユーザーに共有してください。タレント用 URL にはサイン用トークン (`signToken`) も含まれるため、「サインを書く」ボタンで直接 `/sign` を開けます。

## 動作確認フロー

1. `POST /api/admin/createRoom` で新しいルームを作成。
2. 異なるブラウザ/端末で `fanUrl` と `talentUrl` を開き、通話開始ボタンを押下してメディア取得。
3. `talent` 側でサインページを開き、Canvas に描くと `fan` 画面右下に即時反映される。
4. `fan` の「PNGダウンロード」または `sign` の「PNGプレビュー保存」で 1440×2560 の透明 PNG を保存。

## Render デプロイ

`render.yaml` が Render の Blueprint 形式で含まれています。Render ダッシュボードで Blueprint デプロイを選択すると、以下のコマンドが実行されます。

- Build: `npm install && npm run build`
- Start: `npm run start`

環境変数として少なくとも `ROOM_SECRET` を設定してください。`NEXT_PUBLIC_BASE_URL` を Render のホストに合わせて設定しておくと、管理 API が正しい URL を返せます。WebSocket は同一オリジン `/ws` にマウントされます。

## 注意事項

- 現状、ルーム情報はメモリ上に保持されます。サーバ再起動時には再度ルームを作成してください。
- TURN サーバは実装していません。必要であれば `config/webrtc.ts` の `ICE_SERVERS` を拡張してください。
- iOS Safari での再生互換性のため、映像要素には `playsInline` とユーザー操作による再生開始を適用しています。
- セキュリティのため、必ず HTTPS 環境でデプロイしてください（Render では自動的に HTTPS 化されます）。
