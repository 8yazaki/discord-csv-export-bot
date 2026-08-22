# discord-csv-export-bot-cloudflare

Discord サーバーの参加者一覧を CSV 出力できるほか、ボタン/セレクトメニューでロールを付与・解除できる**ロールパネル機能**も備えたボットです。**Cloudflare Workers 上のみで動作**し、常時起動のサーバーやプロセスは不要です。
このプログラムの99%はAIによる生成にて作成しました。

## 概要
- Discord の [HTTP Interactions](https://discord.com/developers/docs/interactions/receiving-and-responding) 方式を採用しています。スラッシュコマンドやボタン/セレクトメニューの操作が行われると Discord があなたの Worker の URL に直接 HTTPS リクエストを送り、それに応答する仕組みです（Gatewayへの常時接続は行いません）。
- Worker のエントリポイントは [src/index.js](src/index.js) です。
  - リクエストの署名検証（[`verifyKey`](src/index.js)）
  - `/export_members` コマンドを一旦保留応答（`DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`）してから、Discord REST API でメンバー一覧・ロール一覧を取得（[`fetchAllMembers`](src/index.js) / [`fetchRoleMap`](src/index.js)）
  - CSV 文字列を組み立て（[`buildCsv`](src/index.js)）、Webhook 経由で元の応答をファイル付きで編集（[`editOriginalResponse`](src/discord.js)）
  - `/rolemap`, `/panel` コマンドおよびボタン/セレクトメニューの操作は [src/roles/](src/roles/) 配下に分離されています（詳細は後述の[ロールパネル機能](#ロールパネル機能ボタンセレクトでロール付与解除)）
  - スラッシュコマンドの登録も Worker 自身が担います。`POST /register-commands` に `x-admin-secret` ヘッダー付きでリクエストすると、登録済みの全コマンド（`/export_members` `/rolemap` `/panel`）をDiscordに登録します（[`handleRegisterCommands`](src/index.js)）。ローカルにNode.js実行環境を別途用意する必要はありません。

## アルゴリズム
`/export_members` 実行時、Worker（[src/index.js](src/index.js)）は以下の順で処理します。

1. **署名検証**: リクエストヘッダーの `x-signature-ed25519` / `x-signature-timestamp` を、Discordの公開鍵で [`verifyKey`](src/index.js) を使って検証します。不正なリクエストは `401` で拒否します。
2. **即時の保留応答**: Discordは3秒以内の応答を要求するため、実際のCSV生成は待たずに `type: 5`（`DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`）を即座に返します。CSV生成本体（[`exportMembers`](src/index.js)）は `ctx.waitUntil()` でバックグラウンド実行に回し、応答後も処理を継続させます。
3. **メンバー・ロールの並列取得**（[`exportMembers`](src/index.js)）
   - [`fetchAllMembers`](src/index.js): Discord REST API の `GET /guilds/{guildId}/members` は1回の呼び出しで最大1000件までしか返さないため、`after` パラメータに直前チャンクの最後のユーザーIDを渡しながら、返却件数が1000件未満になるまでページングを繰り返して全メンバーを収集します。
   - [`fetchRoleMap`](src/index.js): `GET /guilds/{guildId}/roles` でロール一覧を取得し、`ロールID → ロール名` の `Map` を構築します。
   - 上記2つは `Promise.all` で並列に実行します。
4. **共通APIラッパーでのレート制限対応**（[`discordFetch`](src/discord.js)）: Discord APIが `429`（レート制限）を返した場合、レスポンスの `Retry-After` ヘッダーの秒数だけ待機してから、最大3回まで自動リトライします。
5. **行データへの変換**: 取得したメンバーごとに以下を組み立てます。
   - `ユーザー名`: `discriminator` が `"0"`（新ユーザー名体系）でない場合のみ `username#discriminator` 形式にし、それ以外は `username` のみ
   - `表示名`: サーバーニックネーム（`nick`）→ グローバル表示名（`global_name`）→ `username` の優先順で採用
   - `ロール`: メンバーが持つロールIDから `@everyone`（ギルドIDと同一のロール）を除外し、`fetchRoleMap` で名前に変換してカンマ区切りに連結
6. **CSV組み立て**（[`buildCsv`](src/index.js)）
   - ヘッダー行（`ユーザー名,表示名,ロール`）と各行を生成
   - [`csvEscape`](src/index.js) で値ごとにエスケープ処理: `"` `,` 改行を含む場合はダブルクォートで囲み、内部の `"` は `""` に置換。さらに値の先頭が `= + - @` やタブ・改行文字の場合はCSVフォーミュラインジェクション対策として先頭にシングルクォート `'` を付与し、Excel/Sheets側で数式として評価されないようにする
   - Excelで開いた際の文字化けを防ぐため、先頭にUTF-8 BOMを付与
7. **元の応答の編集**（[`editOriginalResponse`](src/discord.js)）: Discord Webhook API（`PATCH /webhooks/{application_id}/{token}/messages/@original`）に対し、`multipart/form-data` でメッセージ本文とCSVファイル（`members.csv`）を送信し、手順2で返した保留応答をファイル付きメッセージに差し替えます。
8. **エラー時の挙動**: 上記のいずれかで例外が発生した場合はログ出力のうえ、保留応答を「❌ エクスポート中にエラーが発生しました。」というメッセージに差し替えます。

## ロールパネル機能（ボタン/セレクトでロール付与・解除）

サーバー内にボタンまたはセレクトメニュー付きのメッセージ（パネル）を投稿し、メンバーがそれを押すと自分自身にロールが付与・解除される機能です。CSV出力機能とは独立した機能で、CSV出力を使わない場合はセットアップ（後述のD1データベース作成）を省略できます。

- **絵文字リアクション方式は採用していません。** `MESSAGE_REACTION_ADD` イベントは Gateway (WebSocket) 経由でしか配信されず、常時接続を持たない Cloudflare Workers の HTTP Interactions方式では原理的に受け取れないためです。
- 実装は [src/roles/](src/roles/) 配下にあります。
  - [`src/roles/db.js`](src/roles/db.js): D1データベース（`role_map` / `panels` / `panel_roles` テーブル）へのCRUD
  - [`src/roles/commands.js`](src/roles/commands.js): `/rolemap`, `/panel` コマンドのハンドラ
  - [`src/roles/components.js`](src/roles/components.js): ボタン・セレクトメニュー押下時のロール付与/解除処理
  - [`src/roles/ui.js`](src/roles/ui.js): Embed・ボタン・セレクトメニューの組み立て

### 使い方（管理者）
1. `/rolemap add role:<ロール> label:<表示名> [emoji] [description] [style]` で、パネルに含めたいロールを1つずつ登録します（`@everyone` やBot連携・ブースター特典などのManagedロールは登録できません）。
2. `/rolemap list` で登録済みロールを確認できます。不要になったら `/rolemap remove role:<ロール>` で削除します。
3. `/panel mode:<button|select> [title] [body] role1:<ロール> [role2] ... [role20]` を実行すると、指定したロール（最大20個、`/rolemap add`で登録済みのもの限定）を含むパネルがそのチャンネルに投稿されます。パネルごとに異なるロールの組み合わせを持てるため、目的別に複数のパネルを使い分けられます。

### 使い方（メンバー）
- ボタンモード: 押すとそのロールをトグル（未所持なら付与、所持済みなら解除）します。結果は本人にのみ見えるメッセージ（ephemeral）で返されます。
- セレクトメニューモード: 選択した状態で確定すると、選択したロールとの差分（追加すべきロール・外すべきロール）だけをまとめて反映します。全選択解除も可能です（Discordの仕様上、開いた時点で「選択済み」の表示はされません）。

### セキュリティ・実装上のポイント
- ボタンの `custom_id`（`role:<role_id>`）はクライアント由来で改竄され得るため、押下時は必ず `role_map` に登録済みのロールかをD1で検証してから処理します（[`handleRoleButton`](src/roles/components.js)）。
- Discordの初回応答期限は3秒のため、ボタン（REST呼び出し1回）は即時応答、パネル投稿・セレクトの差分更新（REST呼び出しが複数になり得る）は保留応答（`type:5`）してから `ctx.waitUntil()` でバックグラウンド処理し、後から結果をWebhookで書き戻します。
- レート制限（429）時は共通ラッパー [`discordFetch`](src/discord.js) が自動リトライします（CSV出力機能と共通）。

### 既知の制約
- ロール階層: Botのロールが付与対象のロールより**上位**にないと `50013 Missing Permissions` エラーになります（後述のセットアップ参照）。
- `/panel edit` のようなパネル編集コマンドは未実装です。ロール構成を変えたい場合は `/rolemap` を更新した上で `/panel` を投稿し直してください。

## 必要条件
- Cloudflare アカウント（Workers を無料枠でデプロイ可能）
- GitHub アカウント（Cloudflare の Git 連携を使う場合。このリポジトリは https://github.com/8yazaki/discord-csv-export-bot ）
- Discord Developer Portal で作成した Bot トークン / アプリケーション ID (`CLIENT_ID`) / Public Key
- ローカルから手動デプロイする場合のみ、`wrangler` CLI を実行するための Node.js が必要（[方法B](#方法b-ローカルからwranglerで手動デプロイする場合) 参照）
- **ロールパネル機能を使う場合のみ**、Cloudflare D1データベース（無料枠内で利用可能）が必要です。CSV出力機能のみ使う場合は不要です。

## セットアップ

### 1. Discord Developer Portal でアプリケーションを準備
1. https://discord.com/developers/applications でアプリケーションを作成（または既存のものを使用）
2. 「Bot」タブでトークンを発行
3. 「Bot」タブの **Privileged Gateway Intents** から **SERVER MEMBERS INTENT** を ON にする（メンバー一覧取得に必須）
4. 「General Information」タブで `APPLICATION ID`（= `CLIENT_ID`）と `PUBLIC KEY` を控える
5. Bot をサーバーに招待する。以下のURLの `<CLIENT_ID>` を手順4で控えた `APPLICATION ID` に置き換え、ブラウザで開いてサーバーを選択・認証してください。
   ```
   https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot+applications.commands&permissions=268435456
   ```
   - **`scope=bot` が含まれていることが重要です。** Developer Portal の「OAuth2 → URL Generator」や「Installation」タブでURLを生成する方法もありますが、特に「Installation」タブの初期設定では Guild Install のスコープが `applications.commands` のみになっていることがあり、その場合 **認証自体は成功してもBotユーザーがサーバーに参加せず、メンバー一覧に現れません**。確実に招待するには上記URLを直接使ってください。
   - `permissions=268435456` は **Manage Roles（ロールの管理）** 権限です。ロールパネル機能（`/rolemap` `/panel`）でメンバーにロールを付与・解除するために必要です。CSVエクスポート機能のみ使う場合は `permissions=0` でも構いません（メンバー一覧取得に必要なのは手順3の Server Members Intent のみです）。
   - **ロール階層に注意してください。** Discordの仕様上、BotはBot自身より**上位**のロールを付与・解除できません。サーバー設定の「ロール」画面で、Botのロール（通常はアプリケーション名のロール）を、ロールパネルで扱いたい全てのロールより上に配置してください。配置し忘れると付与/解除時に「Botの権限が不足しています」というエラーになります。
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
6. **ロールパネル機能（`/rolemap` `/panel`）を使う場合のみ**、D1データベースをセットアップします（CSV出力機能のみでよければスキップ可）。
   1. Cloudflare ダッシュボード → **Workers & Pages → D1 SQL Database → Create Database** でデータベースを作成（名前は任意、例: `discord-role-panel-bot`）
   2. 作成したデータベースの **Console** タブを開き、[`migrations/0001_init.sql`](migrations/0001_init.sql) の中身を貼り付けて実行し、テーブルを作成する
   3. 対象Workerの **Settings → Bindings → Add → D1 Database** で、Variable name に `DB`、Database に作成したデータベースを選んで保存する
   4. `wrangler.toml` の `[[d1_databases]]` ブロックのコメントを外し、`database_id` を実際のIDに置き換えて `main` に push（ダッシュボードでBindingを追加しただけでは `wrangler.toml` との差分でビルド時に上書き・警告される場合があるため、リポジトリ側も揃えておくことを推奨）

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

**ロールパネル機能（`/rolemap` `/panel`）を使う場合のみ**、続けてD1データベースをセットアップします（CSV出力機能のみでよければスキップ可）。
```sh
npx wrangler d1 create discord-role-panel-bot
```
出力された `database_id` を `wrangler.toml` の `[[d1_databases]]` ブロック（コメントアウトされているので外す）に貼り付けてから、マイグレーションを適用して再デプロイします。
```sh
npx wrangler d1 migrations apply discord-role-panel-bot --remote
npm run deploy
```

### 3. Interactions Endpoint URL を設定
Discord Developer Portal の「General Information」タブにある **INTERACTIONS ENDPOINT URL** に、手順2で取得した Worker の URL を設定して保存します。Discord が Ping を送信し、Worker が正しく応答できれば保存が完了します。

### 4. スラッシュコマンドを登録
デプロイ済みの Worker に対して、コマンド定義（`/export_members` `/rolemap` `/panel`）を Discord に一度だけ登録します。コマンド内容を変更した時も再実行してください（`curl` があれば実行でき、ローカルにNode.js実行環境を用意する必要はありません）。
```sh
curl -X POST https://<your-worker-url>/register-commands \
  -H "x-admin-secret: <ADMIN_SECRETに設定した値>"
```
ロールパネル機能を使う場合は、先に手順2のD1セットアップを済ませてからこのコマンドを実行してください。D1未設定のまま `/rolemap` `/panel` を実行するとエラーになります。

## 実行方法
デプロイ後は常駐プロセス不要で、Discord からのリクエストに応じて Worker が自動実行されます。

サーバー内で以下を実行すると、CSV ファイルが返信されます。
```
/export_members
```
メンバー一覧の流出を防ぐため、デフォルトでは「サーバー管理」権限を持つメンバーのみ実行できます（DMからの実行も不可）。実行を許可する対象は、Discordのサーバー設定 → **Integrations** → 対象アプリのコマンド設定から個別に変更できます。

ロールパネル機能（D1セットアップ済みの場合）は以下のコマンドで使用できます。いずれもデフォルトでは **ロールの管理（Manage Roles）** 権限を持つメンバーのみ実行できます（DMからの実行も不可）。
```
/rolemap add role:<ロール> label:<表示名> [emoji] [description] [style]   # ロールを登録
/rolemap remove role:<ロール>                                             # 登録解除
/rolemap list                                                             # 登録済み一覧
/panel mode:<button|select> [title] [body] role1:<ロール> [role2]...[role20]  # パネルを投稿
```
パネルに投稿されたボタン/セレクトメニューは、`MANAGE_ROLES` 権限の有無に関わらず**サーバーの全メンバー**が操作できます（自分自身へのロール付与・解除のため）。

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

### ロールパネルのボタン/セレクトを押すと「Botの権限が不足しています」と表示される
Discordのロール階層で、Botのロールが付与対象のロールより**下位**にある可能性が高いです。サーバー設定の「ロール」画面で、Botのロールを付与対象ロールより上に並べ替えてください（[セットアップ手順1](#1-discord-developer-portal-でアプリケーションを準備)参照）。

### `/rolemap` `/panel` を実行するとエラーになる・応答がない
D1データベースが未セットアップ、または `wrangler.toml` の `[[d1_databases]]` がコメントアウトされたままの可能性があります。[セットアップ手順2の6（方法A）／方法B末尾](#2-デプロイする方法a方法bのどちらか)を参照し、D1データベースの作成・バインディング・マイグレーション適用を行ってから `/register-commands` を再実行してください。

## 変更履歴
- 2026-08-22: ロールパネル機能（`/rolemap` `/panel`、ボタン/セレクトメニューでのロール付与・解除）を追加。D1データベースが必要（CSV出力機能のみ使う場合は不要、`wrangler.toml`もデフォルトでコメントアウト）
- 2026-07-18: Bot招待時に `scope=bot` が抜けているとBotがサーバーに追加されない問題について、招待手順を明確化しトラブルシューティング項目を追加
- 2026-07-16: セキュリティ・実運用耐性の改善（`/export_members`をサーバー管理権限保持者のみに制限、CSVフォーミュラインジェクション対策、Discord APIレート制限時の自動リトライ）
- 2026-07-05: CloudflareのGit連携によるデプロイ手順を追加し、デプロイ時にもローカルPC不要にできるように
- 2026-07-05: スラッシュコマンド登録をWorker内の`/register-commands`エンドポイントに統合し、ローカルNode.js環境（`.env`・登録スクリプト）が不要に
- 2026-07-02: Cloudflare Workers（HTTP Interactions）上で完結する構成に全面リニューアル（v2.0.0）
- 2025-10-21: 初版リリース
