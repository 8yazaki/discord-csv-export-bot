import { verifyKey } from "discord-interactions";
import { DISCORD_API, discordFetch, jsonResponse, editOriginalResponse } from "./discord.js";
import { ROLE_SLASH_COMMANDS, handleRolemapCommand, handlePanelCommand } from "./roles/commands.js";
import { handleRoleButton, handleRoleSelect } from "./roles/components.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response("Discord CSV Export Bot is running.", { status: 200 });
    }

    if (request.method === "POST" && url.pathname === "/register-commands") {
      return handleRegisterCommands(request, env);
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    const body = await request.text();

    const isValid =
      signature &&
      timestamp &&
      (await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));

    if (!isValid) {
      return new Response("Bad request signature.", { status: 401 });
    }

    const interaction = JSON.parse(body);

    // PING
    if (interaction.type === 1) {
      return jsonResponse({ type: 1 });
    }

    // APPLICATION_COMMAND
    if (interaction.type === 2) {
      const name = interaction.data?.name;
      if (name === "export_members") {
        ctx.waitUntil(exportMembers(interaction, env));
        // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE（3秒以内に応答するため一旦保留）
        return jsonResponse({ type: 5 });
      }
      if (name === "rolemap") {
        return handleRolemapCommand(interaction, env);
      }
      if (name === "panel") {
        return handlePanelCommand(interaction, env, ctx);
      }
      return new Response("Unknown command", { status: 400 });
    }

    // MESSAGE_COMPONENT（ボタン・セレクトメニュー押下）
    if (interaction.type === 3) {
      const customId = interaction.data?.custom_id || "";
      if (customId.startsWith("role:")) {
        return handleRoleButton(interaction, env);
      }
      if (customId.startsWith("roleselect:")) {
        return handleRoleSelect(interaction, env, ctx);
      }
      return new Response("Unknown component", { status: 400 });
    }

    return new Response("Unknown interaction", { status: 400 });
  },
};

const SLASH_COMMANDS = [
  {
    name: "export_members",
    description: "参加者の一覧をCSVで出力します",
    // デフォルトでは「サーバー管理」権限を持つメンバーのみ実行可能（Discord側のIntegrations設定で個別に変更可能）
    default_member_permissions: "32",
    dm_permission: false,
  },
  ...ROLE_SLASH_COMMANDS,
];

// スラッシュコマンドをDiscordに登録するための管理用エンドポイント。
// `wrangler secret put ADMIN_SECRET` で設定した値をヘッダーで渡した場合のみ実行する。
async function handleRegisterCommands(request, env) {
  const providedSecret = request.headers.get("x-admin-secret");
  if (!env.ADMIN_SECRET || providedSecret !== env.ADMIN_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const res = await fetch(
    `${DISCORD_API}/applications/${env.CLIENT_ID}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(SLASH_COMMANDS),
    }
  );

  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}

async function fetchAllMembers(env, guildId) {
  const members = [];
  let after = "0";
  // Discord REST API はギルドメンバーを 1 回最大 1000 件までしか返さないためページングする
  while (true) {
    const chunk = await discordFetch(
      env,
      `/guilds/${guildId}/members?limit=1000&after=${after}`
    );
    members.push(...chunk);
    if (chunk.length < 1000) break;
    after = chunk[chunk.length - 1].user.id;
  }
  return members;
}

async function fetchRoleMap(env, guildId) {
  const roles = await discordFetch(env, `/guilds/${guildId}/roles`);
  return new Map(roles.map((role) => [role.id, role.name]));
}

function csvEscape(value) {
  let str = String(value ?? "");
  // Excel/Sheets 等でフォーミュラとして評価されないよう、先頭の =+-@ やタブ・CR を無害化する
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(rows) {
  const header = ["ユーザー名", "表示名", "ロール"];
  const lines = [header.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push([row.username, row.name, row.roles].map(csvEscape).join(","));
  }
  // Excel でも文字化けしないよう BOM を付与
  return "﻿" + lines.join("\n");
}

async function exportMembers(interaction, env) {
  const guildId = interaction.guild_id;
  try {
    const [members, roleMap] = await Promise.all([
      fetchAllMembers(env, guildId),
      fetchRoleMap(env, guildId),
    ]);

    const rows = members.map((member) => {
      const user = member.user;
      const discriminator = user.discriminator;
      const username =
        discriminator && discriminator !== "0"
          ? `${user.username}#${discriminator}`
          : user.username;
      const name = member.nick || user.global_name || user.username;
      const roles = member.roles
        .filter((roleId) => roleId !== guildId) // @everyone を除外
        .map((roleId) => roleMap.get(roleId) || roleId)
        .join(", ");
      return { username, name, roles };
    });

    const csv = buildCsv(rows);

    await editOriginalResponse(env, interaction, {
      content: "📄 メンバーリストを出力しました",
      filename: "members.csv",
      csv,
    });
  } catch (err) {
    console.error("❌ エクスポートエラー:", err);
    await editOriginalResponse(env, interaction, {
      content: "❌ エクスポート中にエラーが発生しました。",
    });
  }
}
