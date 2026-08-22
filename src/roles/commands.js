// /rolemap, /panel スラッシュコマンドのハンドラ。

import { discordFetch, jsonResponse, editOriginalResponse } from "../discord.js";
import { getRoleMapEntries, listRoleMapEntries, upsertRoleMapEntry, deleteRoleMapEntry, createPanel, setPanelMessageId } from "./db.js";
import { buildPanelEmbed, buildPanelComponents } from "./ui.js";

const MANAGE_ROLES = "268435456"; // 1 << 28
const MAX_PANEL_ROLES = 20;

const STYLE_CHOICES = [
  { name: "Secondary（グレー）", value: 2 },
  { name: "Primary（青）", value: 1 },
  { name: "Success（緑）", value: 3 },
  { name: "Danger（赤）", value: 4 },
];

export const ROLE_SLASH_COMMANDS = [
  {
    name: "rolemap",
    description: "ロール付与パネル用のロールを登録・管理します",
    default_member_permissions: MANAGE_ROLES,
    dm_permission: false,
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "add",
        description: "ロールを登録します",
        options: [
          { type: 8, name: "role", description: "対象ロール", required: true },
          { type: 3, name: "label", description: "ボタン/選択肢に表示する名前", required: true },
          { type: 3, name: "emoji", description: "絵文字（任意）", required: false },
          { type: 3, name: "description", description: "説明文（セレクトメニュー用、任意）", required: false },
          {
            type: 4,
            name: "style",
            description: "ボタンの色（ボタンモードのみ使用）",
            required: false,
            choices: STYLE_CHOICES,
          },
        ],
      },
      {
        type: 1,
        name: "remove",
        description: "登録済みロールを削除します",
        options: [{ type: 8, name: "role", description: "対象ロール", required: true }],
      },
      {
        type: 1,
        name: "list",
        description: "登録済みロールの一覧を表示します",
      },
    ],
  },
  {
    name: "panel",
    description: "ロール付与パネルをこのチャンネルに投稿します",
    default_member_permissions: MANAGE_ROLES,
    dm_permission: false,
    options: [
      {
        type: 3,
        name: "mode",
        description: "表示形式",
        required: true,
        choices: [
          { name: "ボタン", value: "button" },
          { name: "セレクトメニュー", value: "select" },
        ],
      },
      { type: 3, name: "title", description: "パネルのタイトル", required: false },
      { type: 3, name: "body", description: "パネルの説明文", required: false },
      ...Array.from({ length: MAX_PANEL_ROLES }, (_, i) => ({
        type: 8, // ROLE
        name: `role${i + 1}`,
        description: `含めるロール ${i + 1}${i === 0 ? "" : "（任意）"}`,
        required: i === 0,
      })),
    ],
  },
];

function getSubcommand(interaction) {
  const sub = interaction.data.options?.[0];
  const options = Object.fromEntries((sub?.options || []).map((o) => [o.name, o.value]));
  return { name: sub?.name, options };
}

function getFlatOptions(interaction) {
  return Object.fromEntries((interaction.data.options || []).map((o) => [o.name, o.value]));
}

function ephemeral(content) {
  return jsonResponse({ type: 4, data: { content, flags: 64 } });
}

export async function handleRolemapCommand(interaction, env) {
  const guildId = interaction.guild_id;
  const { name, options } = getSubcommand(interaction);

  if (name === "add") {
    const roleId = options.role;
    if (roleId === guildId) {
      return ephemeral("⚠️ @everyone ロールは登録できません。");
    }
    // ROLE型オプションの resolved データに managed フラグが含まれているため、追加のAPI呼び出し不要
    const resolvedRole = interaction.data.resolved?.roles?.[roleId];
    if (resolvedRole?.managed) {
      return ephemeral("⚠️ Bot連携・ブースター特典などのManagedロールは登録できません。");
    }
    await upsertRoleMapEntry(env, {
      guildId,
      roleId,
      label: options.label,
      emoji: options.emoji,
      description: options.description,
      style: options.style,
    });
    return ephemeral(`✅ ${options.label}（<@&${roleId}>）を登録しました。`);
  }

  if (name === "remove") {
    const roleId = options.role;
    await deleteRoleMapEntry(env, guildId, roleId);
    return ephemeral(`🗑️ <@&${roleId}> の登録を削除しました。`);
  }

  if (name === "list") {
    const entries = await listRoleMapEntries(env, guildId);
    if (entries.length === 0) {
      return ephemeral("登録済みのロールはありません。`/rolemap add` で登録してください。");
    }
    const lines = entries.map(
      (e) => `- <@&${e.role_id}>: ${e.label}${e.emoji ? ` ${e.emoji}` : ""}${e.description ? ` — ${e.description}` : ""}`
    );
    return ephemeral(`**登録済みロール一覧**\n${lines.join("\n")}`);
  }

  return ephemeral("⚠️ 不明なサブコマンドです。");
}

export async function handlePanelCommand(interaction, env, ctx) {
  const guildId = interaction.guild_id;
  const options = getFlatOptions(interaction);
  const mode = options.mode;

  const roleIds = Object.entries(options)
    .filter(([key]) => /^role\d+$/.test(key))
    .sort((a, b) => Number(a[0].slice(4)) - Number(b[0].slice(4)))
    .map(([, value]) => value);

  const uniqueRoleIds = new Set(roleIds);
  if (uniqueRoleIds.size !== roleIds.length) {
    return ephemeral("⚠️ 同じロールが複数指定されています。");
  }

  const entries = await getRoleMapEntries(env, guildId, roleIds);
  const entryMap = new Map(entries.map((e) => [e.role_id, e]));
  const missing = roleIds.filter((id) => !entryMap.has(id));
  if (missing.length > 0) {
    return ephemeral(
      `⚠️ 次のロールは \`/rolemap add\` で未登録です: ${missing.map((id) => `<@&${id}>`).join(", ")}\n先に \`/rolemap add\` で登録してください。`
    );
  }

  // role1, role2... で指定した順序をそのままパネルの表示順にする
  const orderedEntries = roleIds.map((id) => entryMap.get(id));

  const panelId = crypto.randomUUID();
  await createPanel(env, {
    panelId,
    guildId,
    channelId: interaction.channel_id,
    mode,
    title: options.title,
    body: options.body,
    createdAt: Date.now(),
    roleIds,
  });

  // メッセージ投稿は REST 経由で行う（「/panel を使用しました」という帰属を付けず、パネル単体の投稿にするため）。
  // 3秒の応答期限に収まらない可能性があるため、一旦保留応答してからバックグラウンドで処理する。
  ctx.waitUntil(publishPanel(interaction, env, panelId, mode, options, orderedEntries));
  return jsonResponse({ type: 5, data: { flags: 64 } });
}

async function publishPanel(interaction, env, panelId, mode, options, entries) {
  try {
    const message = await discordFetch(env, `/channels/${interaction.channel_id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        embeds: buildPanelEmbed(options.title, options.body),
        components: buildPanelComponents(mode, entries, panelId),
      }),
    });
    await setPanelMessageId(env, panelId, message.id);
    await editOriginalResponse(env, interaction, { content: "✅ パネルを投稿しました。" });
  } catch (err) {
    console.error("❌ パネル投稿エラー:", err);
    await editOriginalResponse(env, interaction, { content: "❌ パネルの投稿に失敗しました。" });
  }
}
