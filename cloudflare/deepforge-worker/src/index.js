function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "https://digitbox.dev",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...cors(env), "Content-Type": "application/json" },
  });
}

function validPlayerId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,96}$/.test(value);
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function inviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function clanId() {
  return "clan_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

async function clanSnapshot(env, playerId) {
  const membership = validPlayerId(playerId)
    ? await env.DB.prepare(
        "SELECT c.id, c.name, c.tag, c.invite_code, c.owner_id, c.created_at, cm.role " +
        "FROM clan_members cm JOIN clans c ON c.id = cm.clan_id WHERE cm.player_id = ?1"
      ).bind(playerId).first()
    : null;

  let myClan = null;
  if (membership) {
    const membersResult = await env.DB.prepare(
      "SELECT player_id, role, company_value, trophies, joined_at " +
      "FROM clan_members WHERE clan_id = ?1 ORDER BY role = 'owner' DESC, company_value DESC, joined_at ASC"
    ).bind(membership.id).all();

    const members = (membersResult.results || []).map((row) => ({
      playerId: row.player_id,
      role: row.role,
      companyValue: Number(row.company_value) || 0,
      trophies: Number(row.trophies) || 0,
      joinedAt: Number(row.joined_at) || 0,
    }));

    myClan = {
      id: membership.id,
      name: membership.name,
      tag: membership.tag,
      inviteCode: membership.invite_code,
      ownerId: membership.owner_id,
      role: membership.role,
      createdAt: Number(membership.created_at) || 0,
      members,
      memberCount: members.length,
      companyValue: members.reduce((sum, member) => sum + member.companyValue, 0),
      trophies: members.reduce((sum, member) => sum + member.trophies, 0),
    };
  }

  const listResult = await env.DB.prepare(
    "SELECT c.id, c.name, c.tag, c.created_at, " +
    "COUNT(cm.player_id) AS member_count, " +
    "COALESCE(SUM(cm.company_value), 0) AS company_value, " +
    "COALESCE(SUM(cm.trophies), 0) AS trophies " +
    "FROM clans c LEFT JOIN clan_members cm ON cm.clan_id = c.id " +
    "GROUP BY c.id, c.name, c.tag, c.created_at " +
    "ORDER BY company_value DESC, trophies DESC, member_count DESC LIMIT 30"
  ).all();

  return {
    myClan,
    clans: (listResult.results || []).map((row) => ({
      id: row.id,
      name: row.name,
      tag: row.tag,
      createdAt: Number(row.created_at) || 0,
      memberCount: Number(row.member_count) || 0,
      companyValue: Number(row.company_value) || 0,
      trophies: Number(row.trophies) || 0,
    })),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    if (url.pathname.startsWith("/v1/save/")) {
      const playerId = decodeURIComponent(url.pathname.slice("/v1/save/".length));
      if (!validPlayerId(playerId)) return json({ error: "Invalid player id" }, 400, env);

      if (request.method === "GET") {
        const row = await env.DB.prepare(
          "SELECT data, updated_at FROM player_saves WHERE player_id = ?1"
        ).bind(playerId).first();
        if (!row) return json({ error: "Not found" }, 404, env);
        let data = null;
        try {
          data = JSON.parse(row.data);
        } catch (_) {
          return json({ error: "Corrupt save" }, 500, env);
        }
        return json({ data, updatedAt: row.updated_at }, 200, env);
      }

      if (request.method === "PUT") {
        const length = Number(request.headers.get("content-length") || 0);
        if (length > 1000000) return json({ error: "Save too large" }, 413, env);

        let data;
        try {
          data = await request.json();
        } catch (_) {
          return json({ error: "Invalid JSON" }, 400, env);
        }
        if (!data || typeof data !== "object") return json({ error: "Invalid save" }, 400, env);

        const serialized = JSON.stringify(data);
        if (serialized.length > 1000000) return json({ error: "Save too large" }, 413, env);
        const updatedAt = Number(data.updatedAt) || Date.now();

        await env.DB.prepare(
          "INSERT INTO player_saves (player_id, data, updated_at) VALUES (?1, ?2, ?3) " +
          "ON CONFLICT(player_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at " +
          "WHERE excluded.updated_at >= player_saves.updated_at"
        ).bind(playerId, serialized, updatedAt).run();

        return json({ ok: true, updatedAt }, 200, env);
      }

      return json({ error: "Method not allowed" }, 405, env);
    }

    if (url.pathname === "/v1/clans" && request.method === "GET") {
      return json(await clanSnapshot(env, url.searchParams.get("playerId")), 200, env);
    }

    if (url.pathname === "/v1/clans" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return json({ error: "Invalid JSON" }, 400, env);
      }

      const playerId = body.playerId;
      const name = cleanName(body.name);
      const tag = cleanName(body.tag).toUpperCase();

      if (!validPlayerId(playerId)) return json({ error: "Invalid player id" }, 400, env);
      if (name.length < 3 || name.length > 24) return json({ error: "Clan name must be 3–24 characters." }, 400, env);
      if (!/^[A-Z0-9]{2,5}$/.test(tag)) return json({ error: "Clan tag must be 2–5 letters/numbers." }, 400, env);

      const existing = await env.DB.prepare(
        "SELECT clan_id FROM clan_members WHERE player_id = ?1"
      ).bind(playerId).first();
      if (existing) return json({ error: "Leave your current clan before creating another." }, 409, env);

      const duplicate = await env.DB.prepare(
        "SELECT id FROM clans WHERE lower(name) = lower(?1)"
      ).bind(name).first();
      if (duplicate) return json({ error: "That clan name is already taken." }, 409, env);

      const id = clanId();
      const code = inviteCode();
      const now = Date.now();
      const companyValue = Math.max(0, Math.floor(Number(body.companyValue) || 0));
      const trophies = Math.max(0, Math.floor(Number(body.trophies) || 0));

      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO clans (id, name, tag, invite_code, owner_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
        ).bind(id, name, tag, code, playerId, now),
        env.DB.prepare(
          "INSERT INTO clan_members (clan_id, player_id, role, company_value, trophies, joined_at) VALUES (?1, ?2, 'owner', ?3, ?4, ?5)"
        ).bind(id, playerId, companyValue, trophies, now),
      ]);

      return json(await clanSnapshot(env, playerId), 201, env);
    }

    if (url.pathname === "/v1/clans/join" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return json({ error: "Invalid JSON" }, 400, env);
      }

      const playerId = body.playerId;
      if (!validPlayerId(playerId)) return json({ error: "Invalid player id" }, 400, env);

      const existing = await env.DB.prepare(
        "SELECT clan_id FROM clan_members WHERE player_id = ?1"
      ).bind(playerId).first();
      if (existing) return json({ error: "You are already in a clan." }, 409, env);

      let clan = null;
      if (body.clanId) {
        clan = await env.DB.prepare(
          "SELECT id FROM clans WHERE id = ?1"
        ).bind(String(body.clanId)).first();
      } else {
        const code = cleanName(body.code).toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(code)) return json({ error: "Enter a valid 6-character invite code." }, 400, env);
        clan = await env.DB.prepare(
          "SELECT id FROM clans WHERE invite_code = ?1"
        ).bind(code).first();
      }

      if (!clan) return json({ error: "Clan not found." }, 404, env);

      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM clan_members WHERE clan_id = ?1"
      ).bind(clan.id).first();
      if (Number(count && count.count) >= 30) return json({ error: "That clan is full." }, 409, env);

      await env.DB.prepare(
        "INSERT INTO clan_members (clan_id, player_id, role, company_value, trophies, joined_at) VALUES (?1, ?2, 'member', ?3, ?4, ?5)"
      ).bind(
        clan.id,
        playerId,
        Math.max(0, Math.floor(Number(body.companyValue) || 0)),
        Math.max(0, Math.floor(Number(body.trophies) || 0)),
        Date.now()
      ).run();

      return json(await clanSnapshot(env, playerId), 200, env);
    }

    if (url.pathname === "/v1/clans/leave" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return json({ error: "Invalid JSON" }, 400, env);
      }

      const playerId = body.playerId;
      if (!validPlayerId(playerId)) return json({ error: "Invalid player id" }, 400, env);

      const membership = await env.DB.prepare(
        "SELECT cm.clan_id, cm.role, c.owner_id FROM clan_members cm " +
        "JOIN clans c ON c.id = cm.clan_id WHERE cm.player_id = ?1"
      ).bind(playerId).first();

      if (!membership) return json(await clanSnapshot(env, playerId), 200, env);

      if (membership.role === "owner") {
        const replacement = await env.DB.prepare(
          "SELECT player_id FROM clan_members WHERE clan_id = ?1 AND player_id != ?2 ORDER BY joined_at ASC LIMIT 1"
        ).bind(membership.clan_id, playerId).first();

        if (replacement) {
          await env.DB.batch([
            env.DB.prepare(
              "UPDATE clan_members SET role = 'owner' WHERE clan_id = ?1 AND player_id = ?2"
            ).bind(membership.clan_id, replacement.player_id),
            env.DB.prepare(
              "UPDATE clans SET owner_id = ?1 WHERE id = ?2"
            ).bind(replacement.player_id, membership.clan_id),
            env.DB.prepare(
              "DELETE FROM clan_members WHERE clan_id = ?1 AND player_id = ?2"
            ).bind(membership.clan_id, playerId),
          ]);
        } else {
          await env.DB.prepare("DELETE FROM clans WHERE id = ?1").bind(membership.clan_id).run();
        }
      } else {
        await env.DB.prepare(
          "DELETE FROM clan_members WHERE clan_id = ?1 AND player_id = ?2"
        ).bind(membership.clan_id, playerId).run();
      }

      return json(await clanSnapshot(env, playerId), 200, env);
    }

    if (url.pathname === "/v1/clans/profile" && request.method === "PUT") {
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return json({ error: "Invalid JSON" }, 400, env);
      }

      if (!validPlayerId(body.playerId)) return json({ error: "Invalid player id" }, 400, env);

      await env.DB.prepare(
        "UPDATE clan_members SET company_value = ?1, trophies = ?2 WHERE player_id = ?3"
      ).bind(
        Math.max(0, Math.floor(Number(body.companyValue) || 0)),
        Math.max(0, Math.floor(Number(body.trophies) || 0)),
        body.playerId
      ).run();

      return json({ ok: true }, 200, env);
    }

    return json({ error: "Not found" }, 404, env);
  },
};
