# discord-csv-export-bot

Discord サーバーの参加者一覧を CSV 出力するシンプルなボットです。
このプログラムの99%はAIによる生成にて作成しました。

## 概要
- スラッシュコマンド `/export_members` を実行すると、サーバーのメンバー一覧を CSV に出力して返信します。実装本体は [index.js](index.js) の [`client`](index.js) イベントハンドラ内にあります。
- グローバルコマンドの登録ロジックは [index.js](index.js) の [`registerCommands`](index.js) / [`commands`](index.js) を使っています。開発用途でギルド単位に登録する別実装は [bak.index.js](bak.index.js) を参照してください。
- CSV 書き出しは [index.js](index.js) の [`createObjectCsvWriter`](index.js) を利用し、出力先ファイルは [`filePath`](index.js) で指定しています（実行後に一時ファイルを削除します）。

## 必要条件
- Node.js
- Discord Bot トークンとアプリケーションの CLIENT_ID
- 依存パッケージは [package.json](package.json) を参照

## セットアップ
1. リポジトリをクローン／取得
2. 依存関係をインストール:
   ```sh
   npm install

## ルートに.envファイルを作成
.env_sampleを参考に.envファイルを作成

## 実行方法
``` sh
node index.js
```