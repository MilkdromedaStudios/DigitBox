export const config = { runtime: "edge" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function findDb(env) {
  if (env && env.DB && typeof env.DB.prepare === "function") return env.DB;
  for (const value of Object.values(env || {})) {
    if (value && typeof value.prepare === "function" && typeof value.batch === "function") return value;
  }
  return null;
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const DB = findDb(process.env);
  if (!DB) return json({ error: "D1 unavailable." }, 503);

  await DB.prepare(
    "CREATE TABLE IF NOT EXISTS deepforge_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
  ).run();

  const user = await DB.prepare(
    "SELECT id, display_name FROM users WHERE lower(display_name) = 'numberstring' ORDER BY created_at ASC LIMIT 1"
  ).first();

  if (!user) return json({ ok: false, repaired: false, reason: "Numberstring account not found." }, 404);

  await DB.prepare(
    "INSERT INTO deepforge_config (key, value) VALUES ('owner_user_id', ?1) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(user.id).run();

  return json({ ok: true, repaired: true, username: "Numberstring" });
}
