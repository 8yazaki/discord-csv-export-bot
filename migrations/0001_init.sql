-- ロールパネル機能用テーブル

CREATE TABLE IF NOT EXISTS role_map (
  guild_id    TEXT NOT NULL,
  role_id     TEXT NOT NULL,
  label       TEXT NOT NULL,          -- ボタン/選択肢の表示名
  emoji       TEXT,                    -- "🎹" または "<:name:id>" / "<a:name:id>"
  description TEXT,                    -- セレクトメニュー用の説明行
  style       INTEGER DEFAULT 2,       -- 1=Primary 2=Secondary 3=Success 4=Danger（ボタンモードのみ使用）
  sort_order  INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS panels (
  panel_id   TEXT PRIMARY KEY,
  guild_id   TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  mode       TEXT NOT NULL,            -- 'button' | 'select'
  title      TEXT,
  body       TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS panel_roles (
  panel_id TEXT NOT NULL,
  role_id  TEXT NOT NULL,
  PRIMARY KEY (panel_id, role_id)
);
