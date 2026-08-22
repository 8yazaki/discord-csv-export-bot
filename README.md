# discord-csv-export-bot-cloudflare

Discord サーバーの参加者一覧を CSV 出力できるほか、ボタン/セレクトメニューでロールを付与・解除できる**ロールパネル機能**も備えたボットです。**Cloudflare Workers 上のみで動作**し、常時起動のサーバーやプロセスは不要です。
このプログラムの99%はAIによる生成にて作成しました。

## 目次
- [できること](#できること)
- [使い方](#使い方)
  - [CSVエクスポート（`/export_members`）](#csvエクスポートexport_members)
  - [ロールパネル（ボタン/セレクトでロールを付与・解除）](#ロールパネルボタンセレクトでロールを付与解除)
- [セットアップ（導入手順）](#セットアップ導入手順)
- [技術的な詳細（アーキテクチャ）](#技術的な詳細アーキテクチャ)
- [ローカル開発 / ログの確認](#ローカル開発)
- [トラブルシューティング](#トラブルシューティング)
- [変更履歴](#変更履歴)

## できること
| 機能 | コマンド | 誰が使える？ |
|---|---|---|
| 参加者一覧をCSVで出力 | `/export_members` | サーバー管理権限を持つメンバー |
| ロールパネルの管理（登録・投稿） | `/rolemap`, `/panel` | ロールの管理権限を持つメンバー |
| パネルのボタン/セレクトでロールを付与・解除 | （パネルを操作するだけ） | サーバーの全メンバー |

ロールパネル機能は絵文字リアクション方式ではなく、Discordのボタン/セレクトメニュー（Message Components）を使っています。CSVエクスポート機能とは完全に独立しているため、ロールパネルを使わないならその分のセットアップ（D1データベース作成）は不要です。

---

## 使い方

### CSVエクスポート（`/export_members`）
サーバー内で実行すると、CSVファイル（`members.csv`）が返信されます。
```
/export_members
```
- 出力内容: `ユーザー名, 表示名, ロール`
- デフォルトでは **「サーバー管理」権限を持つメンバーのみ**実行できます（DMからの実行も不可）。実行を許可する対象は、Discordのサーバー設定 → **Integrations** → 対象アプリのコマンド設定から個別に変更できます。

### ロールパネル（ボタン/セレクトでロールを付与・解除）

**全体の流れは3ステップです。**
1. `/rolemap add` で、パネルに使いたいロールを1つずつ登録する（管理者）
2. `/panel` で、登録したロールを含むパネルをチャンネルに投稿する（管理者）
3. メンバーがパネルのボタン/セレクトを操作すると、自分自身にロールが付与・解除される（全メンバー）

#### ① `/rolemap add` — ロールを登録する
パネルに含めたいロールを、先にこのコマンドで1つずつ登録しておく必要があります。

```
/rolemap add role:VIP label:VIP会員 emoji:🎉 description:VIP会員向けの特典ロールです style:Success（緑）
```

| オプション | 必須 | 説明 |
|---|:---:|---|
| `role` | ✅ | 登録したいロール（Discordのロール選択UIから選びます） |
| `label` | ✅ | ボタンやセレクトメニューに表示される名前 |
| `emoji` | - | 絵文字。Unicode絵文字（`🎉`）またはカスタム絵文字（`<:name:id>` / `<a:name:id>`）どちらも可 |
| `description` | - | 説明文。**セレクトメニューモードでのみ**表示されます |
| `style` | - | ボタンの色（**ボタンモードでのみ**使用）。`Secondary`（グレー・既定）/ `Primary`（青）/ `Success`（緑）/ `Danger`（赤） |

- `@everyone` ロールは登録できません。
- Bot連携ロール・サーバーブースト特典ロールなど、Discordが自動管理する「Managedロール」は登録できません。
- 同じロールに対してもう一度 `/rolemap add` を実行すると、`label`/`emoji`/`description`/`style` が上書きされます。

その他のサブコマンド:
```
/rolemap list                 # 登録済みロールの一覧を表示（ephemeral）
/rolemap remove role:VIP      # 登録を削除
```

#### ② `/panel` — パネルを投稿する
登録済みのロールを選んで、実際にメンバーが操作するパネルをそのチャンネルに投稿します。

```
/panel mode:ボタン role1:VIP role2:一般 title:ロール選択 body:欲しいロールのボタンを押してください
```

| オプション | 必須 | 説明 |
|---|:---:|---|
| `mode` | ✅ | 表示形式。`ボタン` または `セレクトメニュー` |
| `role1` | ✅ | パネルに含める1つ目のロール（**`/rolemap add` で登録済みのものだけ**指定できます） |
| `title` | - | パネルのタイトル |
| `body` | - | パネルの説明文 |
| `role2` 〜 `role20` | - | 2つ目以降のロール。**最大20個**まで指定可能 |

- パネルごとに異なるロールの組み合わせを持てます。「通知ロール用パネル」「地域ロール用パネル」のように目的別に複数投稿できます。
- 未登録のロールを指定するとエラーになり、どのロールが未登録か教えてくれます。先に `/rolemap add` で登録してください。
- ボタンモードは5個ずつ改行され、セレクトメニューモードは1つのドロップダウンにまとまります。ロール数が多いならセレクトメニュー、少なく見た目重視ならボタンがおすすめです。

#### ③ メンバーがパネルを操作する
| モード | 操作方法 |
|---|---|
| ボタン | 押すたびにロールをトグルします（未所持なら付与、所持済みなら解除）。結果は本人にのみ見える通知（ephemeral）で表示されます。 |
| セレクトメニュー | ロールを選んで確定すると、選んだ内容との差分（追加すべきロール・外すべきロール）だけがまとめて反映されます。全て未選択で確定すれば、そのパネルのロールを全て外せます。 |

> Discordの仕様上、セレクトメニューを開いた時点で「今持っているロールにチェックが付いた状態」で表示することはできません（新規に選び直す形になります）。

#### 権限まとめ
| コマンド/操作 | デフォルトで実行できる人 |
|---|---|
| `/rolemap`, `/panel` | **ロールの管理（Manage Roles）** 権限を持つメンバー（DM不可） |
| パネルのボタン/セレクト操作 | **サーバーの全メンバー**（自分自身へのロール付与・解除のため） |

実行を許可する対象は、Discordのサーバー設定 → **Integrations** → 対象アプリのコマンド設定から個別に変更できます。

---

## セットアップ（導入手順）

### 必要条件
- Cloudflare アカウント（Workers を無料枠でデプロイ可能）
- GitHub アカウント（Cloudflare の Git 連携を使う場合。このリポジトリは https://github.com/8yazaki/discord-csv-export-bot ）
- Discord Developer Portal で作成した Bot トークン / アプリケーション ID (`CLIENT_ID`) / Public Key
- ローカルから手動デプロイする場合のみ、`wrangler` CLI を実行するための Node.js が必要（[方法B](#方法b-ローカルからwranglerで手動デプロイする場合) 参照）
- **ロールパネル機能を使う場合のみ**、Cloudflare D1データベース（無料枠内で利用可能）が必要です。CSV出力機能のみ使う場合は不要です。

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
   - 既にBotを招待済みで権限だけ後から追加したい場合は、再招待は不要です。サーバー設定 → ロール → Botのロールの権限一覧から「ロールの管理」をONにするだけで反映されます。
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
   4. `wrangler.toml` の `[[d1_databases]]` にある `database_name`/`database_id` を、作成したデータベースの値に書き換えて `main` に push（ダッシュボードでBindingを追加しただけでは `wrangler.toml` との差分でビルド時に上書き・警告される場合があるため、リポジトリ側も揃えておくことを推奨）

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
出力された `database_id`（と `database_name`）を `wrangler.toml` の `[[d1_databases]]` ブロックに書き込んでから、マイグレーションを適用して再デプロイします。
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

登録直後は候補に出るまで少し時間がかかることがあります。すぐ出ない場合はDiscordクライアントを再起動（デスクトップ版は `Ctrl+R` でも可）してみてください。

---

## 技術的な詳細（アーキテクチャ）

このセクションはコードを読む・改修する人向けの内部実装の説明です。導入や普段の利用には読む必要はありません。

### 全体構成
- Discord の [HTTP Interactions](https://discord.com/developers/docs/interactions/receiving-and-responding) 方式を採用しています。スラッシュコマンドやボタン/セレクトメニューの操作が行われると Discord があなたの Worker の URL に直接 HTTPS リクエストを送り、それに応答する仕組みです（Gatewayへの常時接続は行いません）。
- **絵文字リアクション方式は採用していません。** `MESSAGE_REACTION_ADD` イベントは Gateway (WebSocket) 経由でしか配信されず、常時接続を持たない Cloudflare Workers の HTTP Interactions方式では原理的に受け取れないためです。
- ファイル構成:
  - [`src/index.js`](src/index.js): エントリポイント。署名検証、interaction typeごとのルーティング、`/export_members` のロジック本体
  - [`src/discord.js`](src/discord.js): Discord REST API呼び出しの共有ヘルパー（`discordFetch`, `editOriginalResponse` など）
  - [`src/roles/`](src/roles/): ロールパネル機能一式
    - [`db.js`](src/roles/db.js): D1データベース（`role_map` / `panels` / `panel_roles` テーブル）へのCRUD
    - [`commands.js`](src/roles/commands.js): `/rolemap`, `/panel` コマンドのハンドラ
    - [`components.js`](src/roles/components.js): ボタン・セレクトメニュー押下時のロール付与/解除処理
    - [`ui.js`](src/roles/ui.js): Embed・ボタン・セレクトメニューの組み立て
  - [`migrations/0001_init.sql`](migrations/0001_init.sql): ロールパネル機能用D1テーブル（`role_map` / `panels` / `panel_roles`）の定義。セットアップ時にD1のConsoleへ貼り付けるか、`wrangler d1 migrations apply` で適用します
  - [`wrangler.toml`](wrangler.toml): Worker名・D1バインディングなどのCloudflare設定
  - `POST /register-commands` に `x-admin-secret` ヘッダー付きでリクエストすると、登録済みの全コマンドをDiscordに登録します（[`handleRegisterCommands`](src/index.js)）。ローカルNode.js環境は不要です。

### CSVエクスポートのアルゴリズム
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

### ロールパネルの実装ポイント
- **`custom_id` の改竄対策**: ボタンの `custom_id`（`role:<role_id>`）はクライアント由来で改竄され得るため、押下時は必ず `role_map` に登録済みのロールかをD1で検証してから処理します（[`handleRoleButton`](src/roles/components.js)）。
- **3秒応答制限への対応**: ボタン（REST呼び出し1回）は即時応答、パネル投稿・セレクトの差分更新（REST呼び出しが複数になり得る）は保留応答（`type:5`）してから `ctx.waitUntil()` でバックグラウンド処理し、後から結果をWebhookで書き戻します。
- **差分更新**: セレクトメニューでは、選択されたロール集合 `S`・パネルの対象ロール集合 `P`・メンバーの現在ロール集合 `C` から、付与すべきロール（`S - C`）と剥奪すべきロール（`(P ∩ C) - S`）だけを計算し、変更が必要なロールにのみREST呼び出しを行います。
- **レート制限対応**: `429`時は共通ラッパー [`discordFetch`](src/discord.js) が自動リトライします（CSV出力機能と共通）。
- **既知の制約**:
  - `/panel edit` のようなパネル編集コマンドは未実装です。ロール構成を変えたい場合は `/rolemap` を更新した上で `/panel` を投稿し直してください。
  - Discordの仕様上、セレクトメニューの「選択済み」状態をユーザーごとに出し分けて表示することはできません。

---

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
D1データベースが未セットアップ、または `wrangler.toml` の `[[d1_databases]]` に自分の環境の `database_id` が設定されていない可能性があります。[セットアップ手順2の6（方法A）／方法B末尾](#2-デプロイする方法a方法bのどちらか)を参照し、D1データベースの作成・バインディング・マイグレーション適用を行ってから `/register-commands` を再実行してください。

### `/rolemap` `/panel` が候補一覧に出てこない
`/register-commands` をまだ実行していない可能性が高いです（[セットアップ手順4](#4-スラッシュコマンドを登録)参照）。実行済みなら、Discordクライアントの再起動で反映されることが多いです。

### `role:` オプションで、作成したばかりのロールが選択肢に出てこない
これはBotコード側の問題ではなく、Discordクライアントのロールキャッシュが最新化されていないことが原因のことが多いです。ロール名の一部を入力して検索する、クライアントを再起動する、少し時間を置く、のいずれかで解消することがほとんどです。

## 変更履歴
- 2026-08-23: READMEを再構成（使い方を先頭に、セットアップ・技術的詳細を分離して見通しを改善）
- 2026-08-22: ロールパネル機能（`/rolemap` `/panel`、ボタン/セレクトメニューでのロール付与・解除）を追加。D1データベースが必要（CSV出力機能のみ使う場合は不要、`wrangler.toml`もデフォルトでコメントアウト）
- 2026-07-18: Bot招待時に `scope=bot` が抜けているとBotがサーバーに追加されない問題について、招待手順を明確化しトラブルシューティング項目を追加
- 2026-07-16: セキュリティ・実運用耐性の改善（`/export_members`をサーバー管理権限保持者のみに制限、CSVフォーミュラインジェクション対策、Discord APIレート制限時の自動リトライ）
- 2026-07-05: CloudflareのGit連携によるデプロイ手順を追加し、デプロイ時にもローカルPC不要にできるように
- 2026-07-05: スラッシュコマンド登録をWorker内の`/register-commands`エンドポイントに統合し、ローカルNode.js環境（`.env`・登録スクリプト）が不要に
- 2026-07-02: Cloudflare Workers（HTTP Interactions）上で完結する構成に全面リニューアル（v2.0.0）
- 2025-10-21: 初版リリース
