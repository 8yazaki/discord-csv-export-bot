// Discord REST API 呼び出し用の共有ヘルパー。
// CSVエクスポート機能・ロールパネル機能の両方から利用する。

export const DISCORD_API = "https://discord.com/api/v10";

export function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
}

export async function discordFetch(env, path, options = {}) {
  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(`${DISCORD_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        ...options.headers,
      },
    });

    // レート制限（429）の場合は Retry-After 秒待ってからリトライする
    if (res.status === 429 && attempt < maxRetries) {
      const retryAfterSec = Number(res.headers.get("retry-after")) || 1;
      await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      let code;
      try {
        code = JSON.parse(text).code;
      } catch {
        // レスポンスがJSONでない場合は無視
      }
      const err = new Error(`Discord API error ${res.status}: ${text}`);
      err.status = res.status;
      err.discordCode = code;
      throw err;
    }

    // ロール付与/解除など一部のエンドポイントは 204 No Content を返す（本文なし）
    if (res.status === 204) return null;
    return res.json();
  }
}

// スラッシュコマンドの保留応答（type:5 または type:4）を後から書き換える。
// filename/csv を渡すとファイル付きで応答を差し替える（CSVエクスポート用）。
export async function editOriginalResponse(env, interaction, { content, filename, csv }) {
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
