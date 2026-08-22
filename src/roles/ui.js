// ロールパネルの Embed / ボタン / セレクトメニュー組み立て。

import { MessageComponentTypes, ButtonStyleTypes } from "discord-interactions";

const VALID_BUTTON_STYLES = new Set([1, 2, 3, 4]);

export function normalizeStyle(style) {
  const n = Number(style);
  return VALID_BUTTON_STYLES.has(n) ? n : ButtonStyleTypes.SECONDARY;
}

// "😀" のようなUnicode絵文字と "<:name:id>" / "<a:name:id>" のカスタム絵文字表記の両方を受け付ける。
export function parseEmoji(input) {
  if (!input) return undefined;
  const trimmed = String(input).trim();
  if (!trimmed) return undefined;
  const custom = /^<(a?):(\w+):(\d+)>$/.exec(trimmed);
  if (custom) {
    return { id: custom[3], name: custom[2], animated: custom[1] === "a" };
  }
  return { name: trimmed };
}

export function buildPanelEmbed(title, body) {
  const embed = {};
  if (title) embed.title = title;
  if (body) embed.description = body;
  return Object.keys(embed).length ? [embed] : [];
}

// entries は role_map の行（label/emoji/description/style/role_id）を、
// パネルに含める順序に並べたもの。
export function buildPanelComponents(mode, entries, panelId) {
  if (mode === "select") {
    return [
      {
        type: MessageComponentTypes.ACTION_ROW,
        components: [
          {
            type: MessageComponentTypes.STRING_SELECT,
            custom_id: `roleselect:${panelId}`,
            placeholder: "付与するロールを選択",
            min_values: 0,
            max_values: entries.length,
            options: entries.map((e) => ({
              label: e.label,
              value: e.role_id,
              description: e.description || undefined,
              emoji: parseEmoji(e.emoji),
            })),
          },
        ],
      },
    ];
  }

  // ボタンモード: 1行5個ずつ、最大5行（/panel は最大20ロールに制限しているため収まる）
  const rows = [];
  for (let i = 0; i < entries.length; i += 5) {
    rows.push({
      type: MessageComponentTypes.ACTION_ROW,
      components: entries.slice(i, i + 5).map((e) => ({
        type: MessageComponentTypes.BUTTON,
        style: normalizeStyle(e.style),
        label: e.label,
        emoji: parseEmoji(e.emoji),
        custom_id: `role:${e.role_id}`,
      })),
    });
  }
  return rows;
}
