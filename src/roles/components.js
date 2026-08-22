// ボタン（role:<role_id>）・セレクトメニュー（roleselect:<panel_id>）押下時のロール付与/解除処理。

import { discordFetch, jsonResponse, editOriginalResponse } from "../discord.js";
import { getRoleMapEntry, getRoleMapEntries, getPanelRoleIds } from "./db.js";

function friendlyRoleError(err) {
  if (err?.status === 403 && err?.discordCode === 50013) {
    return "⚠️ Botの権限が不足しています。ロールの階層でBotのロールが対象ロールより上位にあるか確認してください。";
  }
  if (err?.discordCode === 10011) {
    return "⚠️ 対象のロールが見つかりません（Discord上で削除された可能性があります）。";
  }
  return "⚠️ ロールの更新に失敗しました。しばらくしてから再度お試しください。";
}

export async function handleRoleButton(interaction, env) {
  const guildId = interaction.guild_id;
  const roleId = interaction.data.custom_id.slice("role:".length);
  const userId = interaction.member?.user?.id;

  // custom_id はクライアント由来で改竄可能なため、必ず role_map への登録を確認する
  const entry = await getRoleMapEntry(env, guildId, roleId);
  if (!entry) {
    return jsonResponse({
      type: 4,
      data: { content: "⚠️ このロールは登録されていません（削除された可能性があります）。", flags: 64 },
    });
  }

  const hasRole = interaction.member.roles.includes(roleId);
  try {
    await discordFetch(env, `/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
      method: hasRole ? "DELETE" : "PUT",
    });
  } catch (err) {
    console.error("❌ ロール更新エラー:", err);
    return jsonResponse({ type: 4, data: { content: friendlyRoleError(err), flags: 64 } });
  }

  return jsonResponse({
    type: 4,
    data: {
      content: hasRole ? `➖ ${entry.label} を解除しました。` : `➕ ${entry.label} を付与しました。`,
      flags: 64,
    },
  });
}

export async function handleRoleSelect(interaction, env, ctx) {
  const panelId = interaction.data.custom_id.slice("roleselect:".length);
  // セレクトは複数ロールの差分更新で複数回REST呼び出しが発生しうるため、保留応答してからバックグラウンド処理する
  ctx.waitUntil(processRoleSelect(interaction, env, panelId));
  return jsonResponse({ type: 5, data: { flags: 64 } });
}

async function processRoleSelect(interaction, env, panelId) {
  const guildId = interaction.guild_id;
  const userId = interaction.member?.user?.id;
  try {
    const panelRoleIds = await getPanelRoleIds(env, panelId);
    if (panelRoleIds.length === 0) {
      await editOriginalResponse(env, interaction, { content: "⚠️ このパネルは削除されています。" });
      return;
    }

    const panelSet = new Set(panelRoleIds);
    const selected = new Set((interaction.data.values || []).filter((id) => panelSet.has(id)));
    const current = new Set(interaction.member.roles || []);

    // role_map に現存するロールのみを対象にする（/rolemap remove 済みのロールは触らない）
    const entries = await getRoleMapEntries(env, guildId, panelRoleIds);
    const entryMap = new Map(entries.map((e) => [e.role_id, e]));

    const toAdd = [...selected].filter((id) => entryMap.has(id) && !current.has(id));
    const toRemove = panelRoleIds.filter((id) => entryMap.has(id) && current.has(id) && !selected.has(id));

    const added = [];
    const removed = [];
    const failed = [];

    for (const roleId of toAdd) {
      try {
        await discordFetch(env, `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: "PUT" });
        added.push(roleId);
      } catch (err) {
        console.error("❌ ロール付与エラー:", err);
        failed.push(roleId);
      }
    }
    for (const roleId of toRemove) {
      try {
        await discordFetch(env, `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: "DELETE" });
        removed.push(roleId);
      } catch (err) {
        console.error("❌ ロール解除エラー:", err);
        failed.push(roleId);
      }
    }

    const label = (id) => entryMap.get(id)?.label || id;
    const parts = [];
    if (added.length) parts.push(`➕ 付与: ${added.map(label).join(", ")}`);
    if (removed.length) parts.push(`➖ 解除: ${removed.map(label).join(", ")}`);
    if (failed.length) {
      parts.push(`⚠️ 失敗: ${failed.map(label).join(", ")}（Botの権限・ロール階層をご確認ください）`);
    }
    if (parts.length === 0) parts.push("変更はありませんでした。");

    await editOriginalResponse(env, interaction, { content: parts.join("\n") });
  } catch (err) {
    console.error("❌ セレクト処理エラー:", err);
    await editOriginalResponse(env, interaction, { content: "❌ 処理中にエラーが発生しました。" });
  }
}
