require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, AttachmentBuilder } = require("discord.js");
const { createObjectCsvWriter } = require("csv-writer");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// スラッシュコマンド定義
const commands = [
  new SlashCommandBuilder()
    .setName("export_members")
    .setDescription("参加者の一覧をCSVで出力します")
    .toJSON(),
];

// コマンド登録（グローバル）
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log("🔧 グローバルスラッシュコマンドを登録中...");
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("✅ スラッシュコマンド登録完了");
  } catch (error) {
    console.error("❌ スラッシュコマンド登録失敗:", error);
  }
}

// Bot起動時
client.once("ready", async () => {
  console.log(`✅ ログイン完了: ${client.user.tag}`);
  await registerCommands();
});

// スラッシュコマンド実行時
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "export_members") return;

  await interaction.deferReply();

  try {
    const guild = interaction.guild;
    await guild.members.fetch();

    const members = guild.members.cache.map((member) => ({
      username: member.user.tag || member.user.username,
      name: member.displayName,
      roles: member.roles.cache
        .filter(role => role.name !== "@everyone")
        .map(role => role.name)
        .join(", "),
    }));

    const filePath = path.join(__dirname, "members.csv");

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: "username", title: "ユーザー名" },
        { id: "name", title: "表示名" },
        { id: "roles", title: "ロール" },
      ],
    });

    await csvWriter.writeRecords(members);

    const file = new AttachmentBuilder(filePath);
    await interaction.editReply({
      content: "📄 メンバーリストを出力しました",
      files: [file],
    });

    fs.unlink(filePath, (err) => {
      if (err) console.error("⚠️ 一時ファイル削除失敗:", err);
    });

  } catch (err) {
    console.error("❌ エクスポートエラー:", err);
    await interaction.editReply("❌ エクスポート中にエラーが発生しました。");
  }
});

// Bot起動
client.login(process.env.DISCORD_TOKEN);


