function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "https://digitbox.dev",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: { ...cors(env), "Content-Type": "application/json" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
    if (!url.pathname.startsWith("/v1/save/")) return json({ error: "Not found" }, 404, env);

    const playerId = decodeURIComponent(url.pathname.slice("/v1/save/".length));
    if (!/^[a-zA-Z0-9_-]{8,96}$/.test(playerId)) return json({ error: "Invalid player id" }, 400, env);

    if (request.method === "GET") {
      const row = await env.DB.prepare("SELECT data, updated_at FROM player_saves WHERE player_id = ?1").bind(playerId).first();
      if (!row) return json({ error: "Not found" }, 404, env);
      let data = null;
      try { data = JSON.parse(row.data); } catch (_) { return json({ error: "Corrupt save" }, 500, env); }
      return json({ data: data, updatedAt: row.updated_at }, 200, env);
    }

    if (request.method === "PUT") {
      const length = Number(request.headers.get("content-length") || 0);
      if (length > 1000000) return json({ error: "Save too large" }, 413, env);
      let data;
      try { data = await request.json(); } catch (_) { return json({ error: "Invalid JSON" }, 400, env); }
      if (!data || typeof data !== "object") return json({ error: "Invalid save" }, 400, env);
      const serialized = JSON.stringify(data);
      if (serialized.length > 1000000) return json({ error: "Save too large" }, 413, env);
      const updatedAt = Number(data.updatedAt) || Date.now();
      await env.DB.prepare(
        "INSERT INTO player_saves (player_id, data, updated_at) VALUES (?1, ?2, ?3) " +
        "ON CONFLICT(player_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at " +
        "WHERE excluded.updated_at >= player_saves.updated_at"
      ).bind(playerId, serialized, updatedAt).run();
      return json({ ok: true, updatedAt: updatedAt }, 200, env);
    }

    return json({ error: "Method not allowed" }, 405, env);
  },
};
