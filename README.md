# discord-csv-export-bot-cloudflare

Discord サーバーの参加者一覧を CSV 出力するボットです。**Cloudflare Workers 上のみで動作**し、常時起動のサーバーやプロセスは不要です。
このプログラムの99%はAIによる生成にて作成しました。

## 概要
- Discord の [HTTP Interactions](https://discord.com/developers/docs/interactions/receiving-and-responding) 方式を採用しています。スラッシュコマンドが実行されると Discord があなたの Worker の URL に直接 HTTPS リクエストを送り、それに応答する仕組みです。
- Worker 本体は [src/index.js](src/index.js) です。
  - リクエストの署名検証（[`verifyKey`](src/index.js)）
  - `/export_members` コマンドを一旦保留応答（`DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`）してから、Discord REST API でメンバー一覧・ロール一覧を取得（[`fetchAllMembers`](src/index.js) / [`fetchRoleMap`](src/index.js)）
  - CSV 文字列を組み立て（[`buildCsv`](src/index.js)）、Webhook 経由で元の応答をファイル付きで編集（[`editOriginalResponse`](src/index.js)）
- スラッシュコマンドの登録は Worker とは別に、ローカルから一度だけ実行するスクリプト [scripts/register-commands.js](scripts/register-commands.js) で行います。

## 必要条件
- Node.js（コマンド登録スクリプトの実行、および `wrangler` CLI 用）
- Cloudflare アカウント（Workers を無料枠でデプロイ可能）
- Discord Developer Portal で作成した Bot トークン / アプリケーション ID (`CLIENT_ID`) / Public Key
- 依存パッケージは [package.json](package.json) を参照

## セットアップ

### 1. リポジトリを取得し、依存関係をインストール
```sh
npm install
```

### 2. Discord Developer Portal でアプリケーションを準備
1. https://discord.com/developers/applications でアプリケーションを作成（または既存のものを使用）
2. 「Bot」タブでトークンを発行
3. 「Bot」タブの **Privileged Gateway Intents** から **SERVER MEMBERS INTENT** を ON にする（メンバー一覧取得に必須）
4. 「General Information」タブで `APPLICATION ID`（= `CLIENT_ID`）と `PUBLIC KEY` を控える
5. Bot をサーバーに招待する（OAuth2 URL Generator で `bot` および `applications.commands` スコープ、`Server Members Intent` に対応する権限を付与）

### 3. .env ファイルを作成（コマンド登録スクリプト用）
[.env_sample](.env_sample) を参考に `.env` ファイルを作成してください。

```
DISCORD_TOKEN=あなたのBotトークン
CLIENT_ID=あなたのアプリケーションID
DISCORD_PUBLIC_KEY=あなたのアプリケーションのPublic Key
```

### 4. スラッシュコマンドを登録
Worker とは別に、コマンド定義を Discord に一度だけ登録します。コマンド内容を変更した時も再実行してください。
```sh
npm run register
```

### 5. Cloudflare Workers に Secret を設定
Bot トークンと Public Key は `wrangler.toml` に書かず、Secret として登録します。
```sh
npx wrangler login
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
```

### 6. デプロイ
```sh
npm run deploy
```
デプロイ後に表示される Worker の URL（例: `https://discord-csv-export-bot.<your-subdomain>.workers.dev`）を控えます。

### 7. Interactions Endpoint URL を設定
Discord Developer Portal の「General Information」タブにある **INTERACTIONS ENDPOINT URL** に、手順6で取得した Worker の URL を設定して保存します。Discord が Ping を送信し、Worker が正しく応答できれば保存が完了します。

## 実行方法
デプロイ後は常駐プロセス不要で、Discord からのリクエストに応じて Worker が自動実行されます。

サーバー内で以下を実行すると、CSV ファイルが返信されます。
```
/export_members
```

## ローカル開発
```sh
npm run dev
```
`wrangler dev` を起動し、ローカルで Worker を実行できます（署名検証があるため、実際に Discord からのリクエストを受けるには [wrangler dev --remote](https://developers.cloudflare.com/workers/wrangler/commands/#dev) やトンネリングツールなどで公開 URL を用意する必要があります）。

## ログの確認
```sh
npm run tail
```
デプロイ済み Worker のリアルタイムログを確認できます。

## 変更履歴
- 2026-07-02: Cloudflare Workers（HTTP Interactions）上で完結する構成に全面リニューアル（v2.0.0）
- 2025-10-21: 初版リリース
