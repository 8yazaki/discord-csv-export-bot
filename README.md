# discord-csv-export-bot-cloudflare

Discord サーバーの参加者一覧を CSV 出力するボットです。**Cloudflare Workers 上のみで動作**し、常時起動のサーバーやプロセスは不要です。
このプログラムの99%はAIによる生成にて作成しました。

## 概要
- Discord の [HTTP Interactions](https://discord.com/developers/docs/interactions/receiving-and-responding) 方式を採用しています。スラッシュコマンドが実行されると Discord があなたの Worker の URL に直接 HTTPS リクエストを送り、それに応答する仕組みです。
- Worker 本体は [src/index.js](src/index.js) です。
  - リクエストの署名検証（[`verifyKey`](src/index.js)）
  - `/export_members` コマンドを一旦保留応答（`DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`）してから、Discord REST API でメンバー一覧・ロール一覧を取得（[`fetchAllMembers`](src/index.js) / [`fetchRoleMap`](src/index.js)）
  - CSV 文字列を組み立て（[`buildCsv`](src/index.js)）、Webhook 経由で元の応答をファイル付きで編集（[`editOriginalResponse`](src/index.js)）
  - スラッシュコマンドの登録も Worker 自身が担います。`POST /register-commands` に `x-admin-secret` ヘッダー付きでリクエストすると、Discordにコマンドを登録します（[`handleRegisterCommands`](src/index.js)）。ローカルにNode.js実行環境を別途用意する必要はありません。

## 必要条件
- Cloudflare アカウント（Workers を無料枠でデプロイ可能）
- GitHub アカウント（Cloudflare の Git 連携を使う場合。このリポジトリは https://github.com/8yazaki/discord-csv-export-bot ）
- Discord Developer Portal で作成した Bot トークン / アプリケーション ID (`CLIENT_ID`) / Public Key
- ローカルから手動デプロイする場合のみ、`wrangler` CLI を実行するための Node.js が必要（[方法B](#方法b-ローカルからwranglerで手動デプロイする場合) 参照）

## セットアップ

### 1. Discord Developer Portal でアプリケーションを準備
1. https://discord.com/developers/applications でアプリケーションを作成（または既存のものを使用）
2. 「Bot」タブでトークンを発行
3. 「Bot」タブの **Privileged Gateway Intents** から **SERVER MEMBERS INTENT** を ON にする（メンバー一覧取得に必須）
4. 「General Information」タブで `APPLICATION ID`（= `CLIENT_ID`）と `PUBLIC KEY` を控える
5. Bot をサーバーに招待する。以下のURLの `<CLIENT_ID>` を手順4で控えた `APPLICATION ID` に置き換え、ブラウザで開いてサーバーを選択・認証してください。
   ```
   https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot+applications.commands&permissions=0
   ```
   - **`scope=bot` が含まれていることが重要です。** Developer Portal の「OAuth2 → URL Generator」や「Installation」タブでURLを生成する方法もありますが、特に「Installation」タブの初期設定では Guild Install のスコープが `applications.commands` のみになっていることがあり、その場合 **認証自体は成功してもBotユーザーがサーバーに参加せず、メンバー一覧に現れません**。確実に招待するには上記URLを直接使ってください。
   - Permissions は特に付与不要です（`permissions=0` のままでOK）。メンバー一覧取得に必要なのは手順3の Server Members Intent のみで、これはBotタブ側の設定です。
   - このBotは常時のGateway接続を持たない（HTTP Interactions方式の）ため、招待後もメンバー一覧では常に「オフライン」として表示されます。これは正常な状態です。サーバーの「オフラインメンバーを表示」設定がOFFだと見落とすので注意してください。

### 2. デプロイする（方法A・方法Bのどちらか）

#### 方法A: CloudflareのGit連携で自動デプロイする場合（推奨・PC不要）
ブラウザの操作だけで完結し、以後は `main` ブランチに push するたびに Cloudflare が自動でビルド・デプロイします。ローカルに Node.js や `wrangler` を用意する必要はありません。

1. Cloudflare ダッシュボード → **Workers & Pages** → **Create** → **Import a repository**（既存Workerがある場合は該当Worker → **Settings** → **Build** から Git 連携も可能）
2. このリポジトリ（`8yazaki/discord-csv-export-bot`）と対象ブランチ（`main`）を選択
3. ビルド設定はデフォルトのままでOK（`wrangler.toml` から自動検出されます。Deploy command が空欄の場合は `npx wrangler deploy` を指定）
4. 対象Workerの **Settings → Variables and Secrets** で以下をSecretとして追加（`ADMIN_SECRET` はコマンド登録エンドポイントを保護するための任意の文字列）
   - `DISCORD_TOKEN`
   - `DISCORD_PUBLIC_KEY`
   - `CLIENT_ID`
   - `ADMIN_SECRET`
5. 保存すると初回ビルドが走り、Workerがデプロイされます。表示された Worker の URL（例: `https://discord-csv-export-bot.<your-subdomain>.workers.dev`）を控えます。

#### 方法B: ローカルからwranglerで手動デプロイする場合
```sh
npm install
npx wrangler login
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put CLIENT_ID
npx wrangler secret put ADMIN_SECRET
npm run deploy
```
デプロイ後に表示される Worker の URL（例: `https://discord-csv-export-bot.<your-subdomain>.workers.dev`）を控えます。

### 3. Interactions Endpoint URL を設定
Discord Developer Portal の「General Information」タブにある **INTERACTIONS ENDPOINT URL** に、手順2で取得した Worker の URL を設定して保存します。Discord が Ping を送信し、Worker が正しく応答できれば保存が完了します。

### 4. スラッシュコマンドを登録
デプロイ済みの Worker に対して、コマンド定義を Discord に一度だけ登録します。コマンド内容を変更した時も再実行してください（`curl` があれば実行でき、ローカルにNode.js実行環境を用意する必要はありません）。
```sh
curl -X POST https://<your-worker-url>/register-commands \
  -H "x-admin-secret: <ADMIN_SECRETに設定した値>"
```

## 実行方法
デプロイ後は常駐プロセス不要で、Discord からのリクエストに応じて Worker が自動実行されます。

サーバー内で以下を実行すると、CSV ファイルが返信されます。
```
/export_members
```
メンバー一覧の流出を防ぐため、デフォルトでは「サーバー管理」権限を持つメンバーのみ実行できます（DMからの実行も不可）。実行を許可する対象は、Discordのサーバー設定 → **Integrations** → 対象アプリのコマンド設定から個別に変更できます。

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

## トラブルシューティング

### 認証(Authorize)は成功するのに、サーバーのメンバー一覧にBotが表示されない
招待に使ったURLの `scope` に `bot` が含まれていない可能性が高いです（[手順5](#1-discord-developer-portal-でアプリケーションを準備)参照）。Developer Portal の「Installation」タブなどでリンクを生成すると、Guild Installのデフォルトスコープが `applications.commands` のみになっている場合があり、この場合Botユーザー自体はサーバーに参加しません。手順5のURLを使い直して再度招待してください。

### Botの招待はできたが、メンバー一覧でオフラインになっている
HTTP Interactions方式のBotは常時のGateway接続を持たないため、常にオフライン表示になります。これは正常な状態です。「オフラインメンバーを表示」設定がONになっているか確認してください。

### Interactions Endpoint URL の保存時にエラーになる
- `GET https://<your-worker-url>/` にアクセスして `Discord CSV Export Bot is running.` が返るか確認してください（Workerが正しくデプロイされているか）。
- `DISCORD_PUBLIC_KEY` のSecretが正しく設定されているか確認してください（Bot TokenではなくPUBLIC KEYの値です）。

## 変更履歴
- 2026-07-18: Bot招待時に `scope=bot` が抜けているとBotがサーバーに追加されない問題について、招待手順を明確化しトラブルシューティング項目を追加
- 2026-07-16: セキュリティ・実運用耐性の改善（`/export_members`をサーバー管理権限保持者のみに制限、CSVフォーミュラインジェクション対策、Discord APIレート制限時の自動リトライ）
- 2026-07-05: CloudflareのGit連携によるデプロイ手順を追加し、デプロイ時にもローカルPC不要にできるように
- 2026-07-05: スラッシュコマンド登録をWorker内の`/register-commands`エンドポイントに統合し、ローカルNode.js環境（`.env`・登録スクリプト）が不要に
- 2026-07-02: Cloudflare Workers（HTTP Interactions）上で完結する構成に全面リニューアル（v2.0.0）
- 2025-10-21: 初版リリース
