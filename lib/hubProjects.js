// digitbox/lib/hubProjects.js
//
// Storage for projects added from the admin page, in the Cloudflare D1
// database the site already uses for accounts. Edge API routes only.
//
//   hub_projects         one row per project: name, emoji, colour (hue), ...
//   hub_project_html     the game's HTML in pieces of PART_CHARS units
//   hub_project_uploads  pieces of an upload in progress
//   hub_builtin_changes  edits to the built-in games (data/projects-index.json):
//                        new name, emoji, ..., hidden or deleted
//
// The HTML moves in pieces, one request each, both ways: copying a whole
// multi-MB game through the D1 binding would cost more CPU than one request
// gets on the Workers Free plan (10 ms). An upload's last piece swaps all
// pieces in with one batch, so visitors see the old game or the new one,
// never a mix.
//
// New projects show up as soon as they're saved: nothing is committed to the
// repo and no rebuild is needed.

import { GAMES } from "./catalog";
import { MAX_HTML_BYTES, MAX_PARTS, PART_CHARS, SLUG_PATTERN, projectSlug, slugify, utf8Bytes } from "./projectRules";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS hub_projects (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    hue INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    genre TEXT NOT NULL DEFAULT '',
    visible INTEGER NOT NULL DEFAULT 1,
    html_bytes INTEGER NOT NULL DEFAULT 0,
    html_chunks INTEGER NOT NULL DEFAULT 0,
    html_updated_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS hub_project_html (
    slug TEXT NOT NULL,
    idx INTEGER NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY (slug, idx)
  )`,
  `CREATE TABLE IF NOT EXISTS hub_builtin_changes (
    slug TEXT PRIMARY KEY,
    name TEXT,
    emoji TEXT,
    hue INTEGER,
    description TEXT,
    genre TEXT,
    visible INTEGER NOT NULL DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS hub_project_uploads (
    upload_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    slug TEXT NOT NULL,
    body TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (upload_id, idx)
  )`,
];

// Unfinished uploads older than this are cleared out.
const UPLOAD_TTL_MS = 60 * 60 * 1000;
const UPLOAD_ID = /^[a-f0-9]{16,64}$/;

let schemaReady = null;

export function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export class ProjectError extends Error {
  constructor(message, status = 400, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

// Slugs the built-in games (and their tidied names) already use, so a new
// project never shadows one at /projects/<slug>. "game", "video" and "post"
// would read as a kind in Library keys (lib/catalog.js likeKey).
const RESERVED_SLUGS = new Set([...GAMES.flatMap((game) => [game.slug, slugify(game.slug), slugify(game.title)]), "game", "video", "post"]);

export function isBuiltInSlug(slug) {
  return GAMES.some((game) => game.slug === slug);
}

export function isValidSlug(slug) {
  return typeof slug === "string" && slug.length <= 60 && SLUG_PATTERN.test(slug);
}

export function toPublicProject(row) {
  return {
    slug: row.slug,
    name: row.name,
    emoji: row.emoji,
    hue: Number(row.hue),
    description: row.description || "",
    genre: row.genre || "",
    visible: Boolean(row.visible),
    htmlBytes: Number(row.html_bytes) || 0,
    // How many pieces to fetch from .../html?part=<0..htmlParts-1>.
    htmlParts: Number(row.html_chunks) || 0,
    // Changes whenever the HTML is replaced; used to version its URL.
    version: Number(row.html_updated_at) || 0,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  };
}

// Newest first. Visitors only see projects that are shown and have a game.
export async function listProjects(db, { includeHidden = false } = {}) {
  await ensureSchema(db);
  const where = includeHidden ? "" : "WHERE visible = 1 AND html_chunks > 0";
  const { results } = await db.prepare(`SELECT * FROM hub_projects ${where} ORDER BY created_at DESC, slug`).all();
  return (results || []).map(toPublicProject);
}

export async function getProject(db, slug) {
  if (!isValidSlug(slug)) return null;
  await ensureSchema(db);
  const row = await db.prepare("SELECT * FROM hub_projects WHERE slug = ?1").bind(slug).first();
  return row ? toPublicProject(row) : null;
}

export async function createProject(db, fields) {
  await ensureSchema(db);
  const slug = projectSlug(fields.name);
  if (RESERVED_SLUGS.has(slug)) throw new ProjectError("A built-in game already uses this name. Pick another one.", 409, "name");
  const now = Date.now();
  const result = await db
    .prepare(
      "INSERT OR IGNORE INTO hub_projects (slug, name, emoji, hue, description, genre, visible, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)"
    )
    .bind(slug, fields.name, fields.emoji, fields.hue, fields.description, fields.genre, fields.visible ? 1 : 0, now)
    .run();
  if (!result.meta || result.meta.changes !== 1) {
    throw new ProjectError("Another project already uses this name. Pick another one.", 409, "name");
  }
  return getProject(db, slug);
}

const COLUMNS = { name: "name", emoji: "emoji", hue: "hue", description: "description", genre: "genre", visible: "visible" };

export async function updateProject(db, slug, fields) {
  await ensureSchema(db);
  // A rename keeps the address, but mustn't take another game's name.
  if ("name" in fields) {
    const nameSlug = slugify(fields.name);
    if (nameSlug && nameSlug !== slug) {
      if (RESERVED_SLUGS.has(nameSlug)) throw new ProjectError("A built-in game already uses this name. Pick another one.", 409, "name");
      const taken = await db.prepare("SELECT 1 AS taken FROM hub_projects WHERE slug = ?1").bind(nameSlug).first();
      if (taken) throw new ProjectError("Another project already uses this name. Pick another one.", 409, "name");
    }
  }
  const sets = [];
  const values = [];
  for (const [field, column] of Object.entries(COLUMNS)) {
    if (!(field in fields)) continue;
    values.push(field === "visible" ? (fields.visible ? 1 : 0) : fields[field]);
    sets.push(`${column} = ?${values.length}`);
  }
  values.push(Date.now());
  sets.push(`updated_at = ?${values.length}`);
  values.push(slug);
  const result = await db.prepare(`UPDATE hub_projects SET ${sets.join(", ")} WHERE slug = ?${values.length}`).bind(...values).run();
  if (!result.meta || result.meta.changes !== 1) return null;
  return getProject(db, slug);
}

export async function deleteProject(db, slug) {
  await ensureSchema(db);
  const [removed] = await db.batch([
    db.prepare("DELETE FROM hub_projects WHERE slug = ?1").bind(slug),
    db.prepare("DELETE FROM hub_project_html WHERE slug = ?1").bind(slug),
    db.prepare("DELETE FROM hub_project_uploads WHERE slug = ?1").bind(slug),
  ]);
  return Boolean(removed.meta && removed.meta.changes);
}

// Store piece `part` of `parts` of a new HTML upload. Resolves to
// { done: false } until the last piece, which swaps the whole upload in and
// resolves to { done: true, project }. Null if the project doesn't exist.
export async function saveHtmlPart(db, slug, { uploadId, part, parts, body }) {
  await ensureSchema(db);
  if (!UPLOAD_ID.test(String(uploadId))) throw new ProjectError("Invalid upload.", 400, "html");
  if (!Number.isInteger(parts) || parts < 1 || parts > MAX_PARTS || !Number.isInteger(part) || part < 0 || part >= parts) {
    throw new ProjectError("The HTML is bigger than 5 MB.", 413, "html");
  }
  if (body.length > PART_CHARS) throw new ProjectError("Upload the HTML in smaller pieces.", 413, "html");
  if (parts === 1 && !body.trim()) throw new ProjectError("The HTML file is empty.", 400, "html");

  const now = Date.now();
  const write = [
    db
      .prepare("INSERT OR REPLACE INTO hub_project_uploads (upload_id, idx, slug, body, bytes, created_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM hub_projects WHERE slug = ?3)")
      .bind(uploadId, part, slug, body, utf8Bytes(body), now),
  ];
  if (part === 0) write.unshift(db.prepare("DELETE FROM hub_project_uploads WHERE created_at < ?1").bind(now - UPLOAD_TTL_MS));
  const written = await db.batch(write);
  if (!written[written.length - 1].meta || written[written.length - 1].meta.changes < 1) return null;
  if (part < parts - 1) return { done: false };

  const received = await db
    .prepare("SELECT COUNT(*) AS count, COALESCE(SUM(bytes), 0) AS bytes FROM hub_project_uploads WHERE upload_id = ?1 AND slug = ?2 AND idx < ?3")
    .bind(uploadId, slug, parts)
    .first();
  const dropUpload = () => db.prepare("DELETE FROM hub_project_uploads WHERE upload_id = ?1").bind(uploadId).run();
  if (!received || Number(received.count) !== parts) {
    await dropUpload();
    throw new ProjectError("Part of the upload went missing. Try saving again.", 409, "html");
  }
  const bytes = Number(received.bytes);
  if (bytes > MAX_HTML_BYTES) {
    await dropUpload();
    throw new ProjectError("The HTML is bigger than 5 MB.", 413, "html");
  }

  // One transaction: the new pieces replace the old ones, copied inside D1.
  const results = await db.batch([
    db
      .prepare("UPDATE hub_projects SET html_bytes = ?1, html_chunks = ?2, html_updated_at = ?3, updated_at = ?3 WHERE slug = ?4")
      .bind(bytes, parts, now, slug),
    db.prepare("DELETE FROM hub_project_html WHERE slug = ?1").bind(slug),
    db
      .prepare("INSERT INTO hub_project_html (slug, idx, body) SELECT slug, idx, body FROM hub_project_uploads WHERE upload_id = ?1 AND slug = ?2 AND idx < ?3 AND EXISTS (SELECT 1 FROM hub_projects WHERE slug = ?2)")
      .bind(uploadId, slug, parts),
    db.prepare("DELETE FROM hub_project_uploads WHERE upload_id = ?1").bind(uploadId),
  ]);
  if (!results[0].meta || results[0].meta.changes !== 1) return null;
  return { done: true, project: await getProject(db, slug) };
}

// One piece of a project's current HTML, with the project's visibility and
// version so the caller can check them. Null if there's no such piece.
export async function loadHtmlPart(db, slug, part) {
  if (!isValidSlug(slug) || !Number.isInteger(part) || part < 0) return null;
  await ensureSchema(db);
  const row = await db
    .prepare("SELECT p.visible AS visible, p.html_updated_at AS version, h.body AS body FROM hub_projects p JOIN hub_project_html h ON h.slug = p.slug AND h.idx = ?2 WHERE p.slug = ?1")
    .bind(slug, part)
    .first();
  return row ? { body: row.body, visible: Boolean(row.visible), version: Number(row.version) } : null;
}

/* ------------------------------------------------------------------ *
 *  Built-in games: edits, hiding and deleting (takedowns)
 * ------------------------------------------------------------------ */

const BUILTIN_FIELDS = ["name", "emoji", "hue", "description", "genre"];

function toBuiltInChange(row) {
  const change = { slug: row.slug, visible: Boolean(row.visible), deleted: Boolean(row.deleted), updatedAt: Number(row.updated_at) || 0 };
  for (const field of BUILTIN_FIELDS) if (row[field] !== null && row[field] !== undefined) change[field] = field === "hue" ? Number(row[field]) : row[field];
  return change;
}

// Every built-in game that has been edited, hidden or deleted.
export async function listBuiltInChanges(db) {
  await ensureSchema(db);
  const { results } = await db.prepare("SELECT * FROM hub_builtin_changes").all();
  return (results || []).map(toBuiltInChange);
}

// What visitors need: the edited fields of shown games and which are hidden
// (hidden or deleted look the same from outside).
export async function publicBuiltInChanges(db) {
  const changes = {};
  for (const change of await listBuiltInChanges(db)) {
    const out = { hidden: change.deleted || !change.visible };
    if (!out.hidden) for (const field of BUILTIN_FIELDS) if (field in change) out[field] = change[field];
    changes[change.slug] = out;
  }
  return changes;
}

// Save edits (any of name, emoji, hue, description, genre, visible) or the
// deleted flag for a built-in game. `null` for a field restores the original.
export async function saveBuiltInChange(db, slug, fields) {
  if (!isBuiltInSlug(slug)) return null;
  await ensureSchema(db);
  const now = Date.now();
  await db.prepare("INSERT OR IGNORE INTO hub_builtin_changes (slug, updated_at) VALUES (?1, ?2)").bind(slug, now).run();
  const sets = [];
  const values = [];
  for (const field of [...BUILTIN_FIELDS, "visible", "deleted"]) {
    if (!(field in fields)) continue;
    const value = fields[field];
    values.push(field === "visible" || field === "deleted" ? (value ? 1 : 0) : value);
    sets.push(`${field} = ?${values.length}`);
  }
  values.push(now);
  sets.push(`updated_at = ?${values.length}`);
  values.push(slug);
  await db.prepare(`UPDATE hub_builtin_changes SET ${sets.join(", ")} WHERE slug = ?${values.length}`).bind(...values).run();
  forgetBlockedCache();
  const row = await db.prepare("SELECT * FROM hub_builtin_changes WHERE slug = ?1").bind(slug).first();
  return row ? toBuiltInChange(row) : null;
}

// Back to exactly how the game ships (shown, original name and look).
export async function resetBuiltIn(db, slug) {
  if (!isBuiltInSlug(slug)) return false;
  await ensureSchema(db);
  await db.prepare("DELETE FROM hub_builtin_changes WHERE slug = ?1").bind(slug).run();
  forgetBlockedCache();
  return true;
}

// Built-in games that are hidden or deleted, so their pages and files stop
// being served. Cached briefly per isolate: game files load many pieces.
let blockedCache = null;
function forgetBlockedCache() {
  blockedCache = null;
}

export async function blockedBuiltIns(db) {
  if (blockedCache && blockedCache.until > Date.now()) return blockedCache.slugs;
  await ensureSchema(db);
  const { results } = await db.prepare("SELECT slug FROM hub_builtin_changes WHERE deleted = 1 OR visible = 0").all();
  const slugs = new Set((results || []).map((row) => row.slug));
  blockedCache = { slugs, until: Date.now() + 15000 };
  return slugs;
}

// The built-in game a file under public/projects/ belongs to, if any.
// "Crystal Seeker 3D.html" -> "Crystal Seeker 3D"; Eaglercraft's launcher
// and runtime folders -> "eaglercraft-launcher".
const FILE_OWNERS = { "eaglercraft-runtime": "eaglercraft-launcher", "Eaglercraft-Launcher-main": "eaglercraft-launcher" };
export function builtInForFile(repoPath) {
  const rest = String(repoPath || "").replace(/^public\/projects\//, "");
  if (!rest || rest === repoPath) return null;
  const first = rest.split("/")[0];
  const name = first.replace(/\.html$/i, "");
  if (FILE_OWNERS[name]) return FILE_OWNERS[name];
  return isBuiltInSlug(name) ? name : null;
}

// True when `repoPath` is a file of a hidden or deleted built-in game.
// Storage problems never block games (they fail open).
export async function isBlockedFile(db, repoPath) {
  const slug = builtInForFile(repoPath);
  if (!slug || !db) return false;
  const blocked = await blockedBuiltIns(db).catch(() => null);
  return Boolean(blocked && blocked.has(slug));
}

// A project's HTML as inert text: the play page runs it inside a sandboxed
// frame (components/HubProjectFrame.js). Served as text/plain with a
// sandbox CSP and nosniff, so opening the URL directly can never run it on
// this site's origin.
export function projectHtmlResponse(html, cacheControl) {
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": cacheControl,
    },
  });
}
