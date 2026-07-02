// スラッシュコマンドを Discord に登録するためのローカル実行用スクリプト。
// Cloudflare Workers 本体には含めず、コマンド内容を変更した時だけ手動で実行する。
require("dotenv").config();

const { DISCORD_TOKEN, CLIENT_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error("❌ .env に DISCORD_TOKEN と CLIENT_ID を設定してください。");
  process.exit(1);
}

const commands = [
  {
    name: "export_members",
    description: "参加者の一覧をCSVで出力します",
  },
];

async function registerCommands() {
  console.log("🔧 グローバルスラッシュコマンドを登録中...");

  const res = await fetch(
    `https://discord.com/api/v10/applications/${CLIENT_ID}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    }
  );

  if (!res.ok) {
    console.error("❌ スラッシュコマンド登録失敗:", await res.text());
    process.exit(1);
  }

  console.log("✅ スラッシュコマンド登録完了");
}

registerCommands();
