export const config = { runtime: "edge" };

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return bytesToHex(new Uint8Array(digest));
}

function findDb(rawEnv) {
  if (rawEnv && rawEnv.DB && typeof rawEnv.DB.prepare === "function") return rawEnv.DB;
  for (const value of Object.values(rawEnv || {})) {
    if (value && typeof value.prepare === "function" && typeof value.batch === "function") return value;
  }
  return null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
  });
}

async function authenticatedUser(request, DB) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const tokenHash = await sha256Hex(match[1]);
  return DB.prepare(
    "SELECT u.id, u.display_name FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2"
  ).bind(tokenHash, Date.now()).first();
}

async function ensureSchema(DB) {
  await DB.batch([
    DB.prepare(
      "CREATE TABLE IF NOT EXISTS player_combat (" +
      "user_id TEXT PRIMARY KEY, hp INTEGER NOT NULL, max_hp INTEGER NOT NULL, " +
      "last_attack_at INTEGER NOT NULL DEFAULT 0, defeated_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)"
    ),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_player_combat_updated ON player_combat(updated_at)"),
  ]);
}

async function progression(DB, userId) {
  const row = await DB.prepare("SELECT data FROM player_saves WHERE player_id = ?1").bind(userId).first();
  let game = {};
  if (row && row.data) {
    try { game = (JSON.parse(row.data) || {}).game || {}; } catch (_) {}
  }
  const armor = Math.max(1, Math.min(100, Number(game.armor) || 1));
  const sword = Math.max(1, Math.min(100, Number(game.blaster) || 1));
  const storedMax = Math.max(100, Math.min(999999, Number(game.maxHp) || 100));
  return {
    maxHp: Math.max(storedMax, 100 + (armor - 1) * 15),
    swordLevel: sword,
    swordDamage: Math.min(60, 10 + sword * 4),
  };
}

async function ensureCombatRow(DB, userId, maxHp) {
  await DB.prepare(
    "INSERT OR IGNORE INTO player_combat (user_id, hp, max_hp, last_attack_at, defeated_at, updated_at) VALUES (?1, ?2, ?2, 0, 0, ?3)"
  ).bind(userId, maxHp, Date.now()).run();
  await DB.prepare(
    "UPDATE player_combat SET max_hp = ?2, hp = MIN(hp, ?2), updated_at = ?3 WHERE user_id = ?1"
  ).bind(userId, maxHp, Date.now()).run();
  return DB.prepare("SELECT * FROM player_combat WHERE user_id = ?1").bind(userId).first();
}

async function clanIdFor(DB, userId) {
  const row = await DB.prepare("SELECT clan_id FROM clan_members WHERE player_id = ?1").bind(userId).first();
  return row ? String(row.clan_id) : "";
}

async function livePresence(DB, userId) {
  return DB.prepare(
    "SELECT x, y, updated_at FROM player_presence WHERE user_id = ?1 AND updated_at >= ?2"
  ).bind(userId, Date.now() - 16000).first();
}

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: json({}).headers });
  const DB = findDb(process.env);
  if (!DB) return json({ error: "Cloudflare D1 is not available." }, 503);

  try {
    await ensureSchema(DB);
    const user = await authenticatedUser(request, DB);
    if (!user) return json({ error: "Log in to use combat." }, 401);

    const ownProgress = await progression(DB, user.id);
    let ownCombat = await ensureCombatRow(DB, user.id, ownProgress.maxHp);
    const now = Date.now();
    let respawned = false;
    if (Number(ownCombat.hp) <= 0 && now - Number(ownCombat.defeated_at || 0) >= 2500) {
      await DB.prepare("UPDATE player_combat SET hp = max_hp, defeated_at = 0, updated_at = ?2 WHERE user_id = ?1").bind(user.id, now).run();
      ownCombat = await DB.prepare("SELECT * FROM player_combat WHERE user_id = ?1").bind(user.id).first();
      respawned = true;
    }

    if (request.method === "GET") {
      return json({
        ok: true,
        hp: Number(ownCombat.hp),
        maxHp: Number(ownCombat.max_hp),
        swordLevel: ownProgress.swordLevel,
        swordDamage: ownProgress.swordDamage,
        clanId: await clanIdFor(DB, user.id),
        defeated: Number(ownCombat.hp) <= 0,
        respawned,
      });
    }

    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const body = await request.json().catch(() => ({}));

    if (body.action === "zombieDamage") {
      if (Number(ownCombat.hp) <= 0) return json({ ok: true, hp: 0, maxHp: Number(ownCombat.max_hp), defeated: true });
      const damage = Math.max(1, Math.min(18, Math.floor(Number(body.damage) || 7)));
      const nextHp = Math.max(0, Number(ownCombat.hp) - damage);
      await DB.prepare(
        "UPDATE player_combat SET hp = ?2, defeated_at = CASE WHEN ?2 <= 0 THEN ?3 ELSE defeated_at END, updated_at = ?3 WHERE user_id = ?1"
      ).bind(user.id, nextHp, now).run();
      return json({ ok: true, hp: nextHp, maxHp: Number(ownCombat.max_hp), damage, defeated: nextHp <= 0 });
    }

    if (body.action !== "attack") return json({ error: "Unknown combat action." }, 400);
    const targetId = String(body.targetId || "");
    if (!/^user_[a-zA-Z0-9_-]{8,96}$/.test(targetId) || targetId === user.id) return json({ error: "Invalid PvP target." }, 400);
    if (now - Number(ownCombat.last_attack_at || 0) < 420) return json({ error: "Sword is still recovering." }, 429);

    const [attackerPresence, targetPresence] = await Promise.all([
      livePresence(DB, user.id),
      livePresence(DB, targetId),
    ]);
    if (!attackerPresence || !targetPresence) return json({ error: "Both players must be online to fight." }, 409);
    const dx = Number(attackerPresence.x) - Number(targetPresence.x);
    const dy = Number(attackerPresence.y) - Number(targetPresence.y);
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 2.45) return json({ error: "Target is out of sword range." }, 409);

    const [attackerClan, targetClan] = await Promise.all([clanIdFor(DB, user.id), clanIdFor(DB, targetId)]);
    if (attackerClan && attackerClan === targetClan) {
      return json({ error: "Friendly fire is disabled for clan members.", friendlyFireBlocked: true }, 403);
    }

    const targetProgress = await progression(DB, targetId);
    const targetCombat = await ensureCombatRow(DB, targetId, targetProgress.maxHp);
    if (Number(targetCombat.hp) <= 0) return json({ error: "That player is already defeated." }, 409);

    const damage = ownProgress.swordDamage;
    const nextHp = Math.max(0, Number(targetCombat.hp) - damage);
    await DB.batch([
      DB.prepare("UPDATE player_combat SET last_attack_at = ?2, updated_at = ?2 WHERE user_id = ?1").bind(user.id, now),
      DB.prepare(
        "UPDATE player_combat SET hp = ?2, defeated_at = CASE WHEN ?2 <= 0 THEN ?3 ELSE defeated_at END, updated_at = ?3 WHERE user_id = ?1"
      ).bind(targetId, nextHp, now),
    ]);

    return json({
      ok: true,
      targetId,
      damage,
      targetHp: nextHp,
      targetMaxHp: Number(targetCombat.max_hp),
      defeated: nextHp <= 0,
      friendlyFireBlocked: false,
    });
  } catch (error) {
    return json({ error: error && error.message ? error.message : String(error) }, 500);
  }
}
