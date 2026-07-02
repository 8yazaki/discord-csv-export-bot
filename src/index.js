import { verifyKey } from "discord-interactions";

const DISCORD_API = "https://discord.com/api/v10";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      return new Response("Discord CSV Export Bot is running.", { status: 200 });
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
    if (interaction.type === 2 && interaction.data?.name === "export_members") {
      ctx.waitUntil(exportMembers(interaction, env));
      // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE（3秒以内に応答するため一旦保留）
      return jsonResponse({ type: 5 });
    }

    return new Response("Unknown interaction", { status: 400 });
  },
};

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
}

async function discordFetch(env, path, options = {}) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Discord API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
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
  const str = String(value ?? "");
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

async function editOriginalResponse(env, interaction, { content, filename, csv }) {
  const url = `${DISCORD_API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ content }));
  if (csv !== undefined) {
    form.append("files[0]", new Blob([csv], { type: "text/csv" }), filename);
  }
  const res = await fetch(url, { method: "PATCH", body: form });
  if (!res.ok) {
    console.error("応答の編集に失敗しました:", await res.text());
  }
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
