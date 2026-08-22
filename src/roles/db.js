// ロールパネル機能用の D1 CRUD ヘルパー。

export async function getRoleMapEntry(env, guildId, roleId) {
  return env.DB.prepare("SELECT * FROM role_map WHERE guild_id = ? AND role_id = ?")
    .bind(guildId, roleId)
    .first();
}

export async function getRoleMapEntries(env, guildId, roleIds) {
  if (roleIds.length === 0) return [];
  const placeholders = roleIds.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT * FROM role_map WHERE guild_id = ? AND role_id IN (${placeholders})`
  )
    .bind(guildId, ...roleIds)
    .all();
  return results;
}

export async function listRoleMapEntries(env, guildId) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM role_map WHERE guild_id = ? ORDER BY sort_order, label"
  )
    .bind(guildId)
    .all();
  return results;
}

export async function upsertRoleMapEntry(env, entry) {
  await env.DB.prepare(
    `INSERT INTO role_map (guild_id, role_id, label, emoji, description, style, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(guild_id, role_id) DO UPDATE SET
       label = excluded.label,
       emoji = excluded.emoji,
       description = excluded.description,
       style = excluded.style`
  )
    .bind(
      entry.guildId,
      entry.roleId,
      entry.label,
      entry.emoji ?? null,
      entry.description ?? null,
      entry.style ?? 2
    )
    .run();
}

export async function deleteRoleMapEntry(env, guildId, roleId) {
  // role_map から削除すると同時に、既存パネルが参照している panel_roles の孤立行も掃除する。
  // 投稿済みのパネルメッセージ自体は変わらないが、クリック時に role_map 不在として弾かれるようになる。
  await env.DB.batch([
    env.DB.prepare("DELETE FROM role_map WHERE guild_id = ? AND role_id = ?").bind(guildId, roleId),
    env.DB.prepare("DELETE FROM panel_roles WHERE role_id = ?").bind(roleId),
  ]);
}

export async function createPanel(env, panel) {
  const statements = [
    env.DB.prepare(
      `INSERT INTO panels (panel_id, guild_id, channel_id, message_id, mode, title, body, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`
    ).bind(
      panel.panelId,
      panel.guildId,
      panel.channelId,
      panel.mode,
      panel.title ?? null,
      panel.body ?? null,
      panel.createdAt
    ),
    ...panel.roleIds.map((roleId) =>
      env.DB.prepare("INSERT INTO panel_roles (panel_id, role_id) VALUES (?, ?)").bind(panel.panelId, roleId)
    ),
  ];
  await env.DB.batch(statements);
}

export async function setPanelMessageId(env, panelId, messageId) {
  await env.DB.prepare("UPDATE panels SET message_id = ? WHERE panel_id = ?").bind(messageId, panelId).run();
}

export async function getPanelRoleIds(env, panelId) {
  const { results } = await env.DB.prepare("SELECT role_id FROM panel_roles WHERE panel_id = ?")
    .bind(panelId)
    .all();
  return results.map((r) => r.role_id);
}
