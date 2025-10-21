require("dotenv").config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, AttachmentBuilder } = require("discord.js");
const { createObjectCsvWriter } = require("csv-writer");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

const commands = [
  new SlashCommandBuilder()
    .setName("export_members")
    .setDescription("参加者の一覧をCSVで出力します"),
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

// スラッシュコマンド登録
(async () => {
  try {
    console.log("🔧 スラッシュコマンドを登録中...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("✅ コマンド登録完了");
  } catch (error) {
    console.error(error);
  }
})();

// Bot起動時
client.once("ready", () => {
  console.log(`✅ ログイン完了: ${client.user.tag}`);
});

// コマンド実行時
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "export_members") {
    await interaction.deferReply();

    const guild = interaction.guild;
    await guild.members.fetch(); // メンバーをすべて取得

    const members = guild.members.cache.map((member) => ({
      username: member.user.tag, 
      name: member.displayName,
      roles: member.roles.cache
        .filter(role => role.name !== "@everyone")
        .map(role => role.name)
        .join(", "),
    }));

    const filePath = "members.csv";

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: "username", title: "UserName" },
        { id: "name", title: "表示名" },
        { id: "roles", title: "ロール" },
      ],
    });

    await csvWriter.writeRecords(members);

    const file = new AttachmentBuilder(filePath);
    await interaction.editReply({ content: "📄 メンバーリストを出力しました", files: [file] });

    // 一時ファイルを削除
    fs.unlinkSync(filePath);
  }
});

client.login(process.env.DISCORD_TOKEN);


